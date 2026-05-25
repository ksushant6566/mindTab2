-- name: GetGoalActivity :many
SELECT created_at, status FROM tasks
WHERE user_id = $1 AND created_at >= $2;

-- name: GetHabitActivity :many
SELECT created_at FROM habits
WHERE user_id = $1 AND created_at >= $2;

-- name: GetHabitTrackerActivity :many
SELECT date FROM habit_records
WHERE user_id = $1 AND date >= $2::date;

-- name: GetJournalActivity :many
SELECT created_at, updated_at FROM notes
WHERE user_id = $1 AND created_at >= $2;
