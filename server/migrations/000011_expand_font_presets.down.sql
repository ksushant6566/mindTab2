ALTER TABLE users
  DROP CONSTRAINT IF EXISTS mindmap_user_font_check,
  ADD CONSTRAINT mindmap_user_font_check CHECK (font IN ('codex', 'linear', 'github', 'notion', 'raycast', 'system', 'inter', 'geist'));

UPDATE users
SET font = CASE
  WHEN font IN ('codex', 'github', 'notion') THEN 'inter'
  WHEN font IN ('linear', 'raycast') THEN 'geist'
  ELSE font
END;

ALTER TABLE users
  ALTER COLUMN font SET DEFAULT 'inter';

ALTER TABLE users
  DROP CONSTRAINT IF EXISTS mindmap_user_font_check,
  ADD CONSTRAINT mindmap_user_font_check CHECK (font IN ('inter', 'geist', 'system'));
