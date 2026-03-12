-- Add password hash column to user table (nullable — Google-only users won't have one)
ALTER TABLE mindmap_user ADD COLUMN password_hash VARCHAR(255);

-- Enforce email uniqueness (required for account linking)
CREATE UNIQUE INDEX idx_mindmap_user_email ON mindmap_user(email);

-- Verification tokens for email verification and password reset
CREATE TABLE mindmap_verification_token (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR(255) NOT NULL REFERENCES mindmap_user(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) NOT NULL UNIQUE,
    type VARCHAR(50) NOT NULL,
    password_hash VARCHAR(255),
    attempts INTEGER NOT NULL DEFAULT 0,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_verification_token_user_id ON mindmap_verification_token(user_id);
