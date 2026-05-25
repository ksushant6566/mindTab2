-- name: CreateProject :one
INSERT INTO projects (name, description, status, start_date, end_date, created_by, last_updated_by)
VALUES ($1, $2, $3, $4, $5, $6, $6)
RETURNING *;

-- name: GetProjectByID :one
SELECT * FROM projects WHERE id = $1 AND created_by = $2 AND deleted_at IS NULL;

-- name: ListProjects :many
SELECT * FROM projects
WHERE created_by = $1 AND deleted_at IS NULL
  AND ($2::boolean OR status != 'archived')
  AND ($3::project_status IS NULL OR status = $3::project_status)
ORDER BY status ASC, created_at DESC;

-- name: UpdateProject :one
UPDATE projects SET
    name = COALESCE($3, name),
    description = COALESCE($4, description),
    status = COALESCE($5, status),
    last_updated_by = $2,
    updated_at = CURRENT_TIMESTAMP
WHERE id = $1 AND created_by = $2 AND deleted_at IS NULL
RETURNING *;

-- name: SoftDeleteProject :exec
UPDATE projects SET deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
WHERE id = $1 AND created_by = $2;

-- name: ArchiveProject :one
UPDATE projects SET status = 'archived', last_updated_by = $2, updated_at = CURRENT_TIMESTAMP
WHERE id = $1 AND created_by = $2 AND deleted_at IS NULL
RETURNING *;

-- name: ListGoalsByProject :many
SELECT * FROM tasks
WHERE project_id = $1 AND user_id = $2 AND deleted_at IS NULL AND status != 'archived'
ORDER BY position ASC, priority ASC, created_at DESC;

-- name: ListGoalStatsByProject :many
SELECT id, status FROM tasks
WHERE project_id = $1 AND user_id = $2 AND deleted_at IS NULL;

-- name: CountJournalsByProject :one
SELECT COUNT(*)::int FROM notes
WHERE project_id = $1 AND user_id = $2 AND deleted_at IS NULL;
