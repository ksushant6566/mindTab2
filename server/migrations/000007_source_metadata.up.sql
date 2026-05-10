ALTER TABLE mindmap_content
  ADD COLUMN source_metadata JSONB,
  ADD CONSTRAINT mindmap_content_source_metadata_object
    CHECK (source_metadata IS NULL OR jsonb_typeof(source_metadata) = 'object');

COMMENT ON COLUMN mindmap_content.source_metadata IS 'Source-specific metadata captured by first-class processors, keyed by source_type';
