-- name: CreateRefreshToken :exec
INSERT INTO mindmap_refresh_token (user_id, token_hash, expires_at) VALUES ($1, $2, $3);

-- name: GetRefreshToken :one
SELECT * FROM mindmap_refresh_token WHERE token_hash = $1 AND expires_at > CURRENT_TIMESTAMP;

-- name: DeleteRefreshToken :exec
DELETE FROM mindmap_refresh_token WHERE token_hash = $1;

-- name: DeleteExpiredRefreshTokens :exec
DELETE FROM mindmap_refresh_token WHERE expires_at <= CURRENT_TIMESTAMP;

-- name: DeleteUserRefreshTokens :exec
DELETE FROM mindmap_refresh_token WHERE user_id = $1;
