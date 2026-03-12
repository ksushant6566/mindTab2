# Email Auth Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add email/password signup, signin, verification, and password reset to the mobile app alongside existing Google OAuth.

**Architecture:** New server endpoints under `/auth/email/*` handle signup, verification, signin, and password reset. Passwords are bcrypt-hashed. Verification/reset use 6-digit codes sent via Resend. The mobile app gets new screens in the `(auth)` group. Account linking merges email and Google accounts sharing the same email.

**Tech Stack:** Go + Chi + sqlc + bcrypt + Resend SDK (server), Expo React Native + Zustand (mobile), OpenAPI + openapi-typescript (types)

**Spec:** `docs/superpowers/specs/2026-03-12-email-auth-design.md`

---

## File Structure

### Server — Create

| File | Responsibility |
|------|---------------|
| `server/migrations/000002_email_auth.up.sql` | Add password_hash column, UNIQUE email index, verification_token table |
| `server/migrations/000002_email_auth.down.sql` | Reverse migration |
| `server/internal/store/queries/verification_tokens.sql` | CRUD queries for verification tokens |
| `server/internal/email/resend.go` | Resend SDK wrapper for sending verification/reset emails |
| `server/internal/handler/email_auth.go` | Email auth handler (signup, verify, signin, forgot-password, reset-password) |

### Server — Modify

| File | Change |
|------|--------|
| `server/internal/config/config.go` | Add `ResendAPIKey` field |
| `server/internal/store/queries/users.sql` | Add `CreateEmailUser` and `SetPasswordHash` queries |
| `server/cmd/api/main.go` | Register email auth routes, pass Resend config to handler |
| `server/go.mod` | Add `github.com/resend/resend-go/v2` and `golang.org/x/crypto` (bcrypt) |

### Mobile — Create

| File | Responsibility |
|------|---------------|
| `apps/mobile/app/(auth)/email-signup.tsx` | Email signup form screen |
| `apps/mobile/app/(auth)/email-verify.tsx` | 6-digit verification code screen |
| `apps/mobile/app/(auth)/email-signin.tsx` | Email signin form screen |
| `apps/mobile/app/(auth)/forgot-password.tsx` | Request password reset screen |
| `apps/mobile/app/(auth)/reset-password.tsx` | Enter reset code + new password screen |

### Mobile — Modify

| File | Change |
|------|--------|
| `apps/mobile/app/(auth)/login.tsx` | Add "Sign up with email" / "Sign in with email" buttons |
| `apps/mobile/src/lib/auth.ts` | Add email auth API functions |
| `apps/mobile/src/hooks/use-auth.ts` | Add email auth methods to store |

### API Spec — Modify

| File | Change |
|------|--------|
| `packages/api-spec/openapi.yaml` | Add 5 email auth endpoint definitions + schemas |

---

## Chunk 1: Database & Queries

### Task 1: Create migration files

**Files:**
- Create: `server/migrations/000002_email_auth.up.sql`
- Create: `server/migrations/000002_email_auth.down.sql`

- [ ] **Step 1: Write the up migration**

Create `server/migrations/000002_email_auth.up.sql`:

```sql
-- Add password hash column to user table (nullable — Google-only users won't have one)
ALTER TABLE mindmap_user ADD COLUMN password_hash VARCHAR(255);

-- Enforce email uniqueness (required for account linking)
CREATE UNIQUE INDEX idx_mindmap_user_email ON mindmap_user(email);

-- Verification tokens for email verification and password reset
CREATE TABLE mindmap_verification_token (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR(255) NOT NULL REFERENCES mindmap_user(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) NOT NULL UNIQUE,
    type VARCHAR(50) NOT NULL,
    password_hash VARCHAR(255),
    attempts INTEGER NOT NULL DEFAULT 0,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_verification_token_user_id ON mindmap_verification_token(user_id);
```

- [ ] **Step 2: Write the down migration**

Create `server/migrations/000002_email_auth.down.sql`:

```sql
DROP TABLE IF EXISTS mindmap_verification_token;
DROP INDEX IF EXISTS idx_mindmap_user_email;
ALTER TABLE mindmap_user DROP COLUMN IF EXISTS password_hash;
```

- [ ] **Step 3: Commit**

```bash
git add server/migrations/000002_email_auth.up.sql server/migrations/000002_email_auth.down.sql
git commit -m "feat: add email auth migration (password_hash, verification_token table)"
```

---

### Task 2: Write sqlc queries for verification tokens

**Files:**
- Create: `server/internal/store/queries/verification_tokens.sql`
- Modify: `server/internal/store/queries/users.sql`

- [ ] **Step 1: Create verification token queries**

Create `server/internal/store/queries/verification_tokens.sql`:

```sql
-- name: CreateVerificationToken :exec
INSERT INTO mindmap_verification_token (user_id, token_hash, type, password_hash, expires_at)
VALUES ($1, $2, $3, $4, $5);

-- name: GetVerificationToken :one
SELECT * FROM mindmap_verification_token
WHERE token_hash = $1 AND type = $2 AND expires_at > CURRENT_TIMESTAMP;

-- name: GetVerificationTokenByUserAndType :one
SELECT * FROM mindmap_verification_token
WHERE user_id = $1 AND type = $2 AND expires_at > CURRENT_TIMESTAMP;

-- name: IncrementVerificationAttempts :exec
UPDATE mindmap_verification_token SET attempts = attempts + 1 WHERE id = $1;

-- name: DeleteVerificationToken :exec
DELETE FROM mindmap_verification_token WHERE id = $1;

-- name: DeleteVerificationTokensByUserAndType :exec
DELETE FROM mindmap_verification_token WHERE user_id = $1 AND type = $2;

-- name: DeleteExpiredVerificationTokens :exec
DELETE FROM mindmap_verification_token WHERE expires_at <= CURRENT_TIMESTAMP;
```

- [ ] **Step 2: Add user queries for email auth**

Append to `server/internal/store/queries/users.sql`:

```sql
-- name: CreateEmailUser :one
INSERT INTO mindmap_user (id, name, email, email_verified)
VALUES ($1, $2, $3, NULL)
RETURNING *;

-- name: SetPasswordHash :exec
UPDATE mindmap_user SET password_hash = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $1;

-- name: SetEmailVerified :exec
UPDATE mindmap_user SET email_verified = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = $1;
```

- [ ] **Step 3: Run sqlc generate**

Run: `cd server && sqlc generate`

Expected: No errors. New files generated in `server/internal/store/`:
- `verification_tokens.sql.go` (new)
- `users.sql.go` (updated with new queries)
- `models.go` (updated — `MindmapUser` gains `PasswordHash` field, new `MindmapVerificationToken` model)
- `querier.go` (updated with new methods)

- [ ] **Step 4: Verify the generated code compiles**

Run: `cd server && go build ./...`

Expected: Build succeeds. If there are compile errors from the new `PasswordHash` field on `MindmapUser`, that's expected — the `toUserJSON` function in `handler/auth.go` doesn't reference it, so it should still compile. Verify and fix if needed.

- [ ] **Step 5: Commit**

```bash
git add server/internal/store/queries/verification_tokens.sql server/internal/store/queries/users.sql server/internal/store/
git commit -m "feat: add sqlc queries for verification tokens and email user creation"
```

---

## Chunk 2: Server Email Service & Config

### Task 3: Add Resend dependency and email service

**Files:**
- Modify: `server/go.mod`
- Create: `server/internal/email/resend.go`

- [ ] **Step 1: Add Go dependencies**

Run: `cd server && go get github.com/resend/resend-go/v2 && go get golang.org/x/crypto/bcrypt`

- [ ] **Step 2: Create the email service**

Create `server/internal/email/resend.go`:

```go
package email

import (
	"fmt"

	"github.com/resend/resend-go/v2"
)

const fromAddress = "MindTab <noreply@mindtab.in>"

type Service struct {
	client *resend.Client
}

func NewService(apiKey string) *Service {
	return &Service{client: resend.NewClient(apiKey)}
}

func (s *Service) SendVerificationCode(to, code string) error {
	_, err := s.client.Emails.Send(&resend.SendEmailRequest{
		From:    fromAddress,
		To:      []string{to},
		Subject: "Verify your MindTab account",
		Text:    fmt.Sprintf("Your verification code is: %s\n\nIt expires in 24 hours.", code),
	})
	return err
}

func (s *Service) SendPasswordResetCode(to, code string) error {
	_, err := s.client.Emails.Send(&resend.SendEmailRequest{
		From:    fromAddress,
		To:      []string{to},
		Subject: "Reset your MindTab password",
		Text:    fmt.Sprintf("Your password reset code is: %s\n\nIt expires in 15 minutes.", code),
	})
	return err
}
```

- [ ] **Step 3: Verify it compiles**

Run: `cd server && go build ./internal/email/...`

Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add server/go.mod server/go.sum server/internal/email/resend.go
git commit -m "feat: add Resend email service for verification and reset codes"
```

---

### Task 4: Add ResendAPIKey to config

**Files:**
- Modify: `server/internal/config/config.go`

- [ ] **Step 1: Add ResendAPIKey field and load it**

In `server/internal/config/config.go`, add `ResendAPIKey string` to the `Config` struct and load it in `Load()`:

```go
type Config struct {
	Port           string
	DatabaseURL    string
	JWTSecret      string
	GoogleClientID string
	ResendAPIKey   string
	AllowedOrigins []string
	StaticDir      string
}
```

In `Load()`, after the existing env reads, add:

```go
ResendAPIKey: os.Getenv("RESEND_API_KEY"),
```

Add validation after the GoogleClientID check:

```go
if cfg.ResendAPIKey == "" {
    return nil, fmt.Errorf("RESEND_API_KEY is required")
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd server && go build ./...`

Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add server/internal/config/config.go
git commit -m "feat: add RESEND_API_KEY to server config"
```

---

## Chunk 3: Server Email Auth Handler & Routes

### Task 5: Create email auth handler

**Files:**
- Create: `server/internal/handler/email_auth.go`

- [ ] **Step 1: Create the email auth handler file**

Create `server/internal/handler/email_auth.go`:

```go
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
```

- [ ] **Step 2: Verify it compiles**

Run: `cd server && go build ./internal/handler/...`

Expected: Build succeeds. If there are import issues, check that `store.SetPasswordHashParams` and `store.CreateVerificationTokenParams` exist in the sqlc-generated code. If not, revisit Task 2 and re-run `sqlc generate`.

- [ ] **Step 3: Commit**

```bash
git add server/internal/handler/email_auth.go
git commit -m "feat: add email auth handler (signup, verify, signin, forgot/reset password)"
```

---

### Task 6: Register email auth routes

**Files:**
- Modify: `server/cmd/api/main.go`

- [ ] **Step 1: Add email import and initialize handler**

In `server/cmd/api/main.go`, add to the imports:

```go
"github.com/ksushant6566/mindtab/server/internal/email"
```

After the existing `authHandler` initialization (line 48), add:

```go
emailService := email.NewService(cfg.ResendAPIKey)
emailAuthHandler := handler.NewEmailAuthHandler(queries, pool, cfg.JWTSecret, emailService)
```

- [ ] **Step 2: Register email auth routes**

After the existing public routes (`r.Post("/auth/refresh", ...)` on line 75), add:

```go
r.Post("/auth/email/signup", emailAuthHandler.Signup)
r.Post("/auth/email/verify", emailAuthHandler.Verify)
r.Post("/auth/email/signin", emailAuthHandler.Signin)
r.Post("/auth/email/forgot-password", emailAuthHandler.ForgotPassword)
r.Post("/auth/email/reset-password", emailAuthHandler.ResetPassword)
```

- [ ] **Step 3: Verify it compiles**

Run: `cd server && go build ./...`

Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add server/cmd/api/main.go
git commit -m "feat: register email auth routes"
```

---

## Chunk 4: OpenAPI Spec & Type Generation

### Task 7: Update OpenAPI spec with email auth endpoints

**Files:**
- Modify: `packages/api-spec/openapi.yaml`

- [ ] **Step 1: Add email auth endpoints to the paths section**

In `packages/api-spec/openapi.yaml`, after the `/auth/refresh` block (around line 98), add:

```yaml
  /auth/email/signup:
    post:
      operationId: authEmailSignup
      tags: [Auth]
      summary: Sign up with email and password
      security: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [email, password, name]
              properties:
                email:
                  type: string
                  format: email
                password:
                  type: string
                  minLength: 8
                name:
                  type: string
      responses:
        "200":
          description: Verification email sent
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/MessageResponse"
        "400":
          $ref: "#/components/responses/ValidationError"
        "409":
          description: Account already exists
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/Error"

  /auth/email/verify:
    post:
      operationId: authEmailVerify
      tags: [Auth]
      summary: Verify email with 6-digit code
      security: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [email, code]
              properties:
                email:
                  type: string
                  format: email
                code:
                  type: string
      responses:
        "200":
          description: Email verified, tokens issued
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/MobileAuthResponse"
        "400":
          $ref: "#/components/responses/ValidationError"

  /auth/email/signin:
    post:
      operationId: authEmailSignin
      tags: [Auth]
      summary: Sign in with email and password
      security: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [email, password]
              properties:
                email:
                  type: string
                  format: email
                password:
                  type: string
      responses:
        "200":
          description: Authentication successful
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/MobileAuthResponse"
        "401":
          description: Invalid credentials
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/Error"
        "403":
          description: Email not verified
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/Error"

  /auth/email/forgot-password:
    post:
      operationId: authEmailForgotPassword
      tags: [Auth]
      summary: Request password reset code
      security: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [email]
              properties:
                email:
                  type: string
                  format: email
      responses:
        "200":
          description: Reset email sent (if account exists)
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/MessageResponse"

  /auth/email/reset-password:
    post:
      operationId: authEmailResetPassword
      tags: [Auth]
      summary: Reset password with code
      security: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [email, code, newPassword]
              properties:
                email:
                  type: string
                  format: email
                code:
                  type: string
                newPassword:
                  type: string
                  minLength: 8
      responses:
        "200":
          description: Password reset successful
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/MessageResponse"
        "400":
          $ref: "#/components/responses/ValidationError"
```

- [ ] **Step 2: Add new schemas to the components section**

In the `components.schemas` section, after the `AuthResponse` schema (around line 1078), add:

```yaml
    MobileAuthResponse:
      type: object
      required: [accessToken, refreshToken, user]
      properties:
        accessToken:
          type: string
        refreshToken:
          type: string
        user:
          $ref: "#/components/schemas/User"

    MessageResponse:
      type: object
      required: [message]
      properties:
        message:
          type: string
```

- [ ] **Step 3: Regenerate TypeScript types**

Run: `cd packages/api-spec && pnpm build`

Expected: Types regenerated in `packages/api-spec/dist/api-types.ts` with new operation types.

- [ ] **Step 4: Commit**

```bash
git add packages/api-spec/openapi.yaml packages/api-spec/dist/api-types.ts
git commit -m "feat: add email auth endpoints to OpenAPI spec"
```

---

## Chunk 5: Mobile Auth Logic

### Task 8: Add email auth API functions

**Files:**
- Modify: `apps/mobile/src/lib/auth.ts`

- [ ] **Step 1: Add email auth functions to auth.ts**

Append the following functions to `apps/mobile/src/lib/auth.ts`:

```typescript
export async function emailSignup(email: string, password: string, name: string): Promise<void> {
  const res = await fetch(`${API_URL}/auth/email/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Platform": "mobile" },
    body: JSON.stringify({ email, password, name }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "Signup failed");
  }
}

export async function emailVerify(
  email: string,
  code: string
): Promise<{ accessToken: string; refreshToken: string; user: any }> {
  const res = await fetch(`${API_URL}/auth/email/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Platform": "mobile" },
    body: JSON.stringify({ email, code }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "Verification failed");
  }

  return res.json();
}

export async function emailSignin(
  email: string,
  password: string
): Promise<{ accessToken: string; refreshToken: string; user: any }> {
  const res = await fetch(`${API_URL}/auth/email/signin`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Platform": "mobile" },
    body: JSON.stringify({ email, password }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "Sign in failed");
  }

  return res.json();
}

export async function forgotPassword(email: string): Promise<void> {
  const res = await fetch(`${API_URL}/auth/email/forgot-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Platform": "mobile" },
    body: JSON.stringify({ email }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "Request failed");
  }
}

export async function resetPassword(email: string, code: string, newPassword: string): Promise<void> {
  const res = await fetch(`${API_URL}/auth/email/reset-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Platform": "mobile" },
    body: JSON.stringify({ email, code, newPassword }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "Password reset failed");
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/mobile/src/lib/auth.ts
git commit -m "feat: add email auth API functions to mobile"
```

---

### Task 9: Update auth hook with email methods

**Files:**
- Modify: `apps/mobile/src/hooks/use-auth.ts`

- [ ] **Step 1: Add email auth imports**

In `apps/mobile/src/hooks/use-auth.ts`, update the imports from `~/lib/auth` to include the new functions:

```typescript
import {
  getRefreshToken,
  setAccessToken,
  setRefreshToken,
  clearTokens,
  refreshTokens,
  emailSignup as emailSignupApi,
  emailVerify as emailVerifyApi,
  emailSignin as emailSigninApi,
  forgotPassword as forgotPasswordApi,
  resetPassword as resetPasswordApi,
} from "~/lib/auth";
```

- [ ] **Step 2: Add methods to AuthState type**

Update the `AuthState` type to include new methods:

```typescript
type AuthState = {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  _hasChecked: boolean;
  _refreshSession: () => Promise<void>;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  emailSignup: (email: string, password: string, name: string) => Promise<void>;
  emailVerify: (email: string, code: string) => Promise<void>;
  emailSignin: (email: string, password: string) => Promise<void>;
  forgotPassword: (email: string) => Promise<void>;
  resetPassword: (email: string, code: string, newPassword: string) => Promise<void>;
};
```

- [ ] **Step 3: Add method implementations to the Zustand store**

Add these methods inside the `create<AuthState>((set) => ({` block, after the `logout` method:

```typescript
  emailSignup: async (email: string, password: string, name: string) => {
    await emailSignupApi(email, password, name);
  },

  emailVerify: async (email: string, code: string) => {
    const data = await emailVerifyApi(email, code);
    await setAccessToken(data.accessToken);
    await setRefreshToken(data.refreshToken);
    set({
      user: data.user as User,
      isAuthenticated: true,
      isLoading: false,
    });
  },

  emailSignin: async (email: string, password: string) => {
    const data = await emailSigninApi(email, password);
    await setAccessToken(data.accessToken);
    await setRefreshToken(data.refreshToken);
    set({
      user: data.user as User,
      isAuthenticated: true,
      isLoading: false,
    });
  },

  forgotPassword: async (email: string) => {
    await forgotPasswordApi(email);
  },

  resetPassword: async (email: string, code: string, newPassword: string) => {
    await resetPasswordApi(email, code, newPassword);
  },
```

- [ ] **Step 4: Expose new methods in the useAuth hook**

Update the return value of the `useAuth()` function:

```typescript
export function useAuth() {
  const store = useAuthStore();
  return {
    user: store.user,
    isAuthenticated: store.isAuthenticated,
    isLoading: store.isLoading,
    hasChecked: store._hasChecked,
    login: store.login,
    logout: store.logout,
    refreshSession: store._refreshSession,
    emailSignup: store.emailSignup,
    emailVerify: store.emailVerify,
    emailSignin: store.emailSignin,
    forgotPassword: store.forgotPassword,
    resetPassword: store.resetPassword,
  };
}
```

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/hooks/use-auth.ts
git commit -m "feat: add email auth methods to mobile auth hook"
```

---

## Chunk 6: Mobile Screens

### Task 10: Update login screen

**Files:**
- Modify: `apps/mobile/app/(auth)/login.tsx`

- [ ] **Step 1: Add email auth buttons to login screen**

Replace the contents of `apps/mobile/app/(auth)/login.tsx` with:

```tsx
import { View, Text, Pressable, ActivityIndicator } from "react-native";
import { useState } from "react";
import { useRouter } from "expo-router";
import { useAuth } from "~/hooks/use-auth";
import { toast } from "sonner-native";

export default function LoginScreen() {
  const { login } = useAuth();
  const router = useRouter();
  const [isSigningIn, setIsSigningIn] = useState(false);

  const handleLogin = async () => {
    try {
      setIsSigningIn(true);
      await login();
    } catch (error: any) {
      toast.error(error.message || "Failed to sign in");
    } finally {
      setIsSigningIn(false);
    }
  };

  return (
    <View className="flex-1 items-center justify-center bg-background px-8">
      <Text className="text-4xl font-bold text-foreground mb-2">MindTab</Text>
      <Text className="text-muted-foreground text-center mb-12">
        Track goals, build habits, capture thoughts.
      </Text>

      <Pressable
        onPress={handleLogin}
        disabled={isSigningIn}
        className="flex-row items-center justify-center bg-white rounded-lg px-6 py-3 w-full max-w-xs"
      >
        {isSigningIn ? (
          <ActivityIndicator size="small" color="#000" />
        ) : (
          <Text className="text-black font-semibold text-base">
            Sign in with Google
          </Text>
        )}
      </Pressable>

      <View className="flex-row items-center w-full max-w-xs my-6">
        <View className="flex-1 h-px bg-neutral-700" />
        <Text className="text-muted-foreground mx-4 text-sm">or</Text>
        <View className="flex-1 h-px bg-neutral-700" />
      </View>

      <Pressable
        onPress={() => router.push("/(auth)/email-signup")}
        className="items-center justify-center border border-neutral-700 rounded-lg px-6 py-3 w-full max-w-xs mb-3"
      >
        <Text className="text-foreground font-semibold text-base">
          Sign up with email
        </Text>
      </Pressable>

      <Pressable
        onPress={() => router.push("/(auth)/email-signin")}
        className="items-center justify-center px-6 py-3 w-full max-w-xs"
      >
        <Text className="text-muted-foreground text-base">
          Sign in with email
        </Text>
      </Pressable>
    </View>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/mobile/app/\(auth\)/login.tsx
git commit -m "feat: add email auth options to login screen"
```

---

### Task 11: Create email signup screen

**Files:**
- Create: `apps/mobile/app/(auth)/email-signup.tsx`

- [ ] **Step 1: Create the signup screen**

Create `apps/mobile/app/(auth)/email-signup.tsx`:

```tsx
import {
  View,
  Text,
  TextInput,
  Pressable,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import { useState } from "react";
import { useRouter } from "expo-router";
import { useAuth } from "~/hooks/use-auth";
import { toast } from "sonner-native";
import { colors } from "~/styles/colors";

export default function EmailSignupScreen() {
  const { emailSignup } = useAuth();
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSignup = async () => {
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }
    if (!email.trim()) {
      toast.error("Email is required");
      return;
    }
    if (password.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    if (password !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }

    try {
      setIsLoading(true);
      await emailSignup(email.trim(), password, name.trim());
      router.push({
        pathname: "/(auth)/email-verify",
        params: { email: email.trim(), password, name: name.trim() },
      });
    } catch (error: any) {
      toast.error(error.message || "Signup failed");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      className="flex-1 bg-background"
    >
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, justifyContent: "center" }}
        keyboardShouldPersistTaps="handled"
        className="px-8"
      >
        <Pressable onPress={() => router.back()} className="mb-8">
          <Text className="text-muted-foreground text-base">← Back</Text>
        </Pressable>

        <Text className="text-2xl font-bold text-foreground mb-2">
          Create account
        </Text>
        <Text className="text-muted-foreground mb-8">
          Sign up with your email address
        </Text>

        <TextInput
          placeholder="Name"
          value={name}
          onChangeText={setName}
          autoCapitalize="words"
          placeholderTextColor={colors.text.muted}
          className="border border-neutral-700 rounded-lg px-4 py-3 text-foreground text-base mb-4"
        />

        <TextInput
          placeholder="Email"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          placeholderTextColor={colors.text.muted}
          className="border border-neutral-700 rounded-lg px-4 py-3 text-foreground text-base mb-4"
        />

        <TextInput
          placeholder="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          placeholderTextColor={colors.text.muted}
          className="border border-neutral-700 rounded-lg px-4 py-3 text-foreground text-base mb-4"
        />

        <TextInput
          placeholder="Confirm password"
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          secureTextEntry
          placeholderTextColor={colors.text.muted}
          className="border border-neutral-700 rounded-lg px-4 py-3 text-foreground text-base mb-6"
        />

        <Pressable
          onPress={handleSignup}
          disabled={isLoading}
          className="items-center justify-center bg-white rounded-lg px-6 py-3"
        >
          {isLoading ? (
            <ActivityIndicator size="small" color="#000" />
          ) : (
            <Text className="text-black font-semibold text-base">
              Create account
            </Text>
          )}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/mobile/app/\(auth\)/email-signup.tsx
git commit -m "feat: add email signup screen"
```

---

### Task 12: Create email verify screen

**Files:**
- Create: `apps/mobile/app/(auth)/email-verify.tsx`

- [ ] **Step 1: Create the verification screen**

Create `apps/mobile/app/(auth)/email-verify.tsx`:

```tsx
import {
  View,
  Text,
  TextInput,
  Pressable,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useAuth } from "~/hooks/use-auth";
import { toast } from "sonner-native";
import { colors } from "~/styles/colors";

export default function EmailVerifyScreen() {
  const { emailVerify, emailSignup } = useAuth();
  const { email, password, name } = useLocalSearchParams<{ email: string; password: string; name: string }>();
  const router = useRouter();
  const [code, setCode] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isResending, setIsResending] = useState(false);

  const handleVerify = async () => {
    if (code.length !== 6) {
      toast.error("Please enter the 6-digit code");
      return;
    }

    try {
      setIsLoading(true);
      await emailVerify(email!, code);
      // AuthGuard will redirect to onboarding or main
    } catch (error: any) {
      toast.error(error.message || "Verification failed");
    } finally {
      setIsLoading(false);
    }
  };

  const handleResend = async () => {
    try {
      setIsResending(true);
      // Re-call signup with original credentials to regenerate token.
      await emailSignup(email!, password!, name!);
      toast.success("New code sent");
    } catch {
      toast.error("Failed to resend code");
    } finally {
      setIsResending(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      className="flex-1 bg-background"
    >
      <View className="flex-1 justify-center px-8">
        <Pressable onPress={() => router.back()} className="mb-8">
          <Text className="text-muted-foreground text-base">← Back</Text>
        </Pressable>

        <Text className="text-2xl font-bold text-foreground mb-2">
          Verify your email
        </Text>
        <Text className="text-muted-foreground mb-8">
          We sent a 6-digit code to {email}
        </Text>

        <TextInput
          placeholder="000000"
          value={code}
          onChangeText={(text) => setCode(text.replace(/[^0-9]/g, "").slice(0, 6))}
          keyboardType="number-pad"
          maxLength={6}
          textAlign="center"
          placeholderTextColor={colors.text.muted}
          className="border border-neutral-700 rounded-lg px-4 py-4 text-foreground text-2xl tracking-widest mb-6"
        />

        <Pressable
          onPress={handleVerify}
          disabled={isLoading}
          className="items-center justify-center bg-white rounded-lg px-6 py-3 mb-4"
        >
          {isLoading ? (
            <ActivityIndicator size="small" color="#000" />
          ) : (
            <Text className="text-black font-semibold text-base">Verify</Text>
          )}
        </Pressable>

        <Pressable onPress={handleResend} disabled={isResending} className="items-center py-2">
          <Text className="text-muted-foreground text-sm">
            {isResending ? "Sending..." : "Didn't get a code? Resend"}
          </Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/mobile/app/\(auth\)/email-verify.tsx
git commit -m "feat: add email verification screen"
```

---

### Task 13: Create email signin screen

**Files:**
- Create: `apps/mobile/app/(auth)/email-signin.tsx`

- [ ] **Step 1: Create the signin screen**

Create `apps/mobile/app/(auth)/email-signin.tsx`:

```tsx
import {
  View,
  Text,
  TextInput,
  Pressable,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import { useState } from "react";
import { useRouter } from "expo-router";
import { useAuth } from "~/hooks/use-auth";
import { toast } from "sonner-native";
import { colors } from "~/styles/colors";

export default function EmailSigninScreen() {
  const { emailSignin } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSignin = async () => {
    if (!email.trim()) {
      toast.error("Email is required");
      return;
    }
    if (!password) {
      toast.error("Password is required");
      return;
    }

    try {
      setIsLoading(true);
      await emailSignin(email.trim(), password);
      // AuthGuard will redirect
    } catch (error: any) {
      toast.error(error.message || "Sign in failed");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      className="flex-1 bg-background"
    >
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, justifyContent: "center" }}
        keyboardShouldPersistTaps="handled"
        className="px-8"
      >
        <Pressable onPress={() => router.back()} className="mb-8">
          <Text className="text-muted-foreground text-base">← Back</Text>
        </Pressable>

        <Text className="text-2xl font-bold text-foreground mb-2">
          Sign in
        </Text>
        <Text className="text-muted-foreground mb-8">
          Sign in with your email address
        </Text>

        <TextInput
          placeholder="Email"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          placeholderTextColor={colors.text.muted}
          className="border border-neutral-700 rounded-lg px-4 py-3 text-foreground text-base mb-4"
        />

        <TextInput
          placeholder="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          placeholderTextColor={colors.text.muted}
          className="border border-neutral-700 rounded-lg px-4 py-3 text-foreground text-base mb-6"
        />

        <Pressable
          onPress={handleSignin}
          disabled={isLoading}
          className="items-center justify-center bg-white rounded-lg px-6 py-3 mb-4"
        >
          {isLoading ? (
            <ActivityIndicator size="small" color="#000" />
          ) : (
            <Text className="text-black font-semibold text-base">Sign in</Text>
          )}
        </Pressable>

        <Pressable
          onPress={() => router.push("/(auth)/forgot-password")}
          className="items-center py-2"
        >
          <Text className="text-muted-foreground text-sm">
            Forgot password?
          </Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/mobile/app/\(auth\)/email-signin.tsx
git commit -m "feat: add email signin screen"
```

---

### Task 14: Create forgot password screen

**Files:**
- Create: `apps/mobile/app/(auth)/forgot-password.tsx`

- [ ] **Step 1: Create the forgot password screen**

Create `apps/mobile/app/(auth)/forgot-password.tsx`:

```tsx
import {
  View,
  Text,
  TextInput,
  Pressable,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useState } from "react";
import { useRouter } from "expo-router";
import { useAuth } from "~/hooks/use-auth";
import { toast } from "sonner-native";
import { colors } from "~/styles/colors";

export default function ForgotPasswordScreen() {
  const { forgotPassword } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async () => {
    if (!email.trim()) {
      toast.error("Email is required");
      return;
    }

    try {
      setIsLoading(true);
      await forgotPassword(email.trim());
      router.push({
        pathname: "/(auth)/reset-password",
        params: { email: email.trim() },
      });
    } catch (error: any) {
      toast.error(error.message || "Request failed");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      className="flex-1 bg-background"
    >
      <View className="flex-1 justify-center px-8">
        <Pressable onPress={() => router.back()} className="mb-8">
          <Text className="text-muted-foreground text-base">← Back</Text>
        </Pressable>

        <Text className="text-2xl font-bold text-foreground mb-2">
          Reset password
        </Text>
        <Text className="text-muted-foreground mb-8">
          Enter your email and we'll send you a reset code
        </Text>

        <TextInput
          placeholder="Email"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          placeholderTextColor={colors.text.muted}
          className="border border-neutral-700 rounded-lg px-4 py-3 text-foreground text-base mb-6"
        />

        <Pressable
          onPress={handleSubmit}
          disabled={isLoading}
          className="items-center justify-center bg-white rounded-lg px-6 py-3"
        >
          {isLoading ? (
            <ActivityIndicator size="small" color="#000" />
          ) : (
            <Text className="text-black font-semibold text-base">
              Send reset code
            </Text>
          )}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/mobile/app/\(auth\)/forgot-password.tsx
git commit -m "feat: add forgot password screen"
```

---

### Task 15: Create reset password screen

**Files:**
- Create: `apps/mobile/app/(auth)/reset-password.tsx`

- [ ] **Step 1: Create the reset password screen**

Create `apps/mobile/app/(auth)/reset-password.tsx`:

```tsx
import {
  View,
  Text,
  TextInput,
  Pressable,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import { useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useAuth } from "~/hooks/use-auth";
import { toast } from "sonner-native";
import { colors } from "~/styles/colors";

export default function ResetPasswordScreen() {
  const { resetPassword } = useAuth();
  const { email } = useLocalSearchParams<{ email: string }>();
  const router = useRouter();
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleReset = async () => {
    if (code.length !== 6) {
      toast.error("Please enter the 6-digit code");
      return;
    }
    if (newPassword.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }

    try {
      setIsLoading(true);
      await resetPassword(email!, code, newPassword);
      toast.success("Password reset successful");
      router.push("/(auth)/email-signin");
    } catch (error: any) {
      toast.error(error.message || "Reset failed");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      className="flex-1 bg-background"
    >
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, justifyContent: "center" }}
        keyboardShouldPersistTaps="handled"
        className="px-8"
      >
        <Pressable onPress={() => router.back()} className="mb-8">
          <Text className="text-muted-foreground text-base">← Back</Text>
        </Pressable>

        <Text className="text-2xl font-bold text-foreground mb-2">
          Set new password
        </Text>
        <Text className="text-muted-foreground mb-8">
          Enter the code sent to {email}
        </Text>

        <TextInput
          placeholder="000000"
          value={code}
          onChangeText={(text) => setCode(text.replace(/[^0-9]/g, "").slice(0, 6))}
          keyboardType="number-pad"
          maxLength={6}
          textAlign="center"
          placeholderTextColor={colors.text.muted}
          className="border border-neutral-700 rounded-lg px-4 py-4 text-foreground text-2xl tracking-widest mb-4"
        />

        <TextInput
          placeholder="New password"
          value={newPassword}
          onChangeText={setNewPassword}
          secureTextEntry
          placeholderTextColor={colors.text.muted}
          className="border border-neutral-700 rounded-lg px-4 py-3 text-foreground text-base mb-4"
        />

        <TextInput
          placeholder="Confirm new password"
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          secureTextEntry
          placeholderTextColor={colors.text.muted}
          className="border border-neutral-700 rounded-lg px-4 py-3 text-foreground text-base mb-6"
        />

        <Pressable
          onPress={handleReset}
          disabled={isLoading}
          className="items-center justify-center bg-white rounded-lg px-6 py-3"
        >
          {isLoading ? (
            <ActivityIndicator size="small" color="#000" />
          ) : (
            <Text className="text-black font-semibold text-base">
              Reset password
            </Text>
          )}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/mobile/app/\(auth\)/reset-password.tsx
git commit -m "feat: add reset password screen"
```

---

## Chunk 7: Integration & Verification

### Task 16: Run migration and verify end-to-end

- [ ] **Step 1: Add RESEND_API_KEY to server .env**

Add to `server/.env`:

```
RESEND_API_KEY=re_your_api_key_here
```

- [ ] **Step 2: Run the database migration**

Run: `cd server && migrate -path migrations -database $DATABASE_URL up`

Expected: Migration 000002 applied successfully.

- [ ] **Step 3: Regenerate sqlc**

Run: `cd server && sqlc generate`

Expected: No errors.

- [ ] **Step 4: Build server**

Run: `cd server && go build ./...`

Expected: Clean build with no errors.

- [ ] **Step 5: Regenerate API types**

Run: `cd packages/api-spec && pnpm build`

Expected: Types regenerated successfully.

- [ ] **Step 6: Verify mobile app compiles**

Run: `cd apps/mobile && npx expo export --platform ios --no-emit`

Or start dev server: `cd apps/mobile && npx expo start`

Expected: No TypeScript errors, app starts.

- [ ] **Step 7: Manual test flow**

Test these flows on the mobile app:
1. Tap "Sign up with email" → fill form → submit → verify code screen appears
2. Enter verification code from email → app logs in and goes to onboarding/main
3. Log out → "Sign in with email" → enter credentials → app logs in
4. "Forgot password?" → enter email → enter reset code + new password → sign in with new password

- [ ] **Step 8: Final commit**

```bash
git add -A
git commit -m "feat: complete email auth integration"
```
