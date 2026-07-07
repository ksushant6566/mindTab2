ALTER TABLE users
  DROP CONSTRAINT IF EXISTS mindmap_user_font_check,
  ADD CONSTRAINT mindmap_user_font_check CHECK (font IN ('codex', 'linear', 'github', 'notion', 'raycast', 'system', 'inter', 'geist'));

UPDATE users
SET font = CASE
  WHEN font = 'inter' THEN 'codex'
  WHEN font = 'geist' THEN 'raycast'
  ELSE font
END;

ALTER TABLE users
  ALTER COLUMN font SET DEFAULT 'codex';

ALTER TABLE users
  DROP CONSTRAINT IF EXISTS mindmap_user_font_check,
  ADD CONSTRAINT mindmap_user_font_check CHECK (font IN ('codex', 'linear', 'github', 'notion', 'raycast', 'system'));
