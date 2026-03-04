-- name: GetGoalActivity :many
SELECT created_at, status FROM mindmap_goal
WHERE user_id = $1 AND created_at >= $2;

-- name: GetHabitActivity :many
SELECT created_at FROM mindmap_habit
WHERE user_id = $1 AND created_at >= $2;

-- name: GetHabitTrackerActivity :many
SELECT date FROM mindmap_habit_tracker
WHERE user_id = $1 AND date >= $2::date;

-- name: GetJournalActivity :many
SELECT created_at, updated_at FROM mindmap_journal
WHERE user_id = $1 AND created_at >= $2;
