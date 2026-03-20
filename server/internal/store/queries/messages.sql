-- name: CreateMessage :one
INSERT INTO mindmap_messages (conversation_id, role, content, attachments, tool_calls, tool_call_id)
VALUES ($1, $2, $3, $4, $5, $6)
RETURNING id, conversation_id, role, content, attachments, tool_calls, tool_call_id, created_at;

-- name: ListMessages :many
SELECT id, conversation_id, role, content, attachments, tool_calls, tool_call_id, created_at
FROM mindmap_messages
WHERE conversation_id = $1
ORDER BY created_at ASC
LIMIT $2 OFFSET $3;

-- name: CountMessages :one
SELECT count(*) FROM mindmap_messages
WHERE conversation_id = $1;

-- name: GetMessage :one
SELECT id, conversation_id, role, content, attachments, tool_calls, tool_call_id, created_at
FROM mindmap_messages
WHERE id = $1;
