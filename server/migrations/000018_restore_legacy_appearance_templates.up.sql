ALTER TABLE users
  DROP CONSTRAINT IF EXISTS users_appearance_template_check,
  ADD CONSTRAINT users_appearance_template_check CHECK (appearance_template IN ('absolutely', 'ayu', 'catppuccin', 'codex', 'dracula', 'everforest', 'github', 'graphite', 'gruvbox', 'linear', 'lobster', 'material', 'matrix', 'midnight', 'monokai', 'night-owl', 'nord', 'notion', 'one', 'oscurange', 'paper', 'proof', 'rose-pine', 'sentry', 'solarized', 'temple', 'tokyo-night', 'vscode-plus'));
