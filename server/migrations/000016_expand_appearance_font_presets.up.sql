ALTER TABLE users
  DROP CONSTRAINT IF EXISTS mindmap_user_font_check,
  DROP CONSTRAINT IF EXISTS users_code_font_check;

UPDATE users
SET font = CASE
  WHEN font = 'satoshi' THEN 'geist'
  ELSE font
END;

ALTER TABLE users
  ADD CONSTRAINT mindmap_user_font_check CHECK (font IN (
    'geist',
    'inter',
    'system',
    'sf-pro',
    'helvetica',
    'avenir',
    'ibm-plex',
    'roboto',
    'segoe'
  )),
  ADD CONSTRAINT users_code_font_check CHECK (code_font IN (
    'system-mono',
    'geist-mono',
    'sf-mono',
    'jetbrains',
    'fira-code',
    'cascadia',
    'menlo',
    'monaco'
  ));
