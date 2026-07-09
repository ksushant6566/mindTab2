package handler

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"fmt"
	"log/slog"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/oauth2"
	"golang.org/x/oauth2/google"

	"github.com/ksushant6566/mindtab/server/internal/auth"
	"github.com/ksushant6566/mindtab/server/internal/middleware"
	"github.com/ksushant6566/mindtab/server/internal/store"
)

// AuthHandler handles authentication endpoints.
type AuthHandler struct {
	queries            store.Querier
	pool               *pgxpool.Pool
	jwtSecret          string
	googleClientID     string
	googleClientSecret string
	apiPublicURL       string
	allowedOrigins     []string
}

// NewAuthHandler creates a new AuthHandler.
func NewAuthHandler(queries store.Querier, pool *pgxpool.Pool, jwtSecret, googleClientID, googleClientSecret, apiPublicURL string, allowedOrigins []string) *AuthHandler {
	return &AuthHandler{
		queries:            queries,
		pool:               pool,
		jwtSecret:          jwtSecret,
		googleClientID:     googleClientID,
		googleClientSecret: googleClientSecret,
		apiPublicURL:       apiPublicURL,
		allowedOrigins:     allowedOrigins,
	}
}

const (
	googleOAuthStateCookie    = "mindtab_oauth_state"
	googleOAuthReturnToCookie = "mindtab_oauth_return_to"
	googleOAuthStartPath      = "/auth/google/start"
	googleOAuthCallbackPath   = "/auth/google/callback"
	googleOAuthWebReturnPath  = "/oauth/google/callback"
	googleAPITimeout          = 10 * time.Second
)

type googleLoginRequest struct {
	IDToken string `json:"idToken"`
}

type authResponse struct {
	AccessToken string   `json:"accessToken"`
	User        userJSON `json:"user"`
}

type issuedAuthSession struct {
	AccessToken  string
	RefreshToken string
	User         store.User
}

type mobileAuthResponse struct {
	AccessToken  string   `json:"accessToken"`
	RefreshToken string   `json:"refreshToken"`
	User         userJSON `json:"user"`
}

type userJSON struct {
	ID                  string `json:"id"`
	Name                string `json:"name"`
	Email               string `json:"email"`
	Image               string `json:"image"`
	OnboardingCompleted bool   `json:"onboardingCompleted"`
	Theme               string `json:"theme"`
	UIFont              string `json:"uiFont"`
	CodeFont            string `json:"codeFont"`
	AppearanceTemplate  string `json:"appearanceTemplate"`
	AccentColor         string `json:"accentColor"`
	BackgroundColor     string `json:"backgroundColor"`
	ForegroundColor     string `json:"foregroundColor"`
	Contrast            int32  `json:"contrast"`
	FontSize            int32  `json:"fontSize"`
	Radius              int32  `json:"radius"`
	WeekStartDay        string `json:"weekStartDay"`
	TimeFormat          string `json:"timeFormat"`
	TimeZone            string `json:"timeZone"`
}

func toUserJSON(u store.User) userJSON {
	return userJSON{
		ID:                  u.ID,
		Name:                u.Name.String,
		Email:               u.Email,
		Image:               u.Image.String,
		OnboardingCompleted: u.OnboardingCompleted,
		Theme:               normalizeUserTheme(u.Theme),
		UIFont:              normalizeUserFont(u.Font),
		CodeFont:            normalizeCodeFont(u.CodeFont),
		AppearanceTemplate:  normalizeAppearanceTemplate(u.AppearanceTemplate),
		AccentColor:         normalizeUserColor(u.AccentColor, "#0169CC"),
		BackgroundColor:     normalizeUserColor(u.BackgroundColor, "#111111"),
		ForegroundColor:     normalizeUserColor(u.ForegroundColor, "#FCFCFC"),
		Contrast:            normalizeIntRange(u.Contrast, 60, 0, 100),
		FontSize:            normalizeIntRange(u.FontSize, 14, 12, 20),
		Radius:              normalizeIntRange(u.Radius, 7, 0, 20),
		WeekStartDay:        normalizeWeekStartDay(u.WeekStartDay),
		TimeFormat:          normalizeTimeFormat(u.TimeFormat),
		TimeZone:            normalizeTimeZone(u.TimeZone),
	}
}

func normalizeUserTheme(theme string) string {
	switch theme {
	case "system", "dark", "light":
		return theme
	case "paper":
		return "light"
	default:
		return "dark"
	}
}

func normalizeUserFont(font string) string {
	switch font {
	case "geist", "inter", "system", "sf-pro", "helvetica", "avenir", "ibm-plex", "roboto", "segoe":
		return font
	case "github", "notion":
		return "system"
	case "codex", "linear", "raycast", "satoshi":
		return "geist"
	default:
		return "geist"
	}
}

func normalizeCodeFont(font string) string {
	switch font {
	case "system-mono", "geist-mono", "sf-mono", "jetbrains", "fira-code", "cascadia", "menlo", "monaco":
		return font
	default:
		return "system-mono"
	}
}

func normalizeAppearanceTemplate(template string) string {
	switch template {
	case "absolutely", "ayu", "catppuccin", "codex", "dracula", "everforest", "github", "gruvbox", "linear", "lobster", "material", "matrix", "monokai", "night-owl", "nord", "notion", "one", "oscurange", "proof", "rose-pine", "sentry", "solarized", "temple", "tokyo-night", "vscode-plus":
		return template
	default:
		return "codex"
	}
}

func normalizeUserColor(color string, fallback string) string {
	if _, ok := normalizeHexColor(color); !ok {
		return fallback
	}
	normalized, _ := normalizeHexColor(color)
	return normalized
}

func normalizeIntRange(value int32, fallback int32, min int32, max int32) int32 {
	if value < min || value > max {
		return fallback
	}
	return value
}

func normalizeWeekStartDay(day string) string {
	switch day {
	case "monday", "sunday", "saturday":
		return day
	default:
		return "monday"
	}
}

func normalizeTimeFormat(format string) string {
	switch format {
	case "12h", "24h":
		return format
	default:
		return "12h"
	}
}

func normalizeTimeZone(timeZone string) string {
	if timeZone == "" || len(timeZone) > 64 {
		return "auto"
	}
	return timeZone
}

func (h *AuthHandler) issueGoogleSession(ctx context.Context, idToken string) (*issuedAuthSession, int, string, error) {
	// Verify the Google ID token.
	verifyCtx, cancelVerify := context.WithTimeout(ctx, googleAPITimeout)
	defer cancelVerify()

	gUser, err := auth.VerifyGoogleIDToken(verifyCtx, idToken, h.googleClientID)
	if err != nil {
		return nil, http.StatusUnauthorized, "invalid Google ID token", fmt.Errorf("failed to verify Google ID token: %w", err)
	}

	// Check if a user with this email already exists (handles NextAuth -> Go migration
	// where the old user ID differs from the Google sub ID).
	userID := gUser.ID
	existingUser, err := h.queries.GetUserByEmail(ctx, gUser.Email)
	if err == nil {
		userID = existingUser.ID
	}

	// Upsert user in DB using the resolved ID.
	user, err := h.queries.UpsertUser(ctx, store.UpsertUserParams{
		ID:    userID,
		Name:  pgtype.Text{String: gUser.Name, Valid: gUser.Name != ""},
		Email: gUser.Email,
		Image: pgtype.Text{String: gUser.Picture, Valid: gUser.Picture != ""},
	})
	if err != nil {
		return nil, http.StatusInternalServerError, "failed to create user", fmt.Errorf("failed to upsert user: %w", err)
	}

	// Generate access token.
	accessToken, err := auth.GenerateAccessToken(h.jwtSecret, user.ID, user.Email)
	if err != nil {
		return nil, http.StatusInternalServerError, "failed to generate token", fmt.Errorf("failed to generate access token: %w", err)
	}

	// Generate refresh token.
	rawRefresh, hashRefresh, err := auth.GenerateRefreshToken()
	if err != nil {
		return nil, http.StatusInternalServerError, "failed to generate token", fmt.Errorf("failed to generate refresh token: %w", err)
	}

	// Store refresh token hash in DB.
	expiresAt := time.Now().Add(30 * 24 * time.Hour)
	err = h.queries.CreateRefreshToken(ctx, store.CreateRefreshTokenParams{
		UserID:    user.ID,
		TokenHash: hashRefresh,
		ExpiresAt: pgtype.Timestamptz{Time: expiresAt, Valid: true},
	})
	if err != nil {
		return nil, http.StatusInternalServerError, "failed to store token", fmt.Errorf("failed to store refresh token: %w", err)
	}

	return &issuedAuthSession{
		AccessToken:  accessToken,
		RefreshToken: rawRefresh,
		User:         user,
	}, http.StatusOK, "", nil
}

// Google handles POST /auth/google.
func (h *AuthHandler) Google(w http.ResponseWriter, r *http.Request) {
	var req googleLoginRequest
	if err := ReadJSON(r, &req); err != nil {
		WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if req.IDToken == "" {
		WriteError(w, http.StatusBadRequest, "idToken is required")
		return
	}

	session, status, publicMessage, err := h.issueGoogleSession(r.Context(), req.IDToken)
	if err != nil {
		slog.Error("failed to issue Google auth session", "error", err)
		WriteError(w, status, publicMessage)
		return
	}

	// Check if mobile client.
	isMobile := r.Header.Get("X-Platform") == "mobile"

	if !isMobile {
		// Set refresh token as httpOnly cookie (web only).
		setRefreshCookie(w, r, session.RefreshToken, 30*24*60*60)
	}

	if isMobile {
		// Mobile clients can't use httpOnly cookies, so include refresh token in body.
		WriteJSON(w, http.StatusOK, mobileAuthResponse{
			AccessToken:  session.AccessToken,
			RefreshToken: session.RefreshToken,
			User:         toUserJSON(session.User),
		})
		return
	}

	WriteJSON(w, http.StatusOK, authResponse{
		AccessToken: session.AccessToken,
		User:        toUserJSON(session.User),
	})
}

// GoogleStart starts the browser-based Google OAuth flow in a top-level tab.
func (h *AuthHandler) GoogleStart(w http.ResponseWriter, r *http.Request) {
	if h.googleClientSecret == "" {
		slog.Error("GOOGLE_CLIENT_SECRET is required for Google OAuth redirect flow")
		WriteError(w, http.StatusInternalServerError, "Google OAuth is not configured")
		return
	}

	if canonicalURL := h.canonicalGoogleOAuthStartURL(r); canonicalURL != "" {
		http.Redirect(w, r, canonicalURL, http.StatusFound)
		return
	}

	returnTo, err := h.validateOAuthReturnTo(r.URL.Query().Get("return_to"))
	if err != nil {
		WriteError(w, http.StatusBadRequest, "invalid return_to URL")
		return
	}

	state, err := randomURLToken(32)
	if err != nil {
		slog.Error("failed to generate OAuth state", "error", err)
		WriteError(w, http.StatusInternalServerError, "failed to start Google sign in")
		return
	}

	setOAuthCookie(w, r, googleOAuthStateCookie, state, 10*60)
	setOAuthCookie(w, r, googleOAuthReturnToCookie, base64.RawURLEncoding.EncodeToString([]byte(returnTo)), 10*60)

	authURL := h.googleOAuthConfig(r).AuthCodeURL(
		state,
		oauth2.SetAuthURLParam("prompt", "select_account"),
	)
	http.Redirect(w, r, authURL, http.StatusFound)
}

// GoogleCallback completes the browser-based Google OAuth flow.
func (h *AuthHandler) GoogleCallback(w http.ResponseWriter, r *http.Request) {
	returnTo := h.returnToFromCookie(r)

	if errValue := r.URL.Query().Get("error"); errValue != "" {
		h.redirectToOAuthReturn(w, r, returnTo, "error", errValue)
		return
	}

	state := r.URL.Query().Get("state")
	stateCookie, err := r.Cookie(googleOAuthStateCookie)
	if err != nil || state == "" || stateCookie.Value != state {
		h.redirectToOAuthReturn(w, r, returnTo, "error", "invalid_state")
		return
	}

	code := r.URL.Query().Get("code")
	if code == "" {
		h.redirectToOAuthReturn(w, r, returnTo, "error", "missing_code")
		return
	}

	exchangeCtx, cancelExchange := context.WithTimeout(r.Context(), googleAPITimeout)
	defer cancelExchange()

	token, err := h.googleOAuthConfig(r).Exchange(exchangeCtx, code)
	if err != nil {
		slog.Error("failed to exchange Google OAuth code", "error", err)
		h.redirectToOAuthReturn(w, r, returnTo, "error", "code_exchange_failed")
		return
	}

	idToken, ok := token.Extra("id_token").(string)
	if !ok || idToken == "" {
		slog.Error("Google OAuth response did not include an ID token")
		h.redirectToOAuthReturn(w, r, returnTo, "error", "missing_id_token")
		return
	}

	session, _, _, err := h.issueGoogleSession(r.Context(), idToken)
	if err != nil {
		slog.Error("failed to issue Google auth session from OAuth callback", "error", err)
		h.redirectToOAuthReturn(w, r, returnTo, "error", "session_failed")
		return
	}

	setRefreshCookie(w, r, session.RefreshToken, 30*24*60*60)
	h.redirectToOAuthReturn(w, r, returnTo, "status", "success")
}

func (h *AuthHandler) canonicalGoogleOAuthStartURL(r *http.Request) string {
	if h.apiPublicURL == "" {
		return ""
	}

	apiURL, err := url.Parse(h.apiPublicURL)
	if err != nil || !apiURL.IsAbs() || apiURL.Host == "" {
		return ""
	}

	requestURL, err := url.Parse(publicURLForRequest(r, googleOAuthStartPath))
	if err != nil || requestURL.Host == "" {
		return ""
	}
	if strings.EqualFold(requestURL.Scheme, apiURL.Scheme) && strings.EqualFold(requestURL.Host, apiURL.Host) {
		return ""
	}

	apiURL.Path = googleOAuthStartPath
	apiURL.RawQuery = r.URL.RawQuery
	apiURL.Fragment = ""
	return apiURL.String()
}

func (h *AuthHandler) googleOAuthConfig(r *http.Request) *oauth2.Config {
	return &oauth2.Config{
		ClientID:     h.googleClientID,
		ClientSecret: h.googleClientSecret,
		RedirectURL:  h.googleOAuthCallbackURL(r),
		Scopes:       []string{"openid", "email", "profile"},
		Endpoint:     google.Endpoint,
	}
}

func (h *AuthHandler) googleOAuthCallbackURL(r *http.Request) string {
	if h.apiPublicURL != "" {
		u, err := url.Parse(h.apiPublicURL)
		if err == nil && u.IsAbs() && u.Host != "" {
			u.Path = googleOAuthCallbackPath
			u.RawQuery = ""
			u.Fragment = ""
			return u.String()
		}
		slog.Warn("ignoring invalid API_PUBLIC_URL", "apiPublicURL", h.apiPublicURL)
	}

	return publicURLForRequest(r, googleOAuthCallbackPath)
}

func (h *AuthHandler) validateOAuthReturnTo(raw string) (string, error) {
	if raw == "" {
		return h.defaultOAuthReturnTo(), nil
	}

	u, err := url.Parse(raw)
	if err != nil || !u.IsAbs() || u.Host == "" {
		return "", fmt.Errorf("invalid return URL")
	}
	if u.Path != googleOAuthWebReturnPath {
		return "", fmt.Errorf("return URL must use %s", googleOAuthWebReturnPath)
	}

	origin := u.Scheme + "://" + u.Host
	for _, allowed := range h.allowedOrigins {
		if strings.EqualFold(origin, strings.TrimRight(allowed, "/")) {
			return u.String(), nil
		}
	}

	return "", fmt.Errorf("return URL origin is not allowed")
}

func (h *AuthHandler) defaultOAuthReturnTo() string {
	for _, origin := range h.allowedOrigins {
		origin = strings.TrimRight(origin, "/")
		if strings.Contains(origin, "app.mindtab.in") {
			return origin + googleOAuthWebReturnPath
		}
	}
	if len(h.allowedOrigins) > 0 {
		return strings.TrimRight(h.allowedOrigins[0], "/") + googleOAuthWebReturnPath
	}
	return "https://app.mindtab.in" + googleOAuthWebReturnPath
}

func (h *AuthHandler) returnToFromCookie(r *http.Request) string {
	cookie, err := r.Cookie(googleOAuthReturnToCookie)
	if err != nil {
		return h.defaultOAuthReturnTo()
	}

	decoded, err := base64.RawURLEncoding.DecodeString(cookie.Value)
	if err != nil {
		return h.defaultOAuthReturnTo()
	}

	returnTo, err := h.validateOAuthReturnTo(string(decoded))
	if err != nil {
		return h.defaultOAuthReturnTo()
	}
	return returnTo
}

func (h *AuthHandler) redirectToOAuthReturn(w http.ResponseWriter, r *http.Request, returnTo, key, value string) {
	clearOAuthCookies(w, r)

	u, err := url.Parse(returnTo)
	if err != nil {
		u, _ = url.Parse(h.defaultOAuthReturnTo())
	}
	q := u.Query()
	q.Set(key, value)
	u.RawQuery = q.Encode()
	http.Redirect(w, r, u.String(), http.StatusFound)
}

func publicURLForRequest(r *http.Request, path string) string {
	proto := r.Header.Get("X-Forwarded-Proto")
	if proto == "" {
		if r.TLS != nil {
			proto = "https"
		} else {
			proto = "http"
		}
	}

	host := r.Header.Get("X-Forwarded-Host")
	if host == "" {
		host = r.Host
	}

	u := url.URL{
		Scheme: proto,
		Host:   host,
		Path:   path,
	}
	return u.String()
}

func randomURLToken(bytes int) (string, error) {
	buf := make([]byte, bytes)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(buf), nil
}

func setOAuthCookie(w http.ResponseWriter, r *http.Request, name, value string, maxAge int) {
	http.SetCookie(w, &http.Cookie{
		Name:     name,
		Value:    value,
		Path:     "/auth/google",
		MaxAge:   maxAge,
		HttpOnly: true,
		Secure:   isSecureRequest(r),
		SameSite: http.SameSiteLaxMode,
	})
}

func clearOAuthCookies(w http.ResponseWriter, r *http.Request) {
	setOAuthCookie(w, r, googleOAuthStateCookie, "", -1)
	setOAuthCookie(w, r, googleOAuthReturnToCookie, "", -1)
}

func setRefreshCookie(w http.ResponseWriter, _ *http.Request, value string, maxAge int) {
	http.SetCookie(w, &http.Cookie{
		Name:     "mindtab_refresh",
		Value:    value,
		Path:     "/",
		MaxAge:   maxAge,
		HttpOnly: true,
		Secure:   true,
		SameSite: http.SameSiteLaxMode,
	})
}

func clearRefreshCookie(w http.ResponseWriter, r *http.Request) {
	setRefreshCookie(w, r, "", -1)
}

func isSecureRequest(r *http.Request) bool {
	if strings.EqualFold(r.Header.Get("X-Forwarded-Proto"), "https") {
		return true
	}
	return r.TLS != nil
}

// Refresh handles POST /auth/refresh.
func (h *AuthHandler) Refresh(w http.ResponseWriter, r *http.Request) {
	isMobile := r.Header.Get("X-Platform") == "mobile"

	var rawToken string
	if isMobile {
		// Mobile sends refresh token in request body.
		var req struct {
			RefreshToken string `json:"refreshToken"`
		}
		if err := ReadJSON(r, &req); err != nil || req.RefreshToken == "" {
			WriteError(w, http.StatusUnauthorized, "missing refresh token")
			return
		}
		rawToken = req.RefreshToken
	} else {
		// Web sends refresh token as cookie.
		cookie, err := r.Cookie("mindtab_refresh")
		if err != nil {
			WriteError(w, http.StatusUnauthorized, "missing refresh token")
			return
		}
		rawToken = cookie.Value
	}

	// Hash and look up the token.
	oldHash := auth.HashToken(rawToken)
	token, err := h.queries.GetRefreshToken(r.Context(), oldHash)
	if err != nil {
		WriteError(w, http.StatusUnauthorized, "invalid or expired refresh token")
		return
	}

	// Get user for the new access token (read-only, outside transaction).
	user, err := h.queries.GetUserByID(r.Context(), token.UserID)
	if err != nil {
		slog.Error("failed to get user", "error", err)
		WriteError(w, http.StatusInternalServerError, "failed to get user")
		return
	}

	// Generate new access token (no DB, outside transaction).
	accessToken, err := auth.GenerateAccessToken(h.jwtSecret, user.ID, user.Email)
	if err != nil {
		slog.Error("failed to generate access token", "error", err)
		WriteError(w, http.StatusInternalServerError, "failed to generate token")
		return
	}

	// Generate new refresh token material (no DB, outside transaction).
	rawRefresh, hashRefresh, err := auth.GenerateRefreshToken()
	if err != nil {
		slog.Error("failed to generate refresh token", "error", err)
		WriteError(w, http.StatusInternalServerError, "failed to generate token")
		return
	}

	// Rotate refresh token atomically.
	tx, err := h.pool.Begin(r.Context())
	if err != nil {
		slog.Error("failed to begin transaction", "error", err)
		WriteError(w, http.StatusInternalServerError, "failed to refresh token")
		return
	}
	defer tx.Rollback(r.Context())

	qtx := h.queries.(*store.Queries).WithTx(tx)

	if err := qtx.DeleteRefreshToken(r.Context(), oldHash); err != nil {
		slog.Error("failed to delete old refresh token", "error", err)
		WriteError(w, http.StatusInternalServerError, "failed to refresh token")
		return
	}

	expiresAt := time.Now().Add(30 * 24 * time.Hour)
	err = qtx.CreateRefreshToken(r.Context(), store.CreateRefreshTokenParams{
		UserID:    user.ID,
		TokenHash: hashRefresh,
		ExpiresAt: pgtype.Timestamptz{Time: expiresAt, Valid: true},
	})
	if err != nil {
		slog.Error("failed to store refresh token", "error", err)
		WriteError(w, http.StatusInternalServerError, "failed to store token")
		return
	}

	if err := tx.Commit(r.Context()); err != nil {
		slog.Error("failed to commit refresh token rotation", "error", err)
		WriteError(w, http.StatusInternalServerError, "failed to refresh token")
		return
	}

	if isMobile {
		WriteJSON(w, http.StatusOK, map[string]string{
			"accessToken":  accessToken,
			"refreshToken": rawRefresh,
		})
		return
	}

	// Set new cookie (web).
	setRefreshCookie(w, r, rawRefresh, 30*24*60*60)

	WriteJSON(w, http.StatusOK, map[string]string{
		"accessToken": accessToken,
	})
}

// Logout handles POST /auth/logout.
// Deletes the refresh token from DB so it can no longer be used.
func (h *AuthHandler) Logout(w http.ResponseWriter, r *http.Request) {
	isMobile := r.Header.Get("X-Platform") == "mobile"

	var rawToken string
	if isMobile {
		var req struct {
			RefreshToken string `json:"refreshToken"`
		}
		if err := ReadJSON(r, &req); err != nil || req.RefreshToken == "" {
			// Still return 200 — client already intends to log out.
			WriteJSON(w, http.StatusOK, map[string]string{"message": "logged out"})
			return
		}
		rawToken = req.RefreshToken
	} else {
		cookie, err := r.Cookie("mindtab_refresh")
		if err != nil {
			WriteJSON(w, http.StatusOK, map[string]string{"message": "logged out"})
			return
		}
		rawToken = cookie.Value
	}

	// Delete the specific refresh token.
	tokenHash := auth.HashToken(rawToken)
	if err := h.queries.DeleteRefreshToken(r.Context(), tokenHash); err != nil {
		slog.Error("failed to delete refresh token on logout", "error", err)
	}

	// Clear cookie for web clients.
	if !isMobile {
		clearRefreshCookie(w, r)
	}

	WriteJSON(w, http.StatusOK, map[string]string{"message": "logged out"})
}

// WSTicket handles POST /auth/ws-ticket.
// Issues a short-lived single-use ticket for WebSocket authentication.
// Requires a valid access token (called from protected route group).
func (h *AuthHandler) WSTicket(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())

	raw, hash, err := auth.GenerateRefreshToken() // reuse random token generator
	if err != nil {
		slog.Error("failed to generate ws ticket", "error", err)
		WriteError(w, http.StatusInternalServerError, "failed to generate ticket")
		return
	}

	expiresAt := time.Now().Add(30 * time.Second)
	err = h.queries.CreateRefreshToken(r.Context(), store.CreateRefreshTokenParams{
		UserID:    userID,
		TokenHash: hash,
		ExpiresAt: pgtype.Timestamptz{Time: expiresAt, Valid: true},
	})
	if err != nil {
		slog.Error("failed to store ws ticket", "error", err)
		WriteError(w, http.StatusInternalServerError, "failed to generate ticket")
		return
	}

	WriteJSON(w, http.StatusOK, map[string]string{"ticket": raw})
}
