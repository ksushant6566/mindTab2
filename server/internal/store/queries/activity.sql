-- name: GetTaskActivity :many
SELECT created_at, status FROM tasks
WHERE user_id = $1 AND created_at >= $2;

-- name: GetNoteActivity :many
SELECT created_at, updated_at FROM notes
WHERE user_id = $1 AND created_at >= $2;
