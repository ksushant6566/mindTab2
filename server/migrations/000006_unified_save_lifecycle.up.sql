-- Layer 2: orthogonal commit lifecycle for every save row
ALTER TABLE mindmap_content
  ADD COLUMN commit_status TEXT NOT NULL DEFAULT 'committed';
COMMENT ON COLUMN mindmap_content.commit_status IS 'draft until the user finalises the save; committed otherwise';

-- Layer 3: source-type-agnostic columns
ALTER TABLE mindmap_content
  RENAME COLUMN video_duration TO duration_seconds;
COMMENT ON COLUMN mindmap_content.duration_seconds IS 'Duration in seconds for any time-based content (video, audio)';

ALTER TABLE mindmap_content
  ADD COLUMN media_mime TEXT,
  ADD COLUMN media_file_bytes BIGINT;
COMMENT ON COLUMN mindmap_content.media_mime IS 'MIME type for stored media (audio/mp4, image/png etc.)';
COMMENT ON COLUMN mindmap_content.media_file_bytes IS 'Size of the stored media file in bytes';

-- Partial index for the 3-hourly draft cleanup
CREATE INDEX idx_mindmap_content_drafts
  ON mindmap_content (updated_at)
  WHERE commit_status = 'draft';
