-- name: GetConnectedNotes :many
-- Find notes whose content contains a mention of the given entity.
-- mention_pattern should be like '%data-id="task:UUID"%' or '%data-id="note:UUID"%'.
SELECT j.id, j.title, j.content, j.updated_at, j.created_at
FROM notes j
WHERE j.user_id = $1
  AND j.deleted_at IS NULL
  AND j.content LIKE $2
ORDER BY j.updated_at DESC NULLS LAST
LIMIT 10;
