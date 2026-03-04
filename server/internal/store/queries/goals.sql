-- name: CreateGoal :exec
INSERT INTO mindmap_goal (title, description, status, priority, impact, position, user_id, project_id, completed_at)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9);

-- name: GetGoalByID :one
SELECT g.id, g.title, g.description, g.status, g.priority, g.impact, g.position,
       g.created_at, g.updated_at, g.completed_at, g.deleted_at, g.user_id, g.project_id,
       p.id as "project_ref_id", p.name as "project_name", p.status as "project_status"
FROM mindmap_goal g
LEFT JOIN mindmap_project p ON g.project_id = p.id
WHERE g.id = $1 AND g.user_id = $2;

-- name: ListGoals :many
SELECT g.id, g.title, g.description, g.status, g.priority, g.impact, g.position,
       g.created_at, g.updated_at, g.completed_at, g.deleted_at, g.user_id, g.project_id,
       p.id as "project_ref_id", p.name as "project_name", p.status as "project_status"
FROM mindmap_goal g
LEFT JOIN mindmap_project p ON g.project_id = p.id
WHERE g.user_id = $1
  AND g.deleted_at IS NULL
  AND ($2::boolean OR g.status != 'archived')
  AND ($3::uuid IS NULL OR g.project_id = $3::uuid)
ORDER BY g.position ASC, g.priority ASC, g.created_at DESC;

-- name: CountGoals :one
SELECT COUNT(*)::int FROM mindmap_goal
WHERE user_id = $1
  AND deleted_at IS NULL
  AND ($2::boolean OR status != 'archived')
  AND ($3::uuid IS NULL OR project_id = $3::uuid);

-- name: UpdateGoal :exec
UPDATE mindmap_goal SET
    title = COALESCE($3, title),
    description = COALESCE($4, description),
    status = COALESCE($5, status),
    priority = COALESCE($6, priority),
    impact = COALESCE($7, impact),
    position = COALESCE($8, position),
    project_id = $9,
    completed_at = $10,
    updated_at = CURRENT_TIMESTAMP
WHERE id = $1 AND user_id = $2;

-- name: UpdateGoalPosition :exec
UPDATE mindmap_goal SET
    position = $3,
    status = COALESCE($4, status),
    completed_at = CASE
        WHEN $4 = 'completed' THEN CURRENT_TIMESTAMP
        WHEN $4 = 'archived' THEN completed_at
        WHEN $4 IS NOT NULL THEN NULL
        ELSE completed_at
    END,
    updated_at = CURRENT_TIMESTAMP
WHERE id = $1 AND user_id = $2;

-- name: SoftDeleteGoal :exec
UPDATE mindmap_goal SET deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
WHERE id = $1 AND user_id = $2;

-- name: ArchiveCompletedGoals :one
WITH updated AS (
    UPDATE mindmap_goal SET status = 'archived', updated_at = CURRENT_TIMESTAMP
    WHERE user_id = $1 AND status = 'completed'
    RETURNING id
)
SELECT COUNT(*)::int FROM updated;

-- name: SearchGoals :many
SELECT * FROM mindmap_goal
WHERE user_id = $1 AND deleted_at IS NULL AND status != 'archived'
  AND title ILIKE '%' || $2 || '%'
ORDER BY created_at DESC LIMIT 5;

-- name: ListUnassignedGoals :many
SELECT * FROM mindmap_goal
WHERE user_id = $1 AND project_id IS NULL AND deleted_at IS NULL AND status != 'archived'
ORDER BY position ASC, priority ASC, created_at DESC;

-- name: SoftDeleteGoalsByProject :exec
UPDATE mindmap_goal SET deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
WHERE project_id = $1 AND user_id = $2;

-- name: ArchiveGoalsByProject :exec
UPDATE mindmap_goal SET status = 'archived', updated_at = CURRENT_TIMESTAMP
WHERE project_id = $1 AND user_id = $2;
