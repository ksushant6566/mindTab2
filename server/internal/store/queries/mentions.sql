-- name: GetConnectedNotes :many
-- Find notes/journals whose content contains a mention of the given entity.
-- mention_pattern should be like '%data-id="goal:UUID"%' or '%data-id="habit:UUID"%'.
SELECT j.id, j.title, j.content, j.updated_at, j.created_at
FROM mindmap_journal j
WHERE j.user_id = $1
  AND j.deleted_at IS NULL
  AND j.content LIKE $2
ORDER BY j.updated_at DESC NULLS LAST
LIMIT 10;

-- name: GetConnectedHabitIDs :many
-- Find habit UUIDs mentioned in notes that also mention a given goal.
-- goal_pattern should be like '%data-id="goal:UUID"%'.
-- Returns distinct habit IDs extracted via regex from note content.
SELECT DISTINCT (regexp_matches(j.content, 'data-id="habit:([0-9a-f\-]{36})"', 'g'))[1]::uuid AS habit_id
FROM mindmap_journal j
WHERE j.user_id = $1
  AND j.deleted_at IS NULL
  AND j.content LIKE $2;

-- name: GetHabitsByIDs :many
-- Fetch habits by a list of IDs for a given user.
SELECT * FROM mindmap_habit
WHERE user_id = $1
  AND deleted_at IS NULL
  AND id = ANY($2::uuid[]);
