# Email Signup & Signin — Mobile App

## Purpose

Add email/password authentication to the mobile app alongside existing Google OAuth. Required for Apple App Store review, which needs testable login credentials. Mobile only — no web changes.

## Database Changes

### Add UNIQUE constraint on `mindmap_user.email`

The account-linking strategy depends on email uniqueness. Add:
```sql
CREATE UNIQUE INDEX idx_mindmap_user_email ON mindmap_user(email);
```

### New column on `mindmap_user`

- `password_hash VARCHAR(255)` — nullable (Google-only users won't have one)

### New table `mindmap_verification_token`

| Column        | Type           | Notes                                      |
|---------------|----------------|--------------------------------------------|
| id            | UUID           | Primary key                                |
| user_id       | VARCHAR(255)   | FK → mindmap_user, indexed                 |
| token_hash    | VARCHAR(255)   | SHA256 hash, unique                        |
| type          | VARCHAR(50)    | `email_verification` or `password_reset`   |
| password_hash | VARCHAR(255)   | Pending bcrypt hash (verification only)    |
| attempts      | INTEGER        | Failed validation attempts, default 0      |
| expires_at    | TIMESTAMPTZ    | 24h for verification, 15min for reset      |
| created_at    | TIMESTAMPTZ    | DEFAULT NOW()                              |

Tokens are one-time use (deleted after consumption). Hashed with SHA256, same pattern as refresh tokens.

The `password_hash` column stores the pending bcrypt hash during signup. It is only applied to `mindmap_user` when verification succeeds — this prevents an attacker from overwriting a Google user's password before email ownership is proven.

The `attempts` column tracks failed code entries. After 5 failed attempts, the token is invalidated (must request a new code).

No changes to `mindmap_refresh_token` — email auth reuses the existing JWT + refresh token system after login.

### Token cleanup

Add `DeleteExpiredVerificationTokens` query (same pattern as existing `DeleteExpiredRefreshTokens`). Run on the same schedule.

## Server Endpoints

All new endpoints are public (no auth middleware). All email auth endpoints return tokens in the response body (mobile format only — no cookie path).

### Rate Limiting

- Signup and forgot-password: max 3 requests per email per 15-minute window (prevents email bombing and Resend quota abuse)
- Verify and reset-password: max 5 failed attempts per token (tracked via `attempts` column), then token is invalidated

### `POST /auth/email/signup`

- **Body:** `{ email, password, name }`
- **Validation:** email format, password min 8 chars
- **Account linking logic:**
  - Email exists with password_hash → error "account already exists"
  - Email exists without password_hash (Google user) → creates verification token with pending password_hash
  - Email not found → creates new user with generated UUID as id, `email_verified = NULL`
- **Actions:** hash password (bcrypt), delete any existing `email_verification` tokens for this user, generate 6-digit code, store token hash + pending password_hash in `mindmap_verification_token`, send verification email via Resend
- **Response:** `{ message: "verification email sent" }` — no JWT issued yet
- **Note:** password_hash is NOT written to `mindmap_user` at this stage

### `POST /auth/email/verify`

- **Body:** `{ email, code }`
- **Actions:** validate code against stored token hash, increment `attempts` on failure (invalidate after 5), on success: apply pending `password_hash` to `mindmap_user`, set `email_verified = NOW()`, delete token, issue access + refresh tokens
- **Transaction:** password_hash update + email_verified update + token deletion wrapped in a single transaction
- **Response:** `{ accessToken, refreshToken, user }`

### `POST /auth/email/signin`

- **Body:** `{ email, password }`
- **Actions:** lookup user by email, verify bcrypt hash against `mindmap_user.password_hash`
- **Guard:** if user has `password_hash` but `email_verified` is NULL → error "please verify your email"
- **Note:** this check only applies to users with a password_hash (Google-only users don't hit this path)
- **Response:** `{ accessToken, refreshToken, user }`

### `POST /auth/email/forgot-password`

- **Body:** `{ email }`
- **Actions:** if user exists with password_hash, delete any existing `password_reset` tokens for this user, generate reset code, send email
- **Response:** always `{ message: "if account exists, reset email sent" }` (no user enumeration)

### `POST /auth/email/reset-password`

- **Body:** `{ email, code, newPassword }`
- **Actions:** validate code against stored token hash (max 5 attempts), update `mindmap_user.password_hash` (bcrypt), delete all user's refresh tokens (force re-login), delete used token
- **Response:** `{ message: "password reset successful" }`

## Resend Integration

- New file: `server/internal/email/resend.go` — thin wrapper around Resend Go SDK
- Environment variable: `RESEND_API_KEY` — added to `Config` struct, validated on startup
- Sender: `noreply@mindtab.in` (requires domain verification in Resend dashboard)

### Email templates (plain text)

**Verification email:**
- Subject: "Verify your MindTab account"
- Body: "Your verification code is: {code}. It expires in 24 hours."

**Password reset email:**
- Subject: "Reset your MindTab password"
- Body: "Your password reset code is: {code}. It expires in 15 minutes."

Codes instead of links because users are on mobile — typing/pasting a 6-digit code is better UX than being redirected to a browser.

## Mobile Screens

All changes in `apps/mobile/`. No web changes.

### Updated `(auth)/login.tsx`

- Google sign-in button stays prominent at top
- Divider: "or"
- Two buttons below: "Sign up with email" and "Sign in with email"

### New screens in `(auth)/`

**`email-signup.tsx`** — Sign up form
- Fields: Name, Email, Password, Confirm Password
- "Create account" button → on success navigates to verification screen

**`email-verify.tsx`** — Verification code entry
- Shows "We sent a code to {email}"
- 6-digit code input
- "Verify" button + "Resend code" link (re-calls signup endpoint to regenerate token)
- On success → auth state updates, AuthGuard routes to onboarding or main

**`email-signin.tsx`** — Sign in form
- Fields: Email, Password
- "Sign in" button + "Forgot password?" link
- On success → auth state updates, AuthGuard routes appropriately

**`forgot-password.tsx`** — Request reset
- Field: Email
- "Send reset code" button → on success navigates to reset password screen

**`reset-password.tsx`** — Set new password
- Shows "We sent a code to {email}"
- Fields: Code, New Password, Confirm Password
- "Reset password" button → on success navigates to sign in screen

### Auth hook changes (`use-auth.ts`)

Add methods: `emailSignup`, `emailSignin`, `emailVerify`, `forgotPassword`, `resetPassword`. Existing `login()` (Google) unchanged. Same token storage in `expo-secure-store` after successful email verify/signin.

## Account Linking

- Same email = same account regardless of auth method
- A user who signed up with Google can later add a password via email signup (pending password_hash stored in verification token, applied only after email verification succeeds)
- A user who signed up with email can later use Google sign-in (existing Google flow already upserts by email)
- Both methods share the same JWT/refresh token infrastructure

## Implementation Notes

- After adding `password_hash` column, run `sqlc generate` — ensure password_hash is never leaked in API responses (exclude from user JSON serialization)
- Update OpenAPI spec in `packages/api-spec/` with new email auth endpoints
- Bcrypt cost factor defined as a named constant in the auth package
- Multi-step operations (user create + token store) wrapped in database transactions; email sent only after transaction commits

## Security

- Passwords hashed with bcrypt (cost factor 10, named constant)
- Verification/reset tokens hashed with SHA256 before storage
- Tokens are one-time use, deleted after consumption
- Pending password stored in token table, not applied until email verified
- Max 5 failed code attempts per token before invalidation
- Rate limiting on email-sending endpoints (3 per email per 15min)
- No user enumeration on forgot-password endpoint
- Password reset invalidates all existing refresh tokens
- Email signup creates user with `email_verified = NULL` (not default timestamp)
- UNIQUE constraint on `mindmap_user.email` enforces account-linking integrity
- Same platform detection (`X-Platform: mobile`) for token transport
