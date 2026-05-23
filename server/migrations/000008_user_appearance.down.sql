ALTER TABLE mindmap_user
  DROP CONSTRAINT IF EXISTS mindmap_user_font_check,
  DROP CONSTRAINT IF EXISTS mindmap_user_theme_check,
  DROP COLUMN IF EXISTS font,
  DROP COLUMN IF EXISTS theme;

