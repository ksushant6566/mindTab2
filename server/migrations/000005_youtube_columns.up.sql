ALTER TABLE mindmap_content
  ADD COLUMN video_duration INTEGER,
  ADD COLUMN video_thumbnail_url TEXT,
  ADD COLUMN video_channel TEXT,
  ADD COLUMN transcript_source TEXT;

COMMENT ON COLUMN mindmap_content.video_duration IS 'Video duration in seconds, YouTube only';
COMMENT ON COLUMN mindmap_content.video_thumbnail_url IS 'YouTube thumbnail URL from yt-dlp metadata';
COMMENT ON COLUMN mindmap_content.video_channel IS 'YouTube channel name';
COMMENT ON COLUMN mindmap_content.transcript_source IS 'captions or whisper — how the transcript was obtained';
