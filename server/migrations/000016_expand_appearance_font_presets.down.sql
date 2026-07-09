ALTER TABLE users
  DROP CONSTRAINT IF EXISTS mindmap_user_font_check,
  DROP CONSTRAINT IF EXISTS users_code_font_check;

UPDATE users
SET font = CASE
  WHEN font IN ('sf-pro', 'helvetica', 'avenir', 'ibm-plex', 'roboto', 'segoe') THEN 'geist'
  ELSE font
END,
code_font = CASE
  WHEN code_font IN ('cascadia', 'menlo', 'monaco') THEN 'system-mono'
  ELSE code_font
END;

ALTER TABLE users
  ADD CONSTRAINT mindmap_user_font_check CHECK (font IN ('inter', 'geist', 'system', 'satoshi')),
  ADD CONSTRAINT users_code_font_check CHECK (code_font IN ('jetbrains', 'geist-mono', 'sf-mono', 'fira-code', 'system-mono'));
