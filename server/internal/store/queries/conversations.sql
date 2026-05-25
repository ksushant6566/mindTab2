-- name: CreateConversation :one
INSERT INTO conversations (user_id)
VALUES ($1)
RETURNING id, user_id, title, created_at, updated_at;

-- name: GetConversation :one
SELECT id, user_id, title, created_at, updated_at
FROM conversations
WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL;

-- name: ListConversations :many
SELECT id, user_id, title, created_at, updated_at
FROM conversations
WHERE user_id = $1 AND deleted_at IS NULL
ORDER BY updated_at DESC
LIMIT $2 OFFSET $3;

-- name: CountConversations :one
SELECT count(*) FROM conversations
WHERE user_id = $1 AND deleted_at IS NULL;

-- name: UpdateConversationTitle :exec
UPDATE conversations
SET title = $3, updated_at = now()
WHERE id = $1 AND user_id = $2;

-- name: TouchConversation :exec
UPDATE conversations
SET updated_at = now()
WHERE id = $1;

-- name: SoftDeleteConversation :exec
UPDATE conversations
SET deleted_at = now()
WHERE id = $1 AND user_id = $2;
