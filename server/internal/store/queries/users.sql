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
    appearance_template = COALESCE(sqlc.narg('appearance_template'), appearance_template),
    accent_color = COALESCE(sqlc.narg('accent_color'), accent_color),
    background_color = COALESCE(sqlc.narg('background_color'), background_color),
    foreground_color = COALESCE(sqlc.narg('foreground_color'), foreground_color),
    contrast = COALESCE(sqlc.narg('contrast'), contrast),
    font_size = COALESCE(sqlc.narg('font_size'), font_size),
    code_font = COALESCE(sqlc.narg('code_font'), code_font),
    week_start_day = COALESCE(sqlc.narg('week_start_day'), week_start_day),
    time_format = COALESCE(sqlc.narg('time_format'), time_format),
    time_zone = COALESCE(sqlc.narg('time_zone'), time_zone),
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
