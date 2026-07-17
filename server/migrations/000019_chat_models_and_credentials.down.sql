DROP INDEX IF EXISTS idx_conversations_project_id;

ALTER TABLE conversations
    DROP CONSTRAINT IF EXISTS conversations_provider_check,
    DROP COLUMN IF EXISTS project_id,
    DROP COLUMN IF EXISTS model,
    DROP COLUMN IF EXISTS provider;

DROP TABLE IF EXISTS user_ai_provider_credentials;
