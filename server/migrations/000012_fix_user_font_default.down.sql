-- Version 11 already expects the strict font preset set, so rolling back only
-- this repair migration should keep the compatible default.
ALTER TABLE users
  ALTER COLUMN font SET DEFAULT 'codex';
