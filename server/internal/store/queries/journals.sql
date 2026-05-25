-- name: CreateJournal :exec
INSERT INTO notes (title, content, user_id, project_id)
VALUES ($1, $2, $3, $4);

-- name: GetJournalByID :one
SELECT j.id, j.title, j.content, j.type, j.source,
       j.created_at, j.updated_at, j.deleted_at, j.archived_at, j.user_id, j.project_id,
       p.id as "project_ref_id", p.name as "project_name", p.status as "project_status"
FROM notes j
LEFT JOIN projects p ON j.project_id = p.id
WHERE j.id = $1 AND j.user_id = $2;

-- name: ListJournals :many
SELECT j.id, j.title, j.content, j.type, j.source,
       j.created_at, j.updated_at, j.deleted_at, j.archived_at, j.user_id, j.project_id,
       p.id as "project_ref_id", p.name as "project_name", p.status as "project_status"
FROM notes j
LEFT JOIN projects p ON j.project_id = p.id
WHERE j.user_id = $1
  AND j.deleted_at IS NULL
  AND ($2::uuid IS NULL OR j.project_id = $2::uuid)
ORDER BY j.updated_at DESC;

-- name: CountJournals :one
SELECT COUNT(*)::int FROM notes WHERE user_id = $1 AND deleted_at IS NULL;

-- name: UpdateJournal :exec
UPDATE notes SET
    title = COALESCE($3, title),
    content = COALESCE($4, content),
    project_id = $5,
    updated_at = CURRENT_TIMESTAMP
WHERE id = $1 AND user_id = $2;

-- name: DeleteJournal :exec
UPDATE notes SET deleted_at = CURRENT_TIMESTAMP WHERE id = $1 AND user_id = $2;

-- name: CheckJournalTitleExists :one
SELECT EXISTS(
    SELECT 1 FROM notes
    WHERE user_id = $1 AND title = $2 AND deleted_at IS NULL
    AND ($3::uuid IS NULL OR id != $3::uuid)
) AS "exists";

-- name: SearchJournals :many
SELECT * FROM notes
WHERE user_id = $1 AND deleted_at IS NULL AND title ILIKE '%' || $2 || '%'
ORDER BY created_at DESC LIMIT 5;

-- name: UpsertJournalFromSync :exec
INSERT INTO notes (title, content, user_id, source, type)
VALUES ($1, $2, $3, $4, $5)
ON CONFLICT (user_id, title) WHERE deleted_at IS NULL
DO UPDATE SET content = EXCLUDED.content, updated_at = CURRENT_TIMESTAMP;

-- name: SoftDeleteJournalsByProject :exec
UPDATE notes SET deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
WHERE project_id = $1 AND user_id = $2;

-- name: ArchiveJournalsByProject :exec
UPDATE notes SET archived_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
WHERE project_id = $1 AND user_id = $2;
