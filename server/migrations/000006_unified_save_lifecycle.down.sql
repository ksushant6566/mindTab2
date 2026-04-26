DROP INDEX IF EXISTS idx_mindmap_content_drafts;

ALTER TABLE mindmap_content
  DROP COLUMN IF EXISTS media_file_bytes,
  DROP COLUMN IF EXISTS media_mime;

ALTER TABLE mindmap_content
  RENAME COLUMN duration_seconds TO video_duration;

ALTER TABLE mindmap_content
  DROP COLUMN IF EXISTS commit_status;
