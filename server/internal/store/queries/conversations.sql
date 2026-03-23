-- name: CreateConversation :one
INSERT INTO mindmap_conversations (user_id)
VALUES ($1)
RETURNING id, user_id, title, created_at, updated_at;

-- name: GetConversation :one
SELECT id, user_id, title, created_at, updated_at
FROM mindmap_conversations
WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL;

-- name: ListConversations :many
SELECT id, user_id, title, created_at, updated_at
FROM mindmap_conversations
WHERE user_id = $1 AND deleted_at IS NULL
ORDER BY updated_at DESC
LIMIT $2 OFFSET $3;

-- name: CountConversations :one
SELECT count(*) FROM mindmap_conversations
WHERE user_id = $1 AND deleted_at IS NULL;

-- name: UpdateConversationTitle :exec
UPDATE mindmap_conversations
SET title = $3, updated_at = now()
WHERE id = $1 AND user_id = $2;

-- name: TouchConversation :exec
UPDATE mindmap_conversations
SET updated_at = now()
WHERE id = $1;

-- name: SoftDeleteConversation :exec
UPDATE mindmap_conversations
SET deleted_at = now()
WHERE id = $1 AND user_id = $2;
