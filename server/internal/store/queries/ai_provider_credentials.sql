-- name: UpsertAIProviderCredential :one
INSERT INTO user_ai_provider_credentials (
    user_id,
    provider,
    encrypted_api_key,
    nonce,
    key_hint
)
VALUES ($1, $2, $3, $4, $5)
ON CONFLICT (user_id, provider) DO UPDATE SET
    encrypted_api_key = EXCLUDED.encrypted_api_key,
    nonce = EXCLUDED.nonce,
    key_hint = EXCLUDED.key_hint,
    updated_at = now()
RETURNING user_id, provider, encrypted_api_key, nonce, key_hint, created_at, updated_at;

-- name: GetAIProviderCredential :one
SELECT user_id, provider, encrypted_api_key, nonce, key_hint, created_at, updated_at
FROM user_ai_provider_credentials
WHERE user_id = $1 AND provider = $2;

-- name: ListAIProviderCredentials :many
SELECT user_id, provider, key_hint, created_at, updated_at
FROM user_ai_provider_credentials
WHERE user_id = $1
ORDER BY provider;

-- name: DeleteAIProviderCredential :exec
DELETE FROM user_ai_provider_credentials
WHERE user_id = $1 AND provider = $2;
