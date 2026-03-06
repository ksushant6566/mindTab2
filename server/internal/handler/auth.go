package handler

import (
	"log/slog"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5/pgtype"

	"github.com/ksushant6566/mindtab/server/internal/auth"
	"github.com/ksushant6566/mindtab/server/internal/store"
)

// AuthHandler handles authentication endpoints.
type AuthHandler struct {
	queries        store.Querier
	jwtSecret      string
	googleClientID string
}

// NewAuthHandler creates a new AuthHandler.
func NewAuthHandler(queries store.Querier, jwtSecret, googleClientID string) *AuthHandler {
	return &AuthHandler{
		queries:        queries,
		jwtSecret:      jwtSecret,
		googleClientID: googleClientID,
	}
}

type googleLoginRequest struct {
	IDToken string `json:"idToken"`
}

type authResponse struct {
	AccessToken string   `json:"accessToken"`
	User        userJSON `json:"user"`
}

type userJSON struct {
	ID                  string `json:"id"`
	Name                string `json:"name"`
	Email               string `json:"email"`
	Image               string `json:"image"`
	Xp                  int32  `json:"xp"`
	OnboardingCompleted bool   `json:"onboardingCompleted"`
}

func toUserJSON(u store.MindmapUser) userJSON {
	return userJSON{
		ID:                  u.ID,
		Name:                u.Name.String,
		Email:               u.Email,
		Image:               u.Image.String,
		Xp:                  u.Xp,
		OnboardingCompleted: u.OnboardingCompleted,
	}
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

	// Verify the Google ID token.
	gUser, err := auth.VerifyGoogleIDToken(r.Context(), req.IDToken, h.googleClientID)
	if err != nil {
		slog.Error("failed to verify Google ID token", "error", err)
		WriteError(w, http.StatusUnauthorized, "invalid Google ID token")
		return
	}

	// Check if a user with this email already exists (handles NextAuth → Go migration
	// where the old user ID differs from the Google sub ID).
	userID := gUser.ID
	existingUser, err := h.queries.GetUserByEmail(r.Context(), gUser.Email)
	if err == nil {
		userID = existingUser.ID
	}

	// Upsert user in DB using the resolved ID.
	user, err := h.queries.UpsertUser(r.Context(), store.UpsertUserParams{
		ID:    userID,
		Name:  pgtype.Text{String: gUser.Name, Valid: gUser.Name != ""},
		Email: gUser.Email,
		Image: pgtype.Text{String: gUser.Picture, Valid: gUser.Picture != ""},
	})
	if err != nil {
		slog.Error("failed to upsert user", "error", err)
		WriteError(w, http.StatusInternalServerError, "failed to create user")
		return
	}

	// Generate access token.
	accessToken, err := auth.GenerateAccessToken(h.jwtSecret, user.ID, user.Email)
	if err != nil {
		slog.Error("failed to generate access token", "error", err)
		WriteError(w, http.StatusInternalServerError, "failed to generate token")
		return
	}

	// Generate refresh token.
	rawRefresh, hashRefresh, err := auth.GenerateRefreshToken()
	if err != nil {
		slog.Error("failed to generate refresh token", "error", err)
		WriteError(w, http.StatusInternalServerError, "failed to generate token")
		return
	}

	// Store refresh token hash in DB.
	expiresAt := time.Now().Add(30 * 24 * time.Hour)
	err = h.queries.CreateRefreshToken(r.Context(), store.CreateRefreshTokenParams{
		UserID:    user.ID,
		TokenHash: hashRefresh,
		ExpiresAt: pgtype.Timestamptz{Time: expiresAt, Valid: true},
	})
	if err != nil {
		slog.Error("failed to store refresh token", "error", err)
		WriteError(w, http.StatusInternalServerError, "failed to store token")
		return
	}

	// Set refresh token as httpOnly cookie.
	http.SetCookie(w, &http.Cookie{
		Name:     "mindtab_refresh",
		Value:    rawRefresh,
		Path:     "/",
		MaxAge:   30 * 24 * 60 * 60, // 30 days
		HttpOnly: true,
		Secure:   true,
		SameSite: http.SameSiteLaxMode,
	})

	WriteJSON(w, http.StatusOK, authResponse{
		AccessToken: accessToken,
		User:        toUserJSON(user),
	})
}

// Refresh handles POST /auth/refresh.
func (h *AuthHandler) Refresh(w http.ResponseWriter, r *http.Request) {
	cookie, err := r.Cookie("mindtab_refresh")
	if err != nil {
		WriteError(w, http.StatusUnauthorized, "missing refresh token")
		return
	}

	// Hash and look up the token.
	oldHash := auth.HashToken(cookie.Value)
	token, err := h.queries.GetRefreshToken(r.Context(), oldHash)
	if err != nil {
		WriteError(w, http.StatusUnauthorized, "invalid or expired refresh token")
		return
	}

	// Delete old refresh token (rotation).
	if err := h.queries.DeleteRefreshToken(r.Context(), oldHash); err != nil {
		slog.Error("failed to delete old refresh token", "error", err)
	}

	// Get user for the new access token.
	user, err := h.queries.GetUserByID(r.Context(), token.UserID)
	if err != nil {
		slog.Error("failed to get user", "error", err)
		WriteError(w, http.StatusInternalServerError, "failed to get user")
		return
	}

	// Generate new access token.
	accessToken, err := auth.GenerateAccessToken(h.jwtSecret, user.ID, user.Email)
	if err != nil {
		slog.Error("failed to generate access token", "error", err)
		WriteError(w, http.StatusInternalServerError, "failed to generate token")
		return
	}

	// Generate new refresh token.
	rawRefresh, hashRefresh, err := auth.GenerateRefreshToken()
	if err != nil {
		slog.Error("failed to generate refresh token", "error", err)
		WriteError(w, http.StatusInternalServerError, "failed to generate token")
		return
	}

	// Store new refresh token.
	expiresAt := time.Now().Add(30 * 24 * time.Hour)
	err = h.queries.CreateRefreshToken(r.Context(), store.CreateRefreshTokenParams{
		UserID:    user.ID,
		TokenHash: hashRefresh,
		ExpiresAt: pgtype.Timestamptz{Time: expiresAt, Valid: true},
	})
	if err != nil {
		slog.Error("failed to store refresh token", "error", err)
		WriteError(w, http.StatusInternalServerError, "failed to store token")
		return
	}

	// Set new cookie.
	http.SetCookie(w, &http.Cookie{
		Name:     "mindtab_refresh",
		Value:    rawRefresh,
		Path:     "/",
		MaxAge:   30 * 24 * 60 * 60,
		HttpOnly: true,
		Secure:   true,
		SameSite: http.SameSiteLaxMode,
	})

	WriteJSON(w, http.StatusOK, map[string]string{
		"accessToken": accessToken,
	})
}
