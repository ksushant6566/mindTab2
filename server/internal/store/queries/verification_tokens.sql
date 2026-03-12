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
