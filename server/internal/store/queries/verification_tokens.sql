-- name: CreateVerificationToken :exec
INSERT INTO verification_tokens (user_id, token_hash, type, password_hash, expires_at)
VALUES ($1, $2, $3, $4, $5);

-- name: GetVerificationToken :one
SELECT * FROM verification_tokens
WHERE token_hash = $1 AND type = $2 AND expires_at > CURRENT_TIMESTAMP;

-- name: GetVerificationTokenByUserAndType :one
SELECT * FROM verification_tokens
WHERE user_id = $1 AND type = $2 AND expires_at > CURRENT_TIMESTAMP;

-- name: IncrementVerificationAttempts :exec
UPDATE verification_tokens SET attempts = attempts + 1 WHERE id = $1;

-- name: DeleteVerificationToken :exec
DELETE FROM verification_tokens WHERE id = $1;

-- name: DeleteVerificationTokensByUserAndType :exec
DELETE FROM verification_tokens WHERE user_id = $1 AND type = $2;

-- name: DeleteExpiredVerificationTokens :exec
DELETE FROM verification_tokens WHERE expires_at <= CURRENT_TIMESTAMP;
