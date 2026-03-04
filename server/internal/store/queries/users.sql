-- name: GetUserByID :one
SELECT * FROM mindmap_user WHERE id = $1;

-- name: GetUserByEmail :one
SELECT * FROM mindmap_user WHERE email = $1;

-- name: UpsertUser :one
INSERT INTO mindmap_user (id, name, email, image, email_verified)
VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
ON CONFLICT (id) DO UPDATE SET
    name = COALESCE(EXCLUDED.name, mindmap_user.name),
    image = COALESCE(EXCLUDED.image, mindmap_user.image),
    updated_at = CURRENT_TIMESTAMP
RETURNING *;

-- name: UpdateUserXP :one
UPDATE mindmap_user SET xp = xp + $2, updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING *;

-- name: CompleteOnboarding :exec
UPDATE mindmap_user SET onboarding_completed = true, updated_at = CURRENT_TIMESTAMP WHERE id = $1;
