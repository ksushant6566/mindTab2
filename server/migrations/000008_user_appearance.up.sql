ALTER TABLE mindmap_user
  ADD COLUMN theme VARCHAR(32) NOT NULL DEFAULT 'midnight',
  ADD COLUMN font VARCHAR(32) NOT NULL DEFAULT 'inter',
  ADD CONSTRAINT mindmap_user_theme_check CHECK (theme IN ('midnight', 'graphite', 'paper')),
  ADD CONSTRAINT mindmap_user_font_check CHECK (font IN ('inter', 'geist', 'system'));

