package handler

import (
	"crypto/rand"
	"fmt"
	"log/slog"
	"math/big"
	"net/http"
	"net/mail"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/bcrypt"

	"github.com/ksushant6566/mindtab/server/internal/auth"
	"github.com/ksushant6566/mindtab/server/internal/email"
	"github.com/ksushant6566/mindtab/server/internal/store"
)

const bcryptCost = 10

type EmailAuthHandler struct {
	queries   store.Querier
	pool      *pgxpool.Pool
	jwtSecret string
	email     *email.Service
}

func NewEmailAuthHandler(queries store.Querier, pool *pgxpool.Pool, jwtSecret string, emailService *email.Service) *EmailAuthHandler {
	return &EmailAuthHandler{
		queries:   queries,
		pool:      pool,
		jwtSecret: jwtSecret,
		email:     emailService,
	}
}

func generateCode() (string, error) {
	n, err := rand.Int(rand.Reader, big.NewInt(1000000))
	if err != nil {
		return "", err
	}
	return fmt.Sprintf("%06d", n.Int64()), nil
}

// Signup handles POST /auth/email/signup.
func (h *EmailAuthHandler) Signup(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Email    string `json:"email"`
		Password string `json:"password"`
		Name     string `json:"name"`
	}
	if err := ReadJSON(r, &req); err != nil {
		WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	// Validate email format.
	if _, err := mail.ParseAddress(req.Email); err != nil {
		WriteError(w, http.StatusBadRequest, "invalid email format")
		return
	}

	// Validate password length.
	if len(req.Password) < 8 {
		WriteError(w, http.StatusBadRequest, "password must be at least 8 characters")
		return
	}

	// Check if user with this email already exists.
	var userID string
	existingUser, err := h.queries.GetUserByEmail(r.Context(), req.Email)
	if err == nil {
		// User exists.
		if existingUser.PasswordHash.Valid {
			WriteError(w, http.StatusConflict, "account already exists")
			return
		}
		// Google user — will link account after verification.
		userID = existingUser.ID
	} else {
		// New user — create with NULL email_verified.
		newID := uuid.New().String()
		newUser, createErr := h.queries.CreateEmailUser(r.Context(), store.CreateEmailUserParams{
			ID:    newID,
			Name:  pgtype.Text{String: req.Name, Valid: req.Name != ""},
			Email: req.Email,
		})
		if createErr != nil {
			slog.Error("failed to create user", "error", createErr)
			WriteError(w, http.StatusInternalServerError, "failed to create account")
			return
		}
		userID = newUser.ID
	}

	// Hash password (stored in verification token, applied on verify).
	passwordHash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcryptCost)
	if err != nil {
		slog.Error("failed to hash password", "error", err)
		WriteError(w, http.StatusInternalServerError, "failed to create account")
		return
	}

	// Delete any existing verification tokens for this user.
	_ = h.queries.DeleteVerificationTokensByUserAndType(r.Context(), store.DeleteVerificationTokensByUserAndTypeParams{
		UserID: userID,
		Type:   "email_verification",
	})

	// Generate 6-digit code.
	code, err := generateCode()
	if err != nil {
		slog.Error("failed to generate code", "error", err)
		WriteError(w, http.StatusInternalServerError, "failed to create account")
		return
	}

	// Store token with pending password hash.
	tokenHash := auth.HashToken(code)
	err = h.queries.CreateVerificationToken(r.Context(), store.CreateVerificationTokenParams{
		UserID:       userID,
		TokenHash:    tokenHash,
		Type:         "email_verification",
		PasswordHash: pgtype.Text{String: string(passwordHash), Valid: true},
		ExpiresAt:    pgtype.Timestamptz{Time: time.Now().Add(24 * time.Hour), Valid: true},
	})
	if err != nil {
		slog.Error("failed to store verification token", "error", err)
		WriteError(w, http.StatusInternalServerError, "failed to create account")
		return
	}

	// Send verification email.
	if err := h.email.SendVerificationCode(req.Email, code); err != nil {
		slog.Error("failed to send verification email", "error", err)
		WriteError(w, http.StatusInternalServerError, "failed to send verification email")
		return
	}

	WriteJSON(w, http.StatusOK, map[string]string{
		"message": "verification email sent",
	})
}

// Verify handles POST /auth/email/verify.
func (h *EmailAuthHandler) Verify(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Email string `json:"email"`
		Code  string `json:"code"`
	}
	if err := ReadJSON(r, &req); err != nil {
		WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if req.Email == "" || req.Code == "" {
		WriteError(w, http.StatusBadRequest, "email and code are required")
		return
	}

	// Look up user by email.
	user, err := h.queries.GetUserByEmail(r.Context(), req.Email)
	if err != nil {
		WriteError(w, http.StatusBadRequest, "invalid code")
		return
	}

	// Look up verification token by user + type (not by hash, so we can track attempts on wrong codes).
	token, err := h.queries.GetVerificationTokenByUserAndType(r.Context(), store.GetVerificationTokenByUserAndTypeParams{
		UserID: user.ID,
		Type:   "email_verification",
	})
	if err != nil {
		WriteError(w, http.StatusBadRequest, "no pending verification, please sign up again")
		return
	}

	// Check attempts.
	if token.Attempts >= 5 {
		_ = h.queries.DeleteVerificationToken(r.Context(), token.ID)
		WriteError(w, http.StatusBadRequest, "too many attempts, please request a new code")
		return
	}

	// Compare the submitted code hash against the stored hash.
	codeHash := auth.HashToken(req.Code)
	if codeHash != token.TokenHash {
		_ = h.queries.IncrementVerificationAttempts(r.Context(), token.ID)
		WriteError(w, http.StatusBadRequest, "invalid code")
		return
	}

	// Use a transaction for: set password hash + set email verified + delete token.
	tx, err := h.pool.Begin(r.Context())
	if err != nil {
		slog.Error("failed to begin transaction", "error", err)
		WriteError(w, http.StatusInternalServerError, "verification failed")
		return
	}
	defer tx.Rollback(r.Context())

	qtx := h.queries.(*store.Queries).WithTx(tx)

	// Apply pending password hash to user.
	if token.PasswordHash.Valid {
		if err := qtx.SetPasswordHash(r.Context(), store.SetPasswordHashParams{
			ID:           user.ID,
			PasswordHash: pgtype.Text{String: token.PasswordHash.String, Valid: true},
		}); err != nil {
			slog.Error("failed to set password hash", "error", err)
			WriteError(w, http.StatusInternalServerError, "verification failed")
			return
		}
	}

	// Set email as verified.
	if err := qtx.SetEmailVerified(r.Context(), user.ID); err != nil {
		slog.Error("failed to set email verified", "error", err)
		WriteError(w, http.StatusInternalServerError, "verification failed")
		return
	}

	// Delete used token.
	_ = qtx.DeleteVerificationToken(r.Context(), token.ID)

	if err := tx.Commit(r.Context()); err != nil {
		slog.Error("failed to commit transaction", "error", err)
		WriteError(w, http.StatusInternalServerError, "verification failed")
		return
	}

	// Re-fetch user to get updated fields.
	user, err = h.queries.GetUserByID(r.Context(), user.ID)
	if err != nil {
		slog.Error("failed to get user", "error", err)
		WriteError(w, http.StatusInternalServerError, "verification failed")
		return
	}

	// Issue tokens (same as Google login flow).
	accessToken, err := auth.GenerateAccessToken(h.jwtSecret, user.ID, user.Email)
	if err != nil {
		slog.Error("failed to generate access token", "error", err)
		WriteError(w, http.StatusInternalServerError, "failed to generate token")
		return
	}

	rawRefresh, hashRefresh, err := auth.GenerateRefreshToken()
	if err != nil {
		slog.Error("failed to generate refresh token", "error", err)
		WriteError(w, http.StatusInternalServerError, "failed to generate token")
		return
	}

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

	WriteJSON(w, http.StatusOK, mobileAuthResponse{
		AccessToken:  accessToken,
		RefreshToken: rawRefresh,
		User:         toUserJSON(user),
	})
}

// Signin handles POST /auth/email/signin.
func (h *EmailAuthHandler) Signin(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if err := ReadJSON(r, &req); err != nil {
		WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if req.Email == "" || req.Password == "" {
		WriteError(w, http.StatusBadRequest, "email and password are required")
		return
	}

	// Look up user.
	user, err := h.queries.GetUserByEmail(r.Context(), req.Email)
	if err != nil {
		WriteError(w, http.StatusUnauthorized, "invalid email or password")
		return
	}

	// Check user has a password set.
	if !user.PasswordHash.Valid {
		WriteError(w, http.StatusUnauthorized, "invalid email or password")
		return
	}

	// Verify password.
	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash.String), []byte(req.Password)); err != nil {
		WriteError(w, http.StatusUnauthorized, "invalid email or password")
		return
	}

	// Check email is verified.
	if !user.EmailVerified.Valid {
		WriteError(w, http.StatusForbidden, "please verify your email before signing in")
		return
	}

	// Issue tokens.
	accessToken, err := auth.GenerateAccessToken(h.jwtSecret, user.ID, user.Email)
	if err != nil {
		slog.Error("failed to generate access token", "error", err)
		WriteError(w, http.StatusInternalServerError, "failed to generate token")
		return
	}

	rawRefresh, hashRefresh, err := auth.GenerateRefreshToken()
	if err != nil {
		slog.Error("failed to generate refresh token", "error", err)
		WriteError(w, http.StatusInternalServerError, "failed to generate token")
		return
	}

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

	WriteJSON(w, http.StatusOK, mobileAuthResponse{
		AccessToken:  accessToken,
		RefreshToken: rawRefresh,
		User:         toUserJSON(user),
	})
}

// ForgotPassword handles POST /auth/email/forgot-password.
func (h *EmailAuthHandler) ForgotPassword(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Email string `json:"email"`
	}
	if err := ReadJSON(r, &req); err != nil {
		WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	// Always return success to prevent user enumeration.
	defer func() {
		WriteJSON(w, http.StatusOK, map[string]string{
			"message": "if an account exists, a reset email has been sent",
		})
	}()

	if req.Email == "" {
		return
	}

	user, err := h.queries.GetUserByEmail(r.Context(), req.Email)
	if err != nil || !user.PasswordHash.Valid {
		return
	}

	// Delete existing reset tokens.
	_ = h.queries.DeleteVerificationTokensByUserAndType(r.Context(), store.DeleteVerificationTokensByUserAndTypeParams{
		UserID: user.ID,
		Type:   "password_reset",
	})

	code, err := generateCode()
	if err != nil {
		slog.Error("failed to generate reset code", "error", err)
		return
	}

	tokenHash := auth.HashToken(code)
	err = h.queries.CreateVerificationToken(r.Context(), store.CreateVerificationTokenParams{
		UserID:    user.ID,
		TokenHash: tokenHash,
		Type:      "password_reset",
		ExpiresAt: pgtype.Timestamptz{Time: time.Now().Add(15 * time.Minute), Valid: true},
	})
	if err != nil {
		slog.Error("failed to store reset token", "error", err)
		return
	}

	if err := h.email.SendPasswordResetCode(req.Email, code); err != nil {
		slog.Error("failed to send reset email", "error", err)
	}
}

// ResetPassword handles POST /auth/email/reset-password.
func (h *EmailAuthHandler) ResetPassword(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Email       string `json:"email"`
		Code        string `json:"code"`
		NewPassword string `json:"newPassword"`
	}
	if err := ReadJSON(r, &req); err != nil {
		WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if req.Email == "" || req.Code == "" || req.NewPassword == "" {
		WriteError(w, http.StatusBadRequest, "email, code, and newPassword are required")
		return
	}

	if len(req.NewPassword) < 8 {
		WriteError(w, http.StatusBadRequest, "password must be at least 8 characters")
		return
	}

	// Look up user.
	user, err := h.queries.GetUserByEmail(r.Context(), req.Email)
	if err != nil {
		WriteError(w, http.StatusBadRequest, "invalid code")
		return
	}

	// Look up reset token by user + type.
	token, err := h.queries.GetVerificationTokenByUserAndType(r.Context(), store.GetVerificationTokenByUserAndTypeParams{
		UserID: user.ID,
		Type:   "password_reset",
	})
	if err != nil {
		WriteError(w, http.StatusBadRequest, "invalid or expired code")
		return
	}

	if token.Attempts >= 5 {
		_ = h.queries.DeleteVerificationToken(r.Context(), token.ID)
		WriteError(w, http.StatusBadRequest, "too many attempts, please request a new code")
		return
	}

	// Compare code hash.
	codeHash := auth.HashToken(req.Code)
	if codeHash != token.TokenHash {
		_ = h.queries.IncrementVerificationAttempts(r.Context(), token.ID)
		WriteError(w, http.StatusBadRequest, "invalid code")
		return
	}

	// Hash new password.
	newHash, err := bcrypt.GenerateFromPassword([]byte(req.NewPassword), bcryptCost)
	if err != nil {
		slog.Error("failed to hash password", "error", err)
		WriteError(w, http.StatusInternalServerError, "failed to reset password")
		return
	}

	// Update password.
	if err := h.queries.SetPasswordHash(r.Context(), store.SetPasswordHashParams{
		ID:           user.ID,
		PasswordHash: pgtype.Text{String: string(newHash), Valid: true},
	}); err != nil {
		slog.Error("failed to update password", "error", err)
		WriteError(w, http.StatusInternalServerError, "failed to reset password")
		return
	}

	// Invalidate all refresh tokens (force re-login).
	_ = h.queries.DeleteUserRefreshTokens(r.Context(), user.ID)

	// Delete used reset token.
	_ = h.queries.DeleteVerificationToken(r.Context(), token.ID)

	WriteJSON(w, http.StatusOK, map[string]string{
		"message": "password reset successful",
	})
}
