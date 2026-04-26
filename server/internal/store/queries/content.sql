-- name: CreateContent :one
INSERT INTO mindmap_content (
    id,
    user_id, source_url, source_type, source_title,
    extracted_text, media_key, media_mime, media_file_bytes,
    duration_seconds,
    processing_status, commit_status
) VALUES (
    $1,
    $2, $3, $4, $5,
    $6, $7, $8, $9,
    $10,
    $11, $12
)
RETURNING id, user_id, source_url, source_type, source_title, source_thumbnail_url,
          extracted_text, visual_description, summary, tags, key_topics,
          summary_provider, embedding_provider, embedding_model,
          media_key, media_mime, media_file_bytes, processing_status, processing_error,
          duration_seconds, video_thumbnail_url, video_channel, transcript_source,
          commit_status, created_at, updated_at;

-- name: CreateContentWithExtracted :one
INSERT INTO mindmap_content (
    id,
    user_id, source_url, source_type, source_title,
    extracted_text, media_key, media_mime, media_file_bytes,
    duration_seconds,
    processing_status, commit_status
) VALUES (
    $1,
    $2, $3, $4, $5,
    $6, $7, $8, $9,
    $10,
    $11, $12
)
RETURNING id, user_id, source_url, source_type, source_title, source_thumbnail_url,
          extracted_text, visual_description, summary, tags, key_topics,
          summary_provider, embedding_provider, embedding_model,
          media_key, media_mime, media_file_bytes, processing_status, processing_error,
          duration_seconds, video_thumbnail_url, video_channel, transcript_source,
          commit_status, created_at, updated_at;

-- name: GetContentByID :one
SELECT id, user_id, source_url, source_type, source_title, source_thumbnail_url,
       extracted_text, visual_description, summary, tags, key_topics,
       summary_provider, embedding_provider, embedding_model,
       media_key, processing_status, processing_error,
       duration_seconds, video_thumbnail_url, video_channel, transcript_source,
       commit_status, created_at, updated_at
FROM mindmap_content
WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL;

-- name: ListContent :many
SELECT id, user_id, source_url, source_type, source_title, source_thumbnail_url,
       summary, tags, key_topics, media_key,
       processing_status, processing_error,
       duration_seconds, video_thumbnail_url, video_channel,
       created_at, updated_at
FROM mindmap_content
WHERE user_id = $1 AND deleted_at IS NULL
  AND commit_status = 'committed'
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

-- name: UpdateContentYoutubeFields :exec
UPDATE mindmap_content
SET duration_seconds = $2,
    video_thumbnail_url = $3,
    video_channel = $4,
    transcript_source = $5,
    updated_at = NOW()
WHERE id = $1 AND deleted_at IS NULL;

-- name: UpdateContentTranscriptSource :exec
UPDATE mindmap_content
SET transcript_source = $2,
    updated_at = NOW()
WHERE id = $1 AND deleted_at IS NULL;

-- name: IsContentDeleted :one
SELECT (deleted_at IS NOT NULL)::bool AS is_deleted
FROM mindmap_content
WHERE id = $1;

-- name: CountContent :one
SELECT count(*) FROM mindmap_content
WHERE user_id = $1 AND deleted_at IS NULL
  AND commit_status = 'committed';

-- name: UpdateContentCommitStatus :exec
UPDATE mindmap_content
SET commit_status = $2,
    source_title  = COALESCE($3, source_title),
    updated_at    = CURRENT_TIMESTAMP
WHERE id = $1
  AND user_id = $4
  AND deleted_at IS NULL;

-- name: UpdateContentProcessingStatusToPending :exec
UPDATE mindmap_content
SET processing_status = 'pending',
    updated_at        = CURRENT_TIMESTAMP
WHERE id = $1
  AND processing_status = 'deferred'
  AND deleted_at IS NULL;

-- name: DeleteExpiredDraftsReturningKeys :many
-- Atomically deletes expired drafts and returns the media_key of each deleted
-- row. Combining SELECT + DELETE into one statement closes the TOCTOU window
-- where a draft could be committed between the two queries, which previously
-- caused us to delete media for a now-committed row.
DELETE FROM mindmap_content
WHERE commit_status = 'draft'
  AND updated_at < $1
RETURNING id, media_key;
