ALTER TABLE mindmap_content
  DROP CONSTRAINT IF EXISTS mindmap_content_source_metadata_object,
  DROP COLUMN IF EXISTS source_metadata;
