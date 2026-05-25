-- name: CreateRefreshToken :exec
INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3);

-- name: GetRefreshToken :one
SELECT * FROM refresh_tokens WHERE token_hash = $1 AND expires_at > CURRENT_TIMESTAMP;

-- name: DeleteRefreshToken :exec
DELETE FROM refresh_tokens WHERE token_hash = $1;

-- name: DeleteExpiredRefreshTokens :exec
DELETE FROM refresh_tokens WHERE expires_at <= CURRENT_TIMESTAMP;

-- name: DeleteUserRefreshTokens :exec
DELETE FROM refresh_tokens WHERE user_id = $1;

-- name: ConsumeWSTicket :one
DELETE FROM refresh_tokens
WHERE token_hash = $1 AND expires_at > CURRENT_TIMESTAMP
RETURNING *;
