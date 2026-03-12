-- name: CreateContent :one
INSERT INTO mindmap_content (user_id, source_url, source_type, source_title, processing_status)
VALUES ($1, $2, $3, $4, 'pending')
RETURNING id, user_id, source_url, source_type, source_title, processing_status, created_at;

-- name: GetContentByID :one
SELECT id, user_id, source_url, source_type, source_title, source_thumbnail_url,
       extracted_text, visual_description, summary, tags, key_topics,
       summary_provider, embedding_provider, embedding_model,
       media_key, processing_status, processing_error,
       created_at, updated_at
FROM mindmap_content
WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL;

-- name: ListContent :many
SELECT id, user_id, source_url, source_type, source_title, source_thumbnail_url,
       summary, tags, key_topics, media_key,
       processing_status, processing_error,
       created_at, updated_at
FROM mindmap_content
WHERE user_id = $1 AND deleted_at IS NULL
ORDER BY created_at DESC
LIMIT $2 OFFSET $3;

-- name: UpdateContentResults :exec
UPDATE mindmap_content
SET extracted_text = $2,
    visual_description = $3,
    summary = $4,
    tags = $5,
    key_topics = $6,
    source_title = COALESCE($7, source_title),
    summary_provider = $8,
    embedding_provider = $9,
    embedding_model = $10,
    media_key = COALESCE($11, media_key),
    processing_status = 'completed',
    processing_error = NULL,
    updated_at = CURRENT_TIMESTAMP
WHERE id = $1 AND deleted_at IS NULL;

-- name: UpdateContentEmbedding :exec
UPDATE mindmap_content
SET embedding = $2,
    updated_at = CURRENT_TIMESTAMP
WHERE id = $1;

-- name: UpdateContentStatus :exec
UPDATE mindmap_content
SET processing_status = $2,
    processing_error = $3,
    updated_at = CURRENT_TIMESTAMP
WHERE id = $1;

-- name: SoftDeleteContent :exec
UPDATE mindmap_content
SET deleted_at = CURRENT_TIMESTAMP,
    updated_at = CURRENT_TIMESTAMP
WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL;

-- name: IsContentDeleted :one
SELECT deleted_at IS NOT NULL AS is_deleted
FROM mindmap_content
WHERE id = $1;

-- name: CountContent :one
SELECT count(*) FROM mindmap_content
WHERE user_id = $1 AND deleted_at IS NULL;
