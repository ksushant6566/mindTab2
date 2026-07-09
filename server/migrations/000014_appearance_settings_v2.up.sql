ALTER TABLE users
  DROP CONSTRAINT IF EXISTS mindmap_user_theme_check,
  DROP CONSTRAINT IF EXISTS mindmap_user_font_check,
  DROP CONSTRAINT IF EXISTS users_appearance_template_check,
  DROP CONSTRAINT IF EXISTS users_glass_opacity_check;

UPDATE users
SET theme = CASE
  WHEN theme = 'paper' THEN 'light'
  WHEN theme IN ('midnight', 'graphite') THEN 'dark'
  WHEN theme IN ('system', 'dark', 'light') THEN theme
  ELSE 'system'
END;

UPDATE users
SET font = CASE
  WHEN font IN ('linear', 'raycast', 'geist') THEN 'geist'
  WHEN font = 'system' THEN 'system'
  WHEN font = 'satoshi' THEN 'satoshi'
  ELSE 'inter'
END;

UPDATE users
SET appearance_template = CASE
  WHEN appearance_template IN ('codex', 'linear', 'github', 'notion') THEN appearance_template
  ELSE 'codex'
END;

ALTER TABLE users
  ALTER COLUMN theme SET DEFAULT 'system',
  ALTER COLUMN font SET DEFAULT 'inter',
  ALTER COLUMN accent_color SET DEFAULT '#0169CC',
  ALTER COLUMN background_color SET DEFAULT '#111111',
  ALTER COLUMN foreground_color SET DEFAULT '#FCFCFC',
  ALTER COLUMN contrast SET DEFAULT 60,
  ADD COLUMN code_font VARCHAR(32) NOT NULL DEFAULT 'jetbrains',
  DROP COLUMN IF EXISTS glass_opacity,
  DROP COLUMN IF EXISTS glass_enabled,
  ADD CONSTRAINT mindmap_user_theme_check CHECK (theme IN ('system', 'dark', 'light')),
  ADD CONSTRAINT mindmap_user_font_check CHECK (font IN ('inter', 'geist', 'system', 'satoshi')),
  ADD CONSTRAINT users_appearance_template_check CHECK (appearance_template IN ('absolutely', 'ayu', 'catppuccin', 'codex', 'dracula', 'everforest', 'github', 'gruvbox', 'linear', 'lobster', 'material', 'matrix', 'monokai', 'night-owl', 'nord', 'notion', 'one', 'oscurange', 'proof', 'rose-pine', 'sentry', 'solarized', 'temple', 'tokyo-night', 'vscode-plus')),
  ADD CONSTRAINT users_code_font_check CHECK (code_font IN ('jetbrains', 'geist-mono', 'sf-mono', 'fira-code', 'system-mono'));
