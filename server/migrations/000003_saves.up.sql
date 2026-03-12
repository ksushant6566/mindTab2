CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE mindmap_content (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR(255) NOT NULL REFERENCES mindmap_user(id) ON DELETE CASCADE,

    -- Source
    source_url TEXT,
    source_type TEXT NOT NULL,
    source_title TEXT,
    source_thumbnail_url TEXT,

    -- Extracted content
    extracted_text TEXT,
    visual_description TEXT,

    -- AI-generated
    summary TEXT,
    tags TEXT[] DEFAULT '{}',
    key_topics TEXT[] DEFAULT '{}',

    -- Vector
    embedding vector(1536),

    -- Provider tracking
    summary_provider TEXT,
    embedding_provider TEXT,
    embedding_model TEXT,

    -- Media (for images)
    media_key TEXT,

    -- Status
    processing_status TEXT NOT NULL DEFAULT 'pending',
    processing_error TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_content_user_id ON mindmap_content(user_id);
CREATE INDEX idx_content_source_type ON mindmap_content(source_type);
CREATE INDEX idx_content_processing_status ON mindmap_content(processing_status);
CREATE INDEX idx_content_tags ON mindmap_content USING GIN(tags);
CREATE INDEX idx_content_created_at ON mindmap_content(created_at DESC);
CREATE INDEX idx_content_embedding ON mindmap_content
    USING hnsw (embedding vector_cosine_ops);

CREATE TABLE mindmap_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    content_id UUID NOT NULL REFERENCES mindmap_content(id) ON DELETE CASCADE,
    user_id VARCHAR(255) NOT NULL REFERENCES mindmap_user(id) ON DELETE CASCADE,

    content_type TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    current_step TEXT,

    attempt_count INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 5,
    last_error TEXT,
    next_retry_at TIMESTAMPTZ,

    step_results JSONB DEFAULT '{}',

    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_jobs_status ON mindmap_jobs(status);
CREATE INDEX idx_jobs_content_id ON mindmap_jobs(content_id);
CREATE INDEX idx_jobs_next_retry ON mindmap_jobs(next_retry_at)
    WHERE status = 'retry';
