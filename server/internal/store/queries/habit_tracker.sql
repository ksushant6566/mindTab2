-- name: ListHabitTrackerRecords :many
SELECT * FROM mindmap_habit_tracker WHERE user_id = $1;

-- name: TrackHabit :one
INSERT INTO mindmap_habit_tracker (habit_id, user_id, status, date)
VALUES ($1, $2, 'completed', $3)
ON CONFLICT (habit_id, user_id, date) DO UPDATE SET status = 'completed', updated_at = CURRENT_TIMESTAMP
RETURNING id;

-- name: UntrackHabit :exec
DELETE FROM mindmap_habit_tracker WHERE habit_id = $1 AND user_id = $2 AND date = $3;

-- name: GetHabitCompletionStats :many
SELECT h.id AS habit_id,
       h.title AS habit_title,
       COUNT(ht.id) AS completion_count,
       MIN(ht.date) AS first_completion,
       MAX(ht.date) AS last_completion
FROM mindmap_habit h
LEFT JOIN mindmap_habit_tracker ht
  ON h.id = ht.habit_id
  AND ht.date >= @start_date
  AND ht.date <= @end_date
WHERE h.user_id = @user_id
GROUP BY h.id, h.title
ORDER BY completion_count DESC;
