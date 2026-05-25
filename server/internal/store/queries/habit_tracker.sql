-- name: ListHabitTrackerRecords :many
SELECT * FROM habit_records WHERE user_id = $1;

-- name: TrackHabit :one
INSERT INTO habit_records (habit_id, user_id, status, date)
VALUES ($1, $2, 'completed', $3)
ON CONFLICT (habit_id, user_id, date) DO UPDATE SET status = 'completed', updated_at = CURRENT_TIMESTAMP
RETURNING id;

-- name: UntrackHabit :exec
DELETE FROM habit_records WHERE habit_id = $1 AND user_id = $2 AND date = $3;

-- name: IsHabitTrackedOnDate :one
SELECT EXISTS(
  SELECT 1 FROM habit_records
  WHERE habit_id = $1 AND user_id = $2 AND date = $3
) AS tracked;

-- name: GetHabitCompletionStats :many
SELECT h.id AS habit_id,
       h.title AS habit_title,
       COUNT(ht.id) AS completion_count,
       MIN(ht.date) AS first_completion,
       MAX(ht.date) AS last_completion
FROM habits h
LEFT JOIN habit_records ht
  ON h.id = ht.habit_id
  AND ht.date >= @start_date
  AND ht.date <= @end_date
WHERE h.user_id = @user_id
GROUP BY h.id, h.title
ORDER BY completion_count DESC;
