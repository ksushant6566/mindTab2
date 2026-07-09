ALTER TABLE users
  DROP CONSTRAINT IF EXISTS users_code_font_check,
  DROP CONSTRAINT IF EXISTS users_appearance_template_check,
  DROP CONSTRAINT IF EXISTS mindmap_user_font_check,
  DROP CONSTRAINT IF EXISTS mindmap_user_theme_check;

ALTER TABLE users
  ADD COLUMN glass_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN glass_opacity INTEGER NOT NULL DEFAULT 70,
  DROP COLUMN IF EXISTS code_font;

UPDATE users
SET theme = CASE
  WHEN theme = 'light' THEN 'paper'
  ELSE 'midnight'
END;

UPDATE users
SET font = CASE
  WHEN font = 'geist' THEN 'raycast'
  WHEN font = 'system' THEN 'system'
  ELSE 'codex'
END;

UPDATE users
SET appearance_template = CASE
  WHEN appearance_template IN ('codex', 'linear', 'github', 'notion') THEN appearance_template
  ELSE 'codex'
END;

ALTER TABLE users
  ALTER COLUMN theme SET DEFAULT 'midnight',
  ALTER COLUMN font SET DEFAULT 'codex',
  ALTER COLUMN accent_color SET DEFAULT '#60AACC',
  ALTER COLUMN background_color SET DEFAULT '#0F0F11',
  ALTER COLUMN foreground_color SET DEFAULT '#E3E4E6',
  ALTER COLUMN contrast SET DEFAULT 82,
  ADD CONSTRAINT mindmap_user_theme_check CHECK (theme IN ('midnight', 'graphite', 'paper')),
  ADD CONSTRAINT mindmap_user_font_check CHECK (font IN ('codex', 'linear', 'github', 'notion', 'raycast', 'system')),
  ADD CONSTRAINT users_appearance_template_check CHECK (appearance_template IN ('codex', 'linear', 'github', 'notion', 'raycast', 'system')),
  ADD CONSTRAINT users_glass_opacity_check CHECK (glass_opacity BETWEEN 0 AND 100);
