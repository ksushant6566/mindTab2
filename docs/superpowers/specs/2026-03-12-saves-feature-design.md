# Saves Feature — Design Spec

Integrate a content saving and semantic search system into the existing MindTab Go server. Users can save articles (URLs) and images, which are processed asynchronously by AI to extract summaries, tags, and vector embeddings for natural language search.

## Scope

**Phase 1 content types:** Articles (URLs) and Images only. YouTube, Reels, and Audio are future phases that layer onto the same architecture.

## Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Content types | Articles + Images | Covers most common saves; no ffmpeg/yt-dlp needed |
| Job queue | Redis | Proper retry/dead-letter semantics; useful for future caching |
| Provider architecture | Interfaces, one impl each | Prove the pipeline first, add fallbacks later |
| LLM provider | Gemini Flash | Best price-to-quality for summarization + vision |
| Embedding provider | OpenAI text-embedding-3-small | Best price-to-quality, 1536 dimensions |
| Media storage | StorageProvider interface, local filesystem | Clean abstraction; swap to R2 later via env var |
| Search | pgvector cosine similarity | Sufficient at personal-scale corpus; no reranking |
| Architecture | Embedded single binary, split-ready | Simple deployment now, extract workers later |

## Database Schema

Migration 000003 adds pgvector extension and two tables.

### pgvector Extension

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

### mindmap_content

Stores saved items and their AI-generated metadata.

```sql
CREATE TABLE mindmap_content (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR(255) NOT NULL REFERENCES mindmap_user(id) ON DELETE CASCADE,

    -- Source
    source_url TEXT,
    source_type TEXT NOT NULL,          -- 'article', 'image'
    source_title TEXT,
    source_thumbnail_url TEXT,

    -- Extracted content
    extracted_text TEXT,                -- article body or OCR text
    visual_description TEXT,            -- image description from vision

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
    media_key TEXT,                     -- StorageProvider key

    -- Status
    processing_status TEXT NOT NULL DEFAULT 'pending',
    processing_error TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMPTZ             -- soft delete
);

CREATE INDEX idx_content_user_id ON mindmap_content(user_id);
CREATE INDEX idx_content_source_type ON mindmap_content(source_type);
CREATE INDEX idx_content_processing_status ON mindmap_content(processing_status);
CREATE INDEX idx_content_tags ON mindmap_content USING GIN(tags);
CREATE INDEX idx_content_created_at ON mindmap_content(created_at DESC);
CREATE INDEX idx_content_embedding ON mindmap_content
    USING hnsw (embedding vector_cosine_ops);
```

Key adaptations from original spec:
- `user_id` is `VARCHAR(255)` to match existing `mindmap_user.id`
- `mindmap_` prefix consistent with existing tables
- `deleted_at` for soft delete consistency
- `DEFAULT CURRENT_TIMESTAMP` to match existing migration conventions
- HNSW index instead of IVFFlat (IVFFlat requires training data; HNSW works on empty tables)
- Removed transcript/duration/language fields (not needed for articles + images)

### Down Migration

```sql
DROP TABLE IF EXISTS mindmap_jobs;
DROP TABLE IF EXISTS mindmap_content;
DROP EXTENSION IF EXISTS vector;
```

### mindmap_jobs

Tracks async processing jobs with step-level checkpointing.

```sql
CREATE TABLE mindmap_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    content_id UUID NOT NULL REFERENCES mindmap_content(id) ON DELETE CASCADE,
    user_id VARCHAR(255) NOT NULL REFERENCES mindmap_user(id) ON DELETE CASCADE,

    content_type TEXT NOT NULL,         -- 'article', 'image' (intentional denormalization of source_type for worker access without joins)
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
```

## Provider Interfaces

### LLM Provider

Used for summarization, tag extraction, and image vision/OCR. Gemini Flash handles both text and multimodal through the same API.

```go
// internal/providers/llm/interface.go
type LLMProvider interface {
    Complete(ctx context.Context, req LLMRequest) (*LLMResponse, error)
    Name() string
}

type LLMRequest struct {
    SystemPrompt string
    UserPrompt   string
    Images       []ImageInput
    MaxTokens    int
    Temperature  float64
}

type ImageInput struct {
    Data      []byte
    MediaType string   // "image/jpeg", "image/png"
}

type LLMResponse struct {
    Text     string
    Provider string
    Tokens   TokenUsage
}

type TokenUsage struct {
    Input  int
    Output int
}
```

Implementation: `gemini.go` using `google.golang.org/genai` SDK.

### Embedding Provider

```go
// internal/providers/embedding/interface.go
type EmbeddingProvider interface {
    Embed(ctx context.Context, texts []string) ([][]float32, error)
    Dimensions() int
    Name() string
}
```

Implementation: `openai.go` calling text-embedding-3-small API.

### Provider Chain

Generic chain wrapper provides consistent calling pattern, structured error logging, and fallback support when additional providers are added.

```go
// internal/providers/chain.go
type Chain[T any] struct {
    providers []T
    logger    *slog.Logger
}
```

Error classification:
- **Retriable** (timeout, rate limit, 5xx): try next provider
- **Permanent** (auth failure, invalid input): fail immediately

### Provider Registry

Reads env vars, instantiates providers, builds chains. Logs error and exits cleanly (`slog.Error` + `os.Exit(1)`) if a required chain has zero available providers, matching existing startup error patterns.

## Redis Queue

### Keys

```
mindtab:jobs:pending          LIST       — FIFO job queue
mindtab:jobs:processing       LIST       — currently being worked on
mindtab:jobs:retry            SORTED SET — score = next retry unix timestamp
mindtab:jobs:dead             LIST       — dead letter queue
mindtab:jobs:lock:{job_id}    STRING     — per-job lock with TTL
```

### Job Lifecycle

```
POST /saves
  → Insert mindmap_content (pending)
  → Insert mindmap_jobs (pending)
  → LPUSH to mindtab:jobs:pending
  → Return 201 with content ID

Worker goroutine
  → BRPOPLPUSH pending → processing (30s block)
  → SET lock with 5min TTL
  → Route to processor by content_type
  → Execute steps, checkpoint after each
  → Success: update Postgres, LREM from processing
  → Failure (retriable): backoff → ZADD to retry set
  → Failure (permanent / max attempts): LPUSH to dead letter

Retry scheduler (goroutine, polls every 5s)
  → ZRANGEBYSCORE for due jobs → ZREM + LPUSH to pending

Startup recovery
  → Scan processing list for expired locks
  → Move orphaned jobs back to pending
```

### Retry Strategy

Two levels:
1. **Provider chain fallback** — instant, within a step. Chain tries each provider in order.
2. **Job retry** — delayed, across executions. Exponential backoff: `base * 2^(attempt-1)`, capped at 10min, 25% jitter.

### Graceful Shutdown

On SIGTERM: stop accepting new jobs, wait for in-progress jobs up to `WORKER_SHUTDOWN_TIMEOUT` (default 30s), then force exit. The existing server shutdown timeout (10s) must be extended to accommodate worker drain time — the HTTP server and workers shut down concurrently, with the overall timeout set to `max(10s, WORKER_SHUTDOWN_TIMEOUT)`.

## Processing Pipelines

### Article Processor

Steps: `extract → summarize → embed → store`

1. **extract**: Fetch URL via Jina Reader (`GET https://r.jina.ai/{url}`). Fallback: plain HTTP GET if Jina fails.
2. **summarize**: LLM chain with extracted markdown → JSON with `summary`, `tags[]`, `key_topics[]`.
3. **embed**: Embedding chain on summary + first 2000 chars of extracted text.
4. **store**: Update `mindmap_content` with all results, mark job complete.

### Image Processor

Steps: `save → vision → summarize → embed → store`

1. **save**: Save uploaded image via StorageProvider → get `media_key`.
2. **vision**: LLM chain with image attached → JSON with `extracted_text` (OCR), `visual_description`.
3. **summarize**: LLM chain with description + OCR text → JSON with `summary`, `tags[]`, `key_topics[]`.
4. **embed**: Embedding chain on summary + visual_description.
5. **store**: Update `mindmap_content` with all results, mark job complete.

### Processor Interface

```go
type Processor interface {
    ContentType() string
    Steps() []string
    Execute(ctx context.Context, step string, job *Job, prevResults StepResults) (*StepResult, error)
}
```

Steps are idempotent. Results are checkpointed to `step_results` JSONB. On resume, completed steps are skipped.

The **store** step must verify `mindmap_content.deleted_at IS NULL` before writing final results. If the user soft-deleted the content while processing was in-flight, the store step skips the write and marks the job as cancelled.

### LLM Prompts

Two structured prompts requesting JSON output:
- **Summarization**: input text/description → `{ "summary": "...", "tags": [...], "key_topics": [...] }`
- **Vision**: input image → `{ "extracted_text": "...", "visual_description": "..." }`

## API Endpoints

All under existing auth middleware. User-scoped via JWT.

| Method | Path | Description |
|---|---|---|
| POST | /saves | Ingest content (URL or image upload) |
| GET | /saves | List saved content (paginated) |
| GET | /saves/{id} | Get single saved content (includes processing_status) |
| DELETE | /saves/{id} | Soft delete |
| POST | /saves/search | Semantic search |

### POST /saves

Two input modes:
- `application/json` with `{ "url": "https://..." }` → article pipeline
- `multipart/form-data` with image file → image pipeline

Returns `201 { "id": "<content_id>", "status": "pending" }`.

Validation:
- URL: must be a valid HTTP/HTTPS URL, max 2048 characters. Duplicate URLs for the same user are allowed (user may want to re-save).
- Image: allowed MIME types are `image/jpeg`, `image/png`, `image/webp`. Max size governed by `MAX_FILE_SIZE_MB` env var (default 20MB).
- Returns `400` for invalid input, `413` for oversized files.

### POST /saves/search

Input: `{ "query": "..." }`

Flow:
1. Embed query via embedding chain
2. pgvector cosine similarity against user's content (`WHERE user_id = ? AND deleted_at IS NULL`)
3. Return top N results (default 10) with similarity scores

## Storage

### StorageProvider Interface

```go
type StorageProvider interface {
    Save(ctx context.Context, key string, data io.Reader, contentType string) error
    Get(ctx context.Context, key string) (io.ReadCloser, error)
    Delete(ctx context.Context, key string) error
    URL(key string) string
}
```

### Local Filesystem Implementation

Files stored at `{STORAGE_LOCAL_PATH}/{user_id}/{content_id}/{filename}`. Served via `GET /media/*` behind auth middleware.

Future: add `r2.go` implementation, flip `STORAGE_PROVIDER=r2` env var.

## Configuration

New env vars added to existing `internal/config/config.go`:

```env
# Redis
REDIS_URL=redis://localhost:6379/0

# Provider API keys
GEMINI_API_KEY=...
OPENAI_API_KEY=...
JINA_API_KEY=...

# Provider models
GEMINI_MODEL=gemini-2.0-flash

# Embedding
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
EMBEDDING_DIMENSIONS=1536

# Storage
STORAGE_PROVIDER=local
STORAGE_LOCAL_PATH=/data/mindtab/media

# Worker
WORKER_CONCURRENCY=4
WORKER_SHUTDOWN_TIMEOUT=30s
MAX_FILE_SIZE_MB=20
```

## Startup Sequence

Extended from existing `cmd/api/main.go`:

1. Load config *(existing)*
2. Connect PostgreSQL pool *(existing)*
3. Initialize sqlc Queries *(existing)*
4. **Connect Redis** *(new)*
5. **Initialize provider registry** *(new)* — build LLM chain (Gemini), embedding chain (OpenAI)
6. **Initialize StorageProvider** *(new)* — local filesystem
7. **Initialize queue producer** *(new)*
8. Create all handlers *(existing + new saves handler)*
9. Set up chi router + middleware *(existing)*
10. Register all routes *(existing + new saves routes)*
11. **Start worker dispatcher goroutines** *(new)*
12. **Start retry scheduler goroutine** *(new)*
13. **Run startup recovery sweep** *(new)*
14. Start HTTP server *(existing)*
15. Graceful shutdown *(extended)* — stop workers, wait 30s, close Redis, close Postgres

## New Go Dependencies

- `github.com/redis/go-redis/v9` — Redis client
- `github.com/pgvector/pgvector-go` — pgvector support for pgx
- `google.golang.org/genai` — Gemini SDK

## New Package Structure

```
server/internal/
├── handler/
│   └── saves.go              # HTTP handlers for /saves endpoints (matches existing pattern)
├── store/
│   └── queries/
│       ├── content.sql       # sqlc queries: insert, update, list, get, soft delete, vector search
│       └── jobs.sql          # sqlc queries: insert, update status, get by content_id
├── providers/
│   ├── chain.go              # Generic Chain[T] with fallback
│   ├── errors.go             # Retriable / Permanent error types
│   ├── registry.go           # Reads env, builds all chains
│   ├── llm/
│   │   ├── interface.go      # LLMProvider interface
│   │   └── gemini.go         # Gemini Flash implementation
│   └── embedding/
│       ├── interface.go      # EmbeddingProvider interface
│       └── openai.go         # OpenAI text-embedding-3-small
├── queue/
│   ├── redis.go              # Redis connection
│   ├── producer.go           # Enqueue jobs
│   ├── consumer.go           # Dequeue jobs (BRPOPLPUSH)
│   └── retry.go              # Retry scheduler + startup recovery
├── worker/
│   ├── dispatcher.go         # Worker loop, N goroutines
│   ├── processor.go          # Processor interface
│   ├── processors/
│   │   ├── article.go        # Article processor (extract→summarize→embed→store)
│   │   └── image.go          # Image processor (save→vision→summarize→embed→store)
│   └── steps/
│       ├── extract.go        # Jina Reader fetch
│       ├── vision.go         # LLM chain with image
│       ├── summarize.go      # LLM chain for summary + tags
│       ├── embed.go          # Embedding chain
│       └── store.go          # Write results to Postgres
├── services/
│   ├── jina.go               # Jina Reader HTTP client
│   └── storage.go            # StorageProvider interface + local impl
└── search/
    └── semantic.go           # Embed query → pgvector search
```

Note: The pgvector similarity search query may need raw SQL via the pgx pool if sqlc cannot express the `ORDER BY embedding <=> $1` syntax cleanly. All other queries use sqlc.

## Additional Deliverables

- Update OpenAPI spec in `packages/api-spec/` with the new `/saves` and `/saves/search` endpoints
- All sqlc update queries must explicitly set `updated_at = CURRENT_TIMESTAMP`

## Future Phases

These are explicitly out of scope but the architecture supports them:

- **Phase 2**: YouTube videos/shorts — add yt-dlp wrapper, transcription chain (Groq Whisper), frame extraction, youtube processor
- **Phase 3**: Instagram Reels, audio files — add ffmpeg wrapper, reel/audio processors
- **Phase 4**: Fallback providers — add claude.go, openai.go to LLM; voyage.go, mistral.go to embedding
- **Phase 5**: LLM reranking for search, R2 storage migration
