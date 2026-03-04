-- name: ListHabitTrackerRecords :many
SELECT * FROM mindmap_habit_tracker WHERE user_id = $1;

-- name: TrackHabit :one
INSERT INTO mindmap_habit_tracker (habit_id, user_id, status, date)
VALUES ($1, $2, 'completed', $3)
ON CONFLICT (habit_id, user_id, date) DO UPDATE SET status = 'completed', updated_at = CURRENT_TIMESTAMP
RETURNING id;

-- name: UntrackHabit :exec
DELETE FROM mindmap_habit_tracker WHERE habit_id = $1 AND user_id = $2 AND date = $3;
