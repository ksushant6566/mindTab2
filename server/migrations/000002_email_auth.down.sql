DROP TABLE IF EXISTS mindmap_verification_token;
DROP INDEX IF EXISTS idx_mindmap_user_email;
ALTER TABLE mindmap_user DROP COLUMN IF EXISTS password_hash;
