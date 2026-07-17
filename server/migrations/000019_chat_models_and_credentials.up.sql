CREATE TABLE IF NOT EXISTS user_ai_provider_credentials (
    user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider VARCHAR(32) NOT NULL CHECK (provider IN ('openai', 'anthropic', 'gemini', 'openrouter')),
    encrypted_api_key BYTEA NOT NULL,
    nonce BYTEA NOT NULL,
    key_hint VARCHAR(8) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, provider)
);

ALTER TABLE conversations
    ADD COLUMN provider VARCHAR(32) NOT NULL DEFAULT 'gemini',
    ADD COLUMN model VARCHAR(160) NOT NULL DEFAULT 'gemini-2.5-flash',
    ADD COLUMN project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
    ADD CONSTRAINT conversations_provider_check CHECK (provider IN ('openai', 'anthropic', 'gemini', 'openrouter'));

CREATE INDEX idx_conversations_project_id ON conversations(project_id) WHERE project_id IS NOT NULL;
