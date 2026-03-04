-- name: CreateHabit :exec
INSERT INTO mindmap_habit (title, description, frequency, user_id)
VALUES ($1, $2, $3, $4);

-- name: GetHabitByID :one
SELECT * FROM mindmap_habit WHERE id = $1 AND user_id = $2;

-- name: ListHabits :many
SELECT * FROM mindmap_habit WHERE user_id = $1 AND deleted_at IS NULL ORDER BY created_at DESC;

-- name: UpdateHabit :exec
UPDATE mindmap_habit SET
    title = COALESCE($3, title),
    description = COALESCE($4, description),
    frequency = COALESCE($5, frequency),
    updated_at = CURRENT_TIMESTAMP
WHERE id = $1 AND user_id = $2;

-- name: DeleteHabit :exec
DELETE FROM mindmap_habit WHERE id = $1 AND user_id = $2;

-- name: CheckHabitTitleExists :one
SELECT EXISTS(
    SELECT 1 FROM mindmap_habit
    WHERE user_id = $1 AND title = $2 AND deleted_at IS NULL
    AND ($3::uuid IS NULL OR id != $3::uuid)
) AS "exists";

-- name: SearchHabits :many
SELECT * FROM mindmap_habit
WHERE user_id = $1 AND deleted_at IS NULL AND title ILIKE '%' || $2 || '%'
ORDER BY created_at DESC LIMIT 5;
