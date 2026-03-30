ALTER TABLE mindmap_content
  DROP COLUMN IF EXISTS video_duration,
  DROP COLUMN IF EXISTS video_thumbnail_url,
  DROP COLUMN IF EXISTS video_channel,
  DROP COLUMN IF EXISTS transcript_source;
