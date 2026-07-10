UPDATE users
SET appearance_template = 'codex'
WHERE appearance_template IN ('graphite', 'midnight', 'paper');

ALTER TABLE users
  DROP CONSTRAINT IF EXISTS users_appearance_template_check,
  ADD CONSTRAINT users_appearance_template_check CHECK (appearance_template IN ('absolutely', 'ayu', 'catppuccin', 'codex', 'dracula', 'everforest', 'github', 'gruvbox', 'linear', 'lobster', 'material', 'matrix', 'monokai', 'night-owl', 'nord', 'notion', 'one', 'oscurange', 'proof', 'rose-pine', 'sentry', 'solarized', 'temple', 'tokyo-night', 'vscode-plus'));
