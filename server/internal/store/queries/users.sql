-- name: GetUserByID :one
SELECT * FROM users WHERE id = $1;

-- name: GetUserByEmail :one
SELECT * FROM users WHERE email = $1;

-- name: UpsertUser :one
INSERT INTO users (id, name, email, image, email_verified)
VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
ON CONFLICT (id) DO UPDATE SET
    name = COALESCE(EXCLUDED.name, users.name),
    image = COALESCE(EXCLUDED.image, users.image),
    updated_at = CURRENT_TIMESTAMP
RETURNING *;

-- name: CompleteOnboarding :exec
UPDATE users SET onboarding_completed = true, updated_at = CURRENT_TIMESTAMP WHERE id = $1;

-- name: UpdateUserAppearance :one
UPDATE users
SET
    theme = COALESCE(sqlc.narg('theme'), theme),
    font = COALESCE(sqlc.narg('font'), font),
    updated_at = CURRENT_TIMESTAMP
WHERE id = sqlc.arg('id')
RETURNING *;

-- name: CreateEmailUser :one
INSERT INTO users (id, name, email, email_verified)
VALUES ($1, $2, $3, NULL)
RETURNING *;

-- name: SetPasswordHash :exec
UPDATE users SET password_hash = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $1;

-- name: SetEmailVerified :exec
UPDATE users SET email_verified = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = $1;
