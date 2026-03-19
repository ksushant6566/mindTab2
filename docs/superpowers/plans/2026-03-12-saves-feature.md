# Saves Feature Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add content saving (articles + images) with async AI processing and semantic search to the existing MindTab Go server.

**Architecture:** New content is saved to Postgres and queued in Redis. Worker goroutines process items through AI pipelines (Jina Reader for articles, Gemini Flash for summarization/vision, OpenAI for embeddings). Results are stored with pgvector embeddings for semantic search.

**Tech Stack:** Go, Chi router, PostgreSQL + pgvector, Redis, sqlc, Gemini Flash API, OpenAI Embeddings API, Jina Reader API

**Spec:** `docs/superpowers/specs/2026-03-12-saves-feature-design.md`

**Worktree:** Work in the `feature/saves` worktree at `../mindtab-v2-saves/server/`. All file paths below are relative to that `server/` directory.

---

## File Structure

### New Files

| File | Responsibility |
|---|---|
| `migrations/000003_saves.up.sql` | pgvector extension, mindmap_content, mindmap_jobs tables |
| `migrations/000003_saves.down.sql` | Drop tables and extension |
| `internal/store/queries/content.sql` | sqlc queries for content CRUD + vector search |
| `internal/store/queries/jobs.sql` | sqlc queries for job CRUD + status updates |
| `internal/providers/errors.go` | Retriable / Permanent error types |
| `internal/providers/chain.go` | Generic `Chain[T]` with fallback logic |
| `internal/providers/chain_test.go` | Chain fallback tests |
| `internal/providers/llm/interface.go` | LLMProvider interface + request/response types |
| `internal/providers/llm/gemini.go` | Gemini Flash implementation |
| `internal/providers/embedding/interface.go` | EmbeddingProvider interface |
| `internal/providers/embedding/openai.go` | OpenAI text-embedding-3-small implementation |
| `internal/providers/registry.go` | Reads config, builds provider chains |
| `internal/services/storage.go` | StorageProvider interface + local filesystem impl |
| `internal/services/storage_test.go` | Storage tests |
| `internal/services/jina.go` | Jina Reader HTTP client |
| `internal/services/jina_test.go` | Jina client tests with mock HTTP server |
| `internal/queue/redis.go` | Redis connection setup |
| `internal/queue/producer.go` | Enqueue jobs to Redis |
| `internal/queue/consumer.go` | Dequeue jobs from Redis (BRPOPLPUSH) |
| `internal/queue/retry.go` | Retry scheduler + startup recovery |
| `internal/worker/processor.go` | Processor interface + Job/StepResult types |
| `internal/worker/dispatcher.go` | Worker loop running N goroutines |
| `internal/worker/steps/extract.go` | Jina Reader article extraction step |
| `internal/worker/steps/vision.go` | LLM vision/OCR step |
| `internal/worker/steps/summarize.go` | LLM summarization step |
| `internal/worker/steps/embed.go` | Embedding generation step |
| `internal/worker/steps/store.go` | Write results to Postgres step |
| `internal/worker/processors/article.go` | Article processor (extract→summarize→embed→store) |
| `internal/worker/processors/image.go` | Image processor (save→vision→summarize→embed→store) |
| `internal/search/semantic.go` | Embed query → pgvector cosine similarity search |
| `internal/handler/saves.go` | HTTP handlers for /saves endpoints |

### Modified Files

| File | Changes |
|---|---|
| `internal/config/config.go` | Add Redis, provider, storage, worker config fields |
| `cmd/api/main.go` | Wire Redis, providers, queue, workers, saves handler, shutdown |
| `go.mod` | Add redis, pgvector, genai dependencies |

---

## Chunk 1: Database & Configuration Foundation

### Task 1: Database Migration

**Files:**
- Create: `migrations/000003_saves.up.sql`
- Create: `migrations/000003_saves.down.sql`

- [ ] **Step 1: Create up migration**

Create `migrations/000003_saves.up.sql`:

```sql
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
```

- [ ] **Step 2: Create down migration**

Create `migrations/000003_saves.down.sql`:

```sql
DROP TABLE IF EXISTS mindmap_jobs;
DROP TABLE IF EXISTS mindmap_content;
DROP EXTENSION IF EXISTS vector;
```

- [ ] **Step 3: Commit**

```bash
git add migrations/000003_saves.up.sql migrations/000003_saves.down.sql
git commit -m "feat(saves): add database migration for content and jobs tables"
```

### Task 2: sqlc Queries

**Files:**
- Create: `internal/store/queries/content.sql`
- Create: `internal/store/queries/jobs.sql`

- [ ] **Step 1: Create content queries**

Create `internal/store/queries/content.sql`:

```sql
-- name: CreateContent :one
INSERT INTO mindmap_content (user_id, source_url, source_type, source_title, processing_status)
VALUES ($1, $2, $3, $4, 'pending')
RETURNING id, user_id, source_url, source_type, source_title, processing_status, created_at;

-- name: GetContentByID :one
SELECT id, user_id, source_url, source_type, source_title, source_thumbnail_url,
       extracted_text, visual_description, summary, tags, key_topics,
       summary_provider, embedding_provider, embedding_model,
       media_key, processing_status, processing_error,
       created_at, updated_at
FROM mindmap_content
WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL;

-- name: ListContent :many
SELECT id, user_id, source_url, source_type, source_title, source_thumbnail_url,
       summary, tags, key_topics, media_key,
       processing_status, processing_error,
       created_at, updated_at
FROM mindmap_content
WHERE user_id = $1 AND deleted_at IS NULL
ORDER BY created_at DESC
LIMIT $2 OFFSET $3;

-- name: UpdateContentResults :exec
UPDATE mindmap_content
SET extracted_text = $2,
    visual_description = $3,
    summary = $4,
    tags = $5,
    key_topics = $6,
    source_title = COALESCE($7, source_title),
    summary_provider = $8,
    embedding_provider = $9,
    embedding_model = $10,
    media_key = COALESCE($11, media_key),
    processing_status = 'completed',
    processing_error = NULL,
    updated_at = CURRENT_TIMESTAMP
WHERE id = $1 AND deleted_at IS NULL;

-- name: UpdateContentEmbedding :exec
UPDATE mindmap_content
SET embedding = $2,
    updated_at = CURRENT_TIMESTAMP
WHERE id = $1;

-- name: UpdateContentStatus :exec
UPDATE mindmap_content
SET processing_status = $2,
    processing_error = $3,
    updated_at = CURRENT_TIMESTAMP
WHERE id = $1;

-- name: SoftDeleteContent :exec
UPDATE mindmap_content
SET deleted_at = CURRENT_TIMESTAMP,
    updated_at = CURRENT_TIMESTAMP
WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL;

-- name: IsContentDeleted :one
SELECT deleted_at IS NOT NULL AS is_deleted
FROM mindmap_content
WHERE id = $1;

-- name: CountContent :one
SELECT count(*) FROM mindmap_content
WHERE user_id = $1 AND deleted_at IS NULL;
```

- [ ] **Step 2: Create jobs queries**

Create `internal/store/queries/jobs.sql`:

```sql
-- name: CreateJob :one
INSERT INTO mindmap_jobs (content_id, user_id, content_type, status)
VALUES ($1, $2, $3, 'pending')
RETURNING id;

-- name: GetJobByContentID :one
SELECT id, content_id, user_id, content_type, status, current_step,
       attempt_count, max_attempts, last_error, next_retry_at,
       step_results, started_at, completed_at, created_at, updated_at
FROM mindmap_jobs
WHERE content_id = $1;

-- name: UpdateJobStatus :exec
UPDATE mindmap_jobs
SET status = $2,
    current_step = $3,
    last_error = $4,
    attempt_count = $5,
    updated_at = CURRENT_TIMESTAMP
WHERE id = $1;

-- name: UpdateJobStepResults :exec
UPDATE mindmap_jobs
SET step_results = $2,
    current_step = $3,
    updated_at = CURRENT_TIMESTAMP
WHERE id = $1;

-- name: CompleteJob :exec
UPDATE mindmap_jobs
SET status = 'completed',
    completed_at = CURRENT_TIMESTAMP,
    updated_at = CURRENT_TIMESTAMP
WHERE id = $1;

-- name: FailJob :exec
UPDATE mindmap_jobs
SET status = 'failed',
    last_error = $2,
    updated_at = CURRENT_TIMESTAMP
WHERE id = $1;

-- name: StartJob :exec
UPDATE mindmap_jobs
SET status = 'processing',
    started_at = CURRENT_TIMESTAMP,
    updated_at = CURRENT_TIMESTAMP
WHERE id = $1;
```

- [ ] **Step 3: Add pgvector dependency and run sqlc generate**

```bash
cd server
go get github.com/pgvector/pgvector-go
go get github.com/pgvector/pgvector-go/pgx
```

Note: sqlc may not natively support the `vector(1536)` type. If `sqlc generate` fails on the vector column, add a type override in `sqlc.yaml`:

```yaml
overrides:
  - db_type: "vector"
    go_type:
      import: "github.com/pgvector/pgvector-go"
      type: "Vector"
```

Then run:

```bash
sqlc generate
```

Verify: `go build ./...` should pass.

- [ ] **Step 4: Commit**

```bash
git add internal/store/queries/content.sql internal/store/queries/jobs.sql
git add internal/store/*.go sqlc.yaml go.mod go.sum
git commit -m "feat(saves): add sqlc queries for content and jobs"
```

### Task 3: Configuration

**Files:**
- Modify: `internal/config/config.go`

- [ ] **Step 1: Extend Config struct and Load function**

Add new fields to the `Config` struct after existing fields:

```go
// Saves feature
RedisURL            string
GeminiAPIKey        string
OpenAIAPIKey        string
JinaAPIKey          string
GeminiModel         string
OpenAIEmbeddingModel string
EmbeddingDimensions int
StorageProvider     string
StorageLocalPath    string
WorkerConcurrency   int
WorkerShutdownTimeout time.Duration
MaxFileSizeMB       int
```

Add to `Load()` after existing env var loading:

```go
// Saves feature (optional — server starts without saves if not configured)
cfg.RedisURL = getEnv("REDIS_URL", "")
cfg.GeminiAPIKey = getEnv("GEMINI_API_KEY", "")
cfg.OpenAIAPIKey = getEnv("OPENAI_API_KEY", "")
cfg.JinaAPIKey = getEnv("JINA_API_KEY", "")
cfg.GeminiModel = getEnv("GEMINI_MODEL", "gemini-2.0-flash")
cfg.OpenAIEmbeddingModel = getEnv("OPENAI_EMBEDDING_MODEL", "text-embedding-3-small")
cfg.StorageProvider = getEnv("STORAGE_PROVIDER", "local")
cfg.StorageLocalPath = getEnv("STORAGE_LOCAL_PATH", "/data/mindtab/media")

dimStr := getEnv("EMBEDDING_DIMENSIONS", "1536")
cfg.EmbeddingDimensions, _ = strconv.Atoi(dimStr)
if cfg.EmbeddingDimensions == 0 {
    cfg.EmbeddingDimensions = 1536
}

concStr := getEnv("WORKER_CONCURRENCY", "4")
cfg.WorkerConcurrency, _ = strconv.Atoi(concStr)
if cfg.WorkerConcurrency == 0 {
    cfg.WorkerConcurrency = 4
}

shutdownStr := getEnv("WORKER_SHUTDOWN_TIMEOUT", "30s")
cfg.WorkerShutdownTimeout, _ = time.ParseDuration(shutdownStr)
if cfg.WorkerShutdownTimeout == 0 {
    cfg.WorkerShutdownTimeout = 30 * time.Second
}

maxSizeStr := getEnv("MAX_FILE_SIZE_MB", "20")
cfg.MaxFileSizeMB, _ = strconv.Atoi(maxSizeStr)
if cfg.MaxFileSizeMB == 0 {
    cfg.MaxFileSizeMB = 20
}
```

Add `"strconv"` and `"time"` to imports.

- [ ] **Step 2: Verify it compiles**

```bash
go build ./...
```

Expected: success (no errors).

- [ ] **Step 3: Commit**

```bash
git add internal/config/config.go
git commit -m "feat(saves): add saves config fields (Redis, providers, storage, worker)"
```

---

## Chunk 2: Provider Abstraction Layer

### Task 4: Provider Error Types

**Files:**
- Create: `internal/providers/errors.go`

- [ ] **Step 1: Create provider error types**

Create `internal/providers/errors.go`:

```go
package providers

import "fmt"

// ProviderError wraps an error with provider context and retriability.
type ProviderError struct {
	Provider  string
	Err       error
	Retriable bool
}

func (e *ProviderError) Error() string {
	return fmt.Sprintf("provider %s: %v", e.Provider, e.Err)
}

func (e *ProviderError) Unwrap() error {
	return e.Err
}

// NewRetriableError creates a retriable provider error (timeout, rate limit, 5xx).
func NewRetriableError(provider string, err error) *ProviderError {
	return &ProviderError{Provider: provider, Err: err, Retriable: true}
}

// NewPermanentError creates a permanent provider error (auth failure, invalid input).
func NewPermanentError(provider string, err error) *ProviderError {
	return &ProviderError{Provider: provider, Err: err, Retriable: false}
}

// IsRetriable checks if an error is a retriable provider error.
func IsRetriable(err error) bool {
	if pe, ok := err.(*ProviderError); ok {
		return pe.Retriable
	}
	return false
}

// AllProvidersExhaustedError is returned when all providers in a chain have failed.
type AllProvidersExhaustedError struct {
	Errors []error
}

func (e *AllProvidersExhaustedError) Error() string {
	return fmt.Sprintf("all providers exhausted (%d failures)", len(e.Errors))
}
```

- [ ] **Step 2: Verify it compiles**

```bash
go build ./internal/providers/...
```

- [ ] **Step 3: Commit**

```bash
git add internal/providers/errors.go
git commit -m "feat(saves): add provider error types"
```

### Task 5: Provider Chain

**Files:**
- Create: `internal/providers/chain.go`
- Create: `internal/providers/chain_test.go`

- [ ] **Step 1: Write chain test**

Create `internal/providers/chain_test.go`:

```go
package providers

import (
	"errors"
	"log/slog"
	"testing"
)

type mockProvider struct {
	name string
	err  error
}

func (m *mockProvider) Name() string { return m.name }

func TestChain_FirstProviderSucceeds(t *testing.T) {
	called := []string{}
	chain := NewChain[*mockProvider](slog.Default())
	chain.Add("primary", &mockProvider{name: "primary"})
	chain.Add("fallback", &mockProvider{name: "fallback"})

	err := chain.Execute(func(name string, _ *mockProvider) error {
		called = append(called, name)
		return nil
	})

	if err != nil {
		t.Fatalf("expected nil error, got %v", err)
	}
	if len(called) != 1 || called[0] != "primary" {
		t.Fatalf("expected only primary called, got %v", called)
	}
}

func TestChain_FallbackOnRetriableError(t *testing.T) {
	called := []string{}
	chain := NewChain[*mockProvider](slog.Default())
	chain.Add("primary", &mockProvider{name: "primary"})
	chain.Add("fallback", &mockProvider{name: "fallback"})

	err := chain.Execute(func(name string, _ *mockProvider) error {
		called = append(called, name)
		if name == "primary" {
			return NewRetriableError("primary", errors.New("timeout"))
		}
		return nil
	})

	if err != nil {
		t.Fatalf("expected nil error, got %v", err)
	}
	if len(called) != 2 {
		t.Fatalf("expected 2 calls, got %v", called)
	}
}

func TestChain_StopsOnPermanentError(t *testing.T) {
	chain := NewChain[*mockProvider](slog.Default())
	chain.Add("primary", &mockProvider{name: "primary"})
	chain.Add("fallback", &mockProvider{name: "fallback"})

	err := chain.Execute(func(name string, _ *mockProvider) error {
		return NewPermanentError("primary", errors.New("invalid api key"))
	})

	if err == nil {
		t.Fatal("expected error, got nil")
	}
}

func TestChain_AllExhausted(t *testing.T) {
	chain := NewChain[*mockProvider](slog.Default())
	chain.Add("p1", &mockProvider{name: "p1"})
	chain.Add("p2", &mockProvider{name: "p2"})

	err := chain.Execute(func(name string, _ *mockProvider) error {
		return NewRetriableError(name, errors.New("fail"))
	})

	if err == nil {
		t.Fatal("expected error, got nil")
	}
	var exhausted *AllProvidersExhaustedError
	if !errors.As(err, &exhausted) {
		t.Fatalf("expected AllProvidersExhaustedError, got %T", err)
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

```bash
go test ./internal/providers/ -v
```

Expected: FAIL (Chain type not defined).

- [ ] **Step 3: Implement Chain**

Create `internal/providers/chain.go`:

```go
package providers

import "log/slog"

// Chain tries providers in order, falling back on retriable errors.
type Chain[T any] struct {
	providers []namedProvider[T]
	logger    *slog.Logger
}

type namedProvider[T any] struct {
	name     string
	provider T
}

// NewChain creates a new provider chain.
func NewChain[T any](logger *slog.Logger) *Chain[T] {
	return &Chain[T]{logger: logger}
}

// Add appends a provider to the chain.
func (c *Chain[T]) Add(name string, provider T) {
	c.providers = append(c.providers, namedProvider[T]{name: name, provider: provider})
}

// Len returns the number of providers in the chain.
func (c *Chain[T]) Len() int {
	return len(c.providers)
}

// Execute tries each provider in order. fn receives the provider name and instance.
// On retriable errors, it falls back to the next provider.
// On permanent errors, it stops immediately.
// Returns AllProvidersExhaustedError if all providers fail with retriable errors.
func (c *Chain[T]) Execute(fn func(name string, provider T) error) error {
	var errs []error

	for i, np := range c.providers {
		err := fn(np.name, np.provider)
		if err == nil {
			return nil
		}

		if !IsRetriable(err) {
			return err
		}

		errs = append(errs, err)
		if i < len(c.providers)-1 {
			c.logger.Warn("provider failed, trying next",
				"provider", np.name,
				"error", err,
				"next", c.providers[i+1].name,
			)
		}
	}

	return &AllProvidersExhaustedError{Errors: errs}
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
go test ./internal/providers/ -v
```

Expected: all 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add internal/providers/chain.go internal/providers/chain_test.go
git commit -m "feat(saves): add generic provider chain with fallback logic"
```

### Task 6: LLM Provider Interface + Gemini

**Files:**
- Create: `internal/providers/llm/interface.go`
- Create: `internal/providers/llm/gemini.go`

- [ ] **Step 1: Create LLM interface**

Create `internal/providers/llm/interface.go`:

```go
package llm

import "context"

// LLMProvider defines the interface for LLM completions (text + vision).
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
	MediaType string // "image/jpeg", "image/png", "image/webp"
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

- [ ] **Step 2: Create Gemini implementation**

```bash
go get google.golang.org/genai
```

Create `internal/providers/llm/gemini.go`:

```go
package llm

import (
	"context"
	"fmt"

	"google.golang.org/genai"
)

type GeminiProvider struct {
	client *genai.Client
	model  string
}

func NewGeminiProvider(apiKey, model string) (*GeminiProvider, error) {
	client, err := genai.NewClient(context.Background(), &genai.ClientConfig{
		APIKey:  apiKey,
		Backend: genai.BackendGeminiAPI,
	})
	if err != nil {
		return nil, fmt.Errorf("create gemini client: %w", err)
	}
	return &GeminiProvider{client: client, model: model}, nil
}

func (g *GeminiProvider) Name() string { return "gemini-flash" }

func (g *GeminiProvider) Complete(ctx context.Context, req LLMRequest) (*LLMResponse, error) {
	var parts []genai.Part

	// Add images if present (multimodal)
	for _, img := range req.Images {
		parts = append(parts, genai.InlineData{
			MIMEType: img.MediaType,
			Data:     img.Data,
		})
	}

	// Add text prompt
	parts = append(parts, genai.Text(req.UserPrompt))

	config := &genai.GenerateContentConfig{
		MaxOutputTokens: int32(req.MaxTokens),
		Temperature:     genai.Ptr(float32(req.Temperature)),
	}

	if req.SystemPrompt != "" {
		config.SystemInstruction = &genai.Content{
			Parts: []genai.Part{genai.Text(req.SystemPrompt)},
		}
	}

	result, err := g.client.Models.GenerateContent(ctx, g.model, []*genai.Content{
		genai.NewContentFromParts(parts, genai.RoleUser),
	}, config)
	if err != nil {
		return nil, fmt.Errorf("gemini generate: %w", err)
	}

	if len(result.Candidates) == 0 || len(result.Candidates[0].Content.Parts) == 0 {
		return nil, fmt.Errorf("gemini: empty response")
	}

	text := ""
	for _, part := range result.Candidates[0].Content.Parts {
		if t, ok := part.(genai.Text); ok {
			text += string(t)
		}
	}

	resp := &LLMResponse{
		Text:     text,
		Provider: g.Name(),
	}

	if result.UsageMetadata != nil {
		resp.Tokens = TokenUsage{
			Input:  int(result.UsageMetadata.PromptTokenCount),
			Output: int(result.UsageMetadata.CandidatesTokenCount),
		}
	}

	return resp, nil
}
```

- [ ] **Step 3: Verify it compiles**

```bash
go build ./internal/providers/llm/...
```

- [ ] **Step 4: Commit**

```bash
git add internal/providers/llm/interface.go internal/providers/llm/gemini.go
git add go.mod go.sum
git commit -m "feat(saves): add LLM provider interface and Gemini Flash implementation"
```

### Task 7: Embedding Provider Interface + OpenAI

**Files:**
- Create: `internal/providers/embedding/interface.go`
- Create: `internal/providers/embedding/openai.go`

- [ ] **Step 1: Create embedding interface**

Create `internal/providers/embedding/interface.go`:

```go
package embedding

import "context"

// EmbeddingProvider generates vector embeddings from text.
type EmbeddingProvider interface {
	Embed(ctx context.Context, texts []string) ([][]float32, error)
	Dimensions() int
	Name() string
}
```

- [ ] **Step 2: Create OpenAI implementation**

Create `internal/providers/embedding/openai.go`:

```go
package embedding

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
)

type OpenAIProvider struct {
	apiKey     string
	model      string
	dimensions int
	httpClient *http.Client
}

func NewOpenAIProvider(apiKey, model string, dimensions int) *OpenAIProvider {
	return &OpenAIProvider{
		apiKey:     apiKey,
		model:      model,
		dimensions: dimensions,
		httpClient: &http.Client{},
	}
}

func (o *OpenAIProvider) Name() string       { return "openai-embed" }
func (o *OpenAIProvider) Dimensions() int     { return o.dimensions }
func (o *OpenAIProvider) ModelName() string   { return o.model }

type openAIEmbedRequest struct {
	Input      []string `json:"input"`
	Model      string   `json:"model"`
	Dimensions int      `json:"dimensions,omitempty"`
}

type openAIEmbedResponse struct {
	Data  []openAIEmbedData `json:"data"`
	Usage struct {
		TotalTokens int `json:"total_tokens"`
	} `json:"usage"`
}

type openAIEmbedData struct {
	Embedding []float32 `json:"embedding"`
	Index     int       `json:"index"`
}

func (o *OpenAIProvider) Embed(ctx context.Context, texts []string) ([][]float32, error) {
	reqBody := openAIEmbedRequest{
		Input:      texts,
		Model:      o.model,
		Dimensions: o.dimensions,
	}

	body, err := json.Marshal(reqBody)
	if err != nil {
		return nil, fmt.Errorf("marshal request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, "POST", "https://api.openai.com/v1/embeddings", bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("create request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+o.apiKey)

	resp, err := o.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("openai embed request: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("openai embed: status %d: %s", resp.StatusCode, string(respBody))
	}

	var result openAIEmbedResponse
	if err := json.Unmarshal(respBody, &result); err != nil {
		return nil, fmt.Errorf("unmarshal response: %w", err)
	}

	embeddings := make([][]float32, len(result.Data))
	for _, d := range result.Data {
		embeddings[d.Index] = d.Embedding
	}

	return embeddings, nil
}
```

- [ ] **Step 3: Verify it compiles**

```bash
go build ./internal/providers/embedding/...
```

- [ ] **Step 4: Commit**

```bash
git add internal/providers/embedding/interface.go internal/providers/embedding/openai.go
git commit -m "feat(saves): add embedding provider interface and OpenAI implementation"
```

### Task 8: Provider Registry

**Files:**
- Create: `internal/providers/registry.go`

- [ ] **Step 1: Create registry**

Create `internal/providers/registry.go`:

```go
package providers

import (
	"fmt"
	"log/slog"

	"github.com/ksushant6566/mindtab/server/internal/providers/embedding"
	"github.com/ksushant6566/mindtab/server/internal/providers/llm"
)

// Registry holds all initialized provider chains.
type Registry struct {
	LLM       *Chain[llm.LLMProvider]
	Embedding *Chain[embedding.EmbeddingProvider]
}

// RegistryConfig contains the configuration needed to build provider chains.
type RegistryConfig struct {
	GeminiAPIKey         string
	GeminiModel          string
	OpenAIAPIKey         string
	OpenAIEmbeddingModel string
	EmbeddingDimensions  int
}

// NewRegistry creates a new provider registry with all chains initialized.
// Returns an error if any required chain has zero providers.
func NewRegistry(cfg RegistryConfig, logger *slog.Logger) (*Registry, error) {
	r := &Registry{
		LLM:       NewChain[llm.LLMProvider](logger),
		Embedding: NewChain[embedding.EmbeddingProvider](logger),
	}

	// LLM chain — Gemini Flash
	if cfg.GeminiAPIKey != "" {
		gemini, err := llm.NewGeminiProvider(cfg.GeminiAPIKey, cfg.GeminiModel)
		if err != nil {
			logger.Warn("failed to initialize Gemini provider", "error", err)
		} else {
			r.LLM.Add("gemini-flash", gemini)
		}
	}

	// Embedding chain — OpenAI
	if cfg.OpenAIAPIKey != "" {
		openaiEmbed := embedding.NewOpenAIProvider(
			cfg.OpenAIAPIKey,
			cfg.OpenAIEmbeddingModel,
			cfg.EmbeddingDimensions,
		)
		r.Embedding.Add("openai-embed", openaiEmbed)
	}

	// Validate required chains
	if r.LLM.Len() == 0 {
		return nil, fmt.Errorf("LLM provider chain has zero providers (set GEMINI_API_KEY)")
	}
	if r.Embedding.Len() == 0 {
		return nil, fmt.Errorf("embedding provider chain has zero providers (set OPENAI_API_KEY)")
	}

	return r, nil
}
```

The import path `github.com/ksushant6566/mindtab/server` matches the module name in `go.mod`.

- [ ] **Step 2: Verify it compiles**

```bash
go build ./internal/providers/...
```

- [ ] **Step 3: Commit**

```bash
git add internal/providers/registry.go
git commit -m "feat(saves): add provider registry"
```

---

## Chunk 3: Services & Storage

### Task 9: StorageProvider + Local Filesystem

**Files:**
- Create: `internal/services/storage.go`
- Create: `internal/services/storage_test.go`

- [ ] **Step 1: Write storage test**

Create `internal/services/storage_test.go`:

```go
package services

import (
	"bytes"
	"context"
	"io"
	"os"
	"path/filepath"
	"testing"
)

func TestLocalStorage_SaveAndGet(t *testing.T) {
	dir := t.TempDir()
	s := NewLocalStorage(dir)

	ctx := context.Background()
	data := []byte("hello world")
	key := "user1/content1/file.txt"

	err := s.Save(ctx, key, bytes.NewReader(data), "text/plain")
	if err != nil {
		t.Fatalf("save: %v", err)
	}

	// Verify file exists on disk
	fullPath := filepath.Join(dir, key)
	if _, err := os.Stat(fullPath); os.IsNotExist(err) {
		t.Fatal("file not found on disk")
	}

	// Get
	rc, err := s.Get(ctx, key)
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	defer rc.Close()

	got, _ := io.ReadAll(rc)
	if string(got) != "hello world" {
		t.Fatalf("expected 'hello world', got %q", string(got))
	}
}

func TestLocalStorage_Delete(t *testing.T) {
	dir := t.TempDir()
	s := NewLocalStorage(dir)

	ctx := context.Background()
	key := "user1/content1/file.txt"
	s.Save(ctx, key, bytes.NewReader([]byte("data")), "text/plain")

	err := s.Delete(ctx, key)
	if err != nil {
		t.Fatalf("delete: %v", err)
	}

	fullPath := filepath.Join(dir, key)
	if _, err := os.Stat(fullPath); !os.IsNotExist(err) {
		t.Fatal("file still exists after delete")
	}
}

func TestLocalStorage_GetNotFound(t *testing.T) {
	dir := t.TempDir()
	s := NewLocalStorage(dir)

	_, err := s.Get(context.Background(), "nonexistent")
	if err == nil {
		t.Fatal("expected error for nonexistent key")
	}
}
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
go test ./internal/services/ -v
```

Expected: FAIL (types not defined).

- [ ] **Step 3: Implement StorageProvider**

Create `internal/services/storage.go`:

```go
package services

import (
	"context"
	"fmt"
	"io"
	"os"
	"path/filepath"
)

// StorageProvider abstracts media file storage.
type StorageProvider interface {
	Save(ctx context.Context, key string, data io.Reader, contentType string) error
	Get(ctx context.Context, key string) (io.ReadCloser, error)
	Delete(ctx context.Context, key string) error
	URL(key string) string
}

// LocalStorage stores files on the local filesystem.
type LocalStorage struct {
	basePath string
}

func NewLocalStorage(basePath string) *LocalStorage {
	return &LocalStorage{basePath: basePath}
}

func (s *LocalStorage) Save(_ context.Context, key string, data io.Reader, _ string) error {
	fullPath := filepath.Join(s.basePath, key)

	if err := os.MkdirAll(filepath.Dir(fullPath), 0755); err != nil {
		return fmt.Errorf("create directory: %w", err)
	}

	f, err := os.Create(fullPath)
	if err != nil {
		return fmt.Errorf("create file: %w", err)
	}
	defer f.Close()

	if _, err := io.Copy(f, data); err != nil {
		return fmt.Errorf("write file: %w", err)
	}

	return nil
}

func (s *LocalStorage) Get(_ context.Context, key string) (io.ReadCloser, error) {
	fullPath := filepath.Join(s.basePath, key)
	f, err := os.Open(fullPath)
	if err != nil {
		return nil, fmt.Errorf("open file: %w", err)
	}
	return f, nil
}

func (s *LocalStorage) Delete(_ context.Context, key string) error {
	fullPath := filepath.Join(s.basePath, key)
	if err := os.Remove(fullPath); err != nil {
		return fmt.Errorf("delete file: %w", err)
	}
	return nil
}

func (s *LocalStorage) URL(key string) string {
	return "/media/" + key
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
go test ./internal/services/ -v
```

Expected: all 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add internal/services/storage.go internal/services/storage_test.go
git commit -m "feat(saves): add StorageProvider interface and local filesystem implementation"
```

### Task 10: Jina Reader Client

**Files:**
- Create: `internal/services/jina.go`
- Create: `internal/services/jina_test.go`

- [ ] **Step 1: Write Jina test with mock HTTP server**

Create `internal/services/jina_test.go` (add to existing test file or create new):

```go
package services

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestJinaReader_Extract(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer test-key" {
			t.Error("missing auth header")
		}
		if r.Header.Get("Accept") != "text/markdown" {
			t.Error("missing accept header")
		}
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("# Test Article\n\nThis is the content."))
	}))
	defer server.Close()

	client := NewJinaReader("test-key")
	client.baseURL = server.URL // override for testing

	result, err := client.Extract(context.Background(), "https://example.com/article")
	if err != nil {
		t.Fatalf("extract: %v", err)
	}

	if result == "" {
		t.Fatal("expected non-empty result")
	}
}

func TestJinaReader_ExtractError(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
		w.Write([]byte("internal error"))
	}))
	defer server.Close()

	client := NewJinaReader("test-key")
	client.baseURL = server.URL

	_, err := client.Extract(context.Background(), "https://example.com/article")
	if err == nil {
		t.Fatal("expected error on 500")
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

```bash
go test ./internal/services/ -run TestJina -v
```

Expected: FAIL.

- [ ] **Step 3: Implement Jina Reader**

Create `internal/services/jina.go`:

```go
package services

import (
	"context"
	"fmt"
	"io"
	"net/http"
)

// JinaReader fetches article content via Jina Reader API.
type JinaReader struct {
	apiKey     string
	baseURL    string
	httpClient *http.Client
}

func NewJinaReader(apiKey string) *JinaReader {
	return &JinaReader{
		apiKey:     apiKey,
		baseURL:    "https://r.jina.ai",
		httpClient: &http.Client{},
	}
}

// Extract fetches the article content at the given URL and returns clean markdown.
func (j *JinaReader) Extract(ctx context.Context, articleURL string) (string, error) {
	reqURL := j.baseURL + "/" + articleURL

	req, err := http.NewRequestWithContext(ctx, "GET", reqURL, nil)
	if err != nil {
		return "", fmt.Errorf("create request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+j.apiKey)
	req.Header.Set("Accept", "text/markdown")

	resp, err := j.httpClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("jina request: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", fmt.Errorf("read response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("jina: status %d: %s", resp.StatusCode, string(body))
	}

	return string(body), nil
}

// FallbackExtract does a plain HTTP GET as a backup when Jina fails.
func (j *JinaReader) FallbackExtract(ctx context.Context, articleURL string) (string, error) {
	req, err := http.NewRequestWithContext(ctx, "GET", articleURL, nil)
	if err != nil {
		return "", fmt.Errorf("create request: %w", err)
	}
	req.Header.Set("User-Agent", "MindTab/1.0")

	resp, err := j.httpClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("http get: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", fmt.Errorf("read response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("http: status %d", resp.StatusCode)
	}

	return string(body), nil
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
go test ./internal/services/ -run TestJina -v
```

Expected: all Jina tests PASS.

- [ ] **Step 5: Commit**

```bash
git add internal/services/jina.go internal/services/jina_test.go
git commit -m "feat(saves): add Jina Reader client for article extraction"
```

---

## Chunk 4: Redis Queue System

### Task 11: Redis Connection

**Files:**
- Create: `internal/queue/redis.go`

- [ ] **Step 1: Add Redis dependency**

```bash
go get github.com/redis/go-redis/v9
```

- [ ] **Step 2: Create Redis connection**

Create `internal/queue/redis.go`:

```go
package queue

import (
	"context"
	"fmt"

	"github.com/redis/go-redis/v9"
)

const (
	KeyPending    = "mindtab:jobs:pending"
	KeyProcessing = "mindtab:jobs:processing"
	KeyRetry      = "mindtab:jobs:retry"
	KeyDead       = "mindtab:jobs:dead"
	KeyLockPrefix = "mindtab:jobs:lock:"
)

// ConnectRedis parses a Redis URL and returns a connected client.
func ConnectRedis(ctx context.Context, redisURL string) (*redis.Client, error) {
	opts, err := redis.ParseURL(redisURL)
	if err != nil {
		return nil, fmt.Errorf("parse redis URL: %w", err)
	}

	client := redis.NewClient(opts)

	if err := client.Ping(ctx).Err(); err != nil {
		return nil, fmt.Errorf("redis ping: %w", err)
	}

	return client, nil
}
```

- [ ] **Step 3: Commit**

```bash
git add internal/queue/redis.go go.mod go.sum
git commit -m "feat(saves): add Redis connection setup"
```

### Task 12: Queue Producer & Consumer

**Files:**
- Create: `internal/queue/producer.go`
- Create: `internal/queue/consumer.go`

- [ ] **Step 1: Create producer**

Create `internal/queue/producer.go`:

```go
package queue

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"
)

// JobPayload is the JSON structure stored in Redis.
type JobPayload struct {
	JobID        uuid.UUID              `json:"job_id"`
	ContentID    uuid.UUID              `json:"content_id"`
	UserID       string                 `json:"user_id"`
	ContentType  string                 `json:"content_type"`
	SourceURL    string                 `json:"source_url,omitempty"`
	TempImagePath string               `json:"temp_image_path,omitempty"` // path to temp file for image uploads
	ImageMIME    string                 `json:"image_mime,omitempty"`     // MIME type of uploaded image
	AttemptCount int                    `json:"attempt_count"`
	MaxAttempts  int                    `json:"max_attempts"`
	CurrentStep  string                 `json:"current_step,omitempty"`
	StepResults  map[string]any         `json:"step_results,omitempty"`
}

// Producer enqueues jobs to the Redis pending list.
type Producer struct {
	client *redis.Client
}

func NewProducer(client *redis.Client) *Producer {
	return &Producer{client: client}
}

// Enqueue adds a job to the pending queue.
func (p *Producer) Enqueue(ctx context.Context, payload JobPayload) error {
	data, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("marshal job: %w", err)
	}

	return p.client.LPush(ctx, KeyPending, data).Err()
}
```

- [ ] **Step 2: Create consumer**

Create `internal/queue/consumer.go`:

```go
package queue

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/redis/go-redis/v9"
)

// Consumer dequeues jobs from Redis.
type Consumer struct {
	client *redis.Client
}

func NewConsumer(client *redis.Client) *Consumer {
	return &Consumer{client: client}
}

// Dequeue blocks for up to timeout waiting for a job. Returns nil payload if timeout.
func (c *Consumer) Dequeue(ctx context.Context, timeout time.Duration) (*JobPayload, error) {
	result, err := c.client.BRPopLPush(ctx, KeyPending, KeyProcessing, timeout).Result()
	if err == redis.Nil {
		return nil, nil // timeout, no job available
	}
	if err != nil {
		return nil, fmt.Errorf("dequeue: %w", err)
	}

	var payload JobPayload
	if err := json.Unmarshal([]byte(result), &payload); err != nil {
		return nil, fmt.Errorf("unmarshal job: %w", err)
	}

	return &payload, nil
}

// Complete removes a job from the processing list.
func (c *Consumer) Complete(ctx context.Context, payload JobPayload) error {
	data, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("marshal job: %w", err)
	}

	return c.client.LRem(ctx, KeyProcessing, 1, data).Err()
}

// AcquireLock sets a lock for a job with TTL. Returns false if lock already held.
func (c *Consumer) AcquireLock(ctx context.Context, jobID string, ttl time.Duration) (bool, error) {
	return c.client.SetNX(ctx, KeyLockPrefix+jobID, "locked", ttl).Result()
}

// ReleaseLock removes a job lock.
func (c *Consumer) ReleaseLock(ctx context.Context, jobID string) error {
	return c.client.Del(ctx, KeyLockPrefix+jobID).Err()
}

// SendToDeadLetter moves a job from processing to dead letter queue.
func (c *Consumer) SendToDeadLetter(ctx context.Context, payload JobPayload) error {
	data, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("marshal job: %w", err)
	}

	c.client.LRem(ctx, KeyProcessing, 1, data)
	return c.client.LPush(ctx, KeyDead, data).Err()
}
```

- [ ] **Step 3: Verify it compiles**

```bash
go build ./internal/queue/...
```

- [ ] **Step 4: Commit**

```bash
git add internal/queue/producer.go internal/queue/consumer.go
git commit -m "feat(saves): add Redis queue producer and consumer"
```

### Task 13: Retry Scheduler & Recovery

**Files:**
- Create: `internal/queue/retry.go`

- [ ] **Step 1: Create retry scheduler**

Create `internal/queue/retry.go`:

```go
package queue

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"math"
	"math/rand"
	"time"

	"github.com/redis/go-redis/v9"
)

// RetryScheduler manages the retry sorted set and startup recovery.
type RetryScheduler struct {
	client *redis.Client
	logger *slog.Logger
}

func NewRetryScheduler(client *redis.Client, logger *slog.Logger) *RetryScheduler {
	return &RetryScheduler{client: client, logger: logger}
}

// ScheduleRetry adds a job to the retry sorted set with exponential backoff.
func (r *RetryScheduler) ScheduleRetry(ctx context.Context, payload JobPayload, baseDelay time.Duration) error {
	delay := CalculateBackoff(payload.AttemptCount, baseDelay)
	retryAt := time.Now().Add(delay)

	data, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("marshal job: %w", err)
	}

	// Remove from processing, add to retry
	r.client.LRem(ctx, KeyProcessing, 1, data)

	return r.client.ZAdd(ctx, KeyRetry, redis.Z{
		Score:  float64(retryAt.Unix()),
		Member: data,
	}).Err()
}

// PollRetries checks for jobs due for retry and moves them back to pending.
// Call this in a loop with a 5-second sleep.
func (r *RetryScheduler) PollRetries(ctx context.Context) error {
	now := float64(time.Now().Unix())

	results, err := r.client.ZRangeByScore(ctx, KeyRetry, &redis.ZRangeBy{
		Min:   "-inf",
		Max:   fmt.Sprintf("%f", now),
		Count: 50,
	}).Result()
	if err != nil {
		return fmt.Errorf("zrangebyscore: %w", err)
	}

	for _, result := range results {
		removed, err := r.client.ZRem(ctx, KeyRetry, result).Result()
		if err != nil || removed == 0 {
			continue // another worker got it
		}

		if err := r.client.LPush(ctx, KeyPending, result).Err(); err != nil {
			r.logger.Error("failed to re-enqueue retry job", "error", err)
			// Put it back in retry
			r.client.ZAdd(ctx, KeyRetry, redis.Z{
				Score:  float64(time.Now().Add(10 * time.Second).Unix()),
				Member: result,
			})
		}
	}

	return nil
}

// RecoverOrphans scans the processing list for jobs with expired locks
// and moves them back to pending. Call once on startup.
func (r *RetryScheduler) RecoverOrphans(ctx context.Context) error {
	items, err := r.client.LRange(ctx, KeyProcessing, 0, -1).Result()
	if err != nil {
		return fmt.Errorf("lrange processing: %w", err)
	}

	recovered := 0
	for _, item := range items {
		var payload JobPayload
		if err := json.Unmarshal([]byte(item), &payload); err != nil {
			r.logger.Warn("invalid job in processing list", "error", err)
			continue
		}

		// Check if lock exists
		exists, err := r.client.Exists(ctx, KeyLockPrefix+payload.JobID.String()).Result()
		if err != nil {
			continue
		}

		if exists == 0 {
			// Lock expired — job is orphaned
			r.client.LRem(ctx, KeyProcessing, 1, item)
			r.client.LPush(ctx, KeyPending, item)
			recovered++
			r.logger.Info("recovered orphaned job", "job_id", payload.JobID)
		}
	}

	if recovered > 0 {
		r.logger.Info("startup recovery complete", "recovered", recovered)
	}

	return nil
}

// CalculateBackoff returns exponential backoff with jitter.
// Formula: base * 2^(attempt-1), capped at 10min, with 25% jitter.
func CalculateBackoff(attempt int, baseDelay time.Duration) time.Duration {
	if attempt <= 0 {
		attempt = 1
	}

	delay := time.Duration(float64(baseDelay) * math.Pow(2, float64(attempt-1)))
	maxDelay := 10 * time.Minute
	if delay > maxDelay {
		delay = maxDelay
	}

	// 25% jitter
	jitter := time.Duration(rand.Int63n(int64(delay) / 2))
	delay = delay - delay/4 + jitter

	return delay
}
```

- [ ] **Step 2: Verify it compiles**

```bash
go build ./internal/queue/...
```

- [ ] **Step 3: Commit**

```bash
git add internal/queue/retry.go
git commit -m "feat(saves): add retry scheduler and startup recovery"
```

---

## Chunk 5: Worker & Processing Pipelines

### Task 14: Worker Types & Processor Interface

**Files:**
- Create: `internal/worker/processor.go`

- [ ] **Step 1: Create processor interface and types**

Create `internal/worker/processor.go`:

```go
package worker

import (
	"context"
	"encoding/json"

	"github.com/google/uuid"
)

// StepResults holds the output of completed steps, keyed by step name.
type StepResults map[string]*StepResult

// StepResult is the output of a single processing step.
type StepResult struct {
	Data json.RawMessage `json:"data"`
}

// Job represents a processing job with its current state.
type Job struct {
	ID          uuid.UUID   `json:"id"`
	ContentID   uuid.UUID   `json:"content_id"`
	UserID      string      `json:"user_id"`
	ContentType string      `json:"content_type"`
	SourceURL   string      `json:"source_url,omitempty"`
	ImageData   []byte      `json:"-"` // populated for image jobs from upload
	ImageType   string      `json:"-"` // MIME type of uploaded image
}

// Processor defines a content type processing pipeline.
type Processor interface {
	// ContentType returns the content type this processor handles (e.g., "article", "image").
	ContentType() string

	// Steps returns the ordered list of step names for this processor.
	Steps() []string

	// Execute runs a single step. prevResults contains results from prior steps.
	Execute(ctx context.Context, step string, job *Job, prevResults StepResults) (*StepResult, error)
}
```

- [ ] **Step 2: Verify it compiles**

```bash
go build ./internal/worker/...
```

- [ ] **Step 3: Commit**

```bash
git add internal/worker/processor.go
git commit -m "feat(saves): add worker processor interface and types"
```

### Task 15: Worker Dispatcher

**Files:**
- Create: `internal/worker/dispatcher.go`

- [ ] **Step 1: Create dispatcher**

Create `internal/worker/dispatcher.go`:

```go
package worker

import (
	"context"
	"encoding/json"
	"log/slog"
	"os"
	"path/filepath"
	"sync"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/google/uuid"
	"github.com/ksushant6566/mindtab/server/internal/queue"
	"github.com/ksushant6566/mindtab/server/internal/store"
)

// Dispatcher runs N worker goroutines that dequeue and process jobs.
type Dispatcher struct {
	consumer   *queue.Consumer
	retry      *queue.RetryScheduler
	queries    store.Querier
	processors map[string]Processor
	logger     *slog.Logger

	concurrency int
	stopCh      chan struct{}
	wg          sync.WaitGroup
}

func NewDispatcher(
	consumer *queue.Consumer,
	retry *queue.RetryScheduler,
	queries store.Querier,
	concurrency int,
	logger *slog.Logger,
) *Dispatcher {
	return &Dispatcher{
		consumer:    consumer,
		retry:       retry,
		queries:     queries,
		processors:  make(map[string]Processor),
		logger:      logger,
		concurrency: concurrency,
		stopCh:      make(chan struct{}),
	}
}

// RegisterProcessor adds a processor for a content type.
func (d *Dispatcher) RegisterProcessor(p Processor) {
	d.processors[p.ContentType()] = p
}

// Start launches worker goroutines and the retry scheduler.
func (d *Dispatcher) Start() {
	// Worker goroutines
	for i := 0; i < d.concurrency; i++ {
		d.wg.Add(1)
		go d.workerLoop(i)
	}

	// Retry scheduler goroutine
	d.wg.Add(1)
	go d.retryLoop()

	d.logger.Info("worker dispatcher started", "concurrency", d.concurrency)
}

// Stop signals all workers to stop and waits for them to finish.
func (d *Dispatcher) Stop(timeout time.Duration) {
	close(d.stopCh)

	done := make(chan struct{})
	go func() {
		d.wg.Wait()
		close(done)
	}()

	select {
	case <-done:
		d.logger.Info("all workers stopped")
	case <-time.After(timeout):
		d.logger.Warn("worker shutdown timed out", "timeout", timeout)
	}
}

func (d *Dispatcher) workerLoop(id int) {
	defer d.wg.Done()

	for {
		select {
		case <-d.stopCh:
			d.logger.Info("worker stopping", "worker_id", id)
			return
		default:
		}

		ctx := context.Background()
		payload, err := d.consumer.Dequeue(ctx, 30*time.Second)
		if err != nil {
			d.logger.Error("dequeue error", "worker_id", id, "error", err)
			continue
		}
		if payload == nil {
			continue // timeout, loop and check stopCh
		}

		d.processJob(ctx, payload, id)
	}
}

func (d *Dispatcher) processJob(ctx context.Context, payload *queue.JobPayload, workerID int) {
	logger := d.logger.With("job_id", payload.JobID, "content_type", payload.ContentType, "worker_id", workerID)

	// Acquire lock
	locked, err := d.consumer.AcquireLock(ctx, payload.JobID.String(), 5*time.Minute)
	if err != nil || !locked {
		logger.Warn("could not acquire job lock")
		return
	}
	defer d.consumer.ReleaseLock(ctx, payload.JobID.String())

	// Find processor
	proc, ok := d.processors[payload.ContentType]
	if !ok {
		logger.Error("no processor for content type")
		d.consumer.SendToDeadLetter(ctx, *payload)
		return
	}

	// Mark job as started
	d.queries.StartJob(ctx, toPgUUID(payload.JobID))

	// Load previous step results
	prevResults := make(StepResults)
	if payload.StepResults != nil {
		for k, v := range payload.StepResults {
			data, _ := json.Marshal(v)
			prevResults[k] = &StepResult{Data: data}
		}
	}

	// Build job
	job := &Job{
		ID:          payload.JobID,
		ContentID:   payload.ContentID,
		UserID:      payload.UserID,
		ContentType: payload.ContentType,
		SourceURL:   payload.SourceURL,
	}

	// Load image data from temp file if this is an image job
	if payload.TempImagePath != "" {
		imgData, err := os.ReadFile(payload.TempImagePath)
		if err != nil {
			logger.Error("failed to read temp image", "path", payload.TempImagePath, "error", err)
			d.handleStepFailure(ctx, payload, "save", err)
			return
		}
		job.ImageData = imgData
		job.ImageType = payload.ImageMIME
	}
	// Clean up temp image file only on terminal outcome (success or dead letter).
	// Do NOT clean up on retry — the file is needed for the retry attempt.
	cleanupTempImage := func() {
		if payload.TempImagePath != "" {
			os.RemoveAll(filepath.Dir(payload.TempImagePath))
		}
	}

	// Execute steps
	steps := proc.Steps()
	startIdx := 0
	if payload.CurrentStep != "" {
		for i, s := range steps {
			if s == payload.CurrentStep {
				startIdx = i
				break
			}
		}
	}

	for i := startIdx; i < len(steps); i++ {
		step := steps[i]

		// Skip completed steps
		if _, done := prevResults[step]; done {
			continue
		}

		logger.Info("executing step", "step", step)

		result, err := proc.Execute(ctx, step, job, prevResults)
		if err != nil {
			logger.Error("step failed", "step", step, "error", err)
			d.handleStepFailure(ctx, payload, step, err)
			return
		}

		if result != nil {
			prevResults[step] = result
		}

		// Checkpoint step results to DB
		stepData, _ := json.Marshal(prevResults)
		d.queries.UpdateJobStepResults(ctx, store.UpdateJobStepResultsParams{
			ID:          toPgUUID(payload.JobID),
			StepResults: stepData,
			CurrentStep: &step,
		})
	}

	// All steps complete
	d.queries.CompleteJob(ctx, toPgUUID(payload.JobID))
	d.consumer.Complete(ctx, *payload)
	cleanupTempImage()
	logger.Info("job completed")
}

func (d *Dispatcher) handleStepFailure(ctx context.Context, payload *queue.JobPayload, step string, stepErr error) {
	payload.AttemptCount++
	payload.CurrentStep = step

	if payload.AttemptCount >= payload.MaxAttempts {
		d.logger.Error("job exceeded max attempts, sending to dead letter",
			"job_id", payload.JobID,
			"attempts", payload.AttemptCount,
		)
		errStr := stepErr.Error()
		d.queries.FailJob(ctx, store.FailJobParams{
			ID:        toPgUUID(payload.JobID),
			LastError: &errStr,
		})
		d.consumer.SendToDeadLetter(ctx, *payload)
		// Clean up temp file — no more retries
		if payload.TempImagePath != "" {
			os.RemoveAll(filepath.Dir(payload.TempImagePath))
		}
		return
	}

	// Schedule retry (temp file kept for retry attempt)
	d.queries.UpdateJobStatus(ctx, store.UpdateJobStatusParams{
		ID:           toPgUUID(payload.JobID),
		Status:       "retry",
		CurrentStep:  &step,
		LastError:    ptrStr(stepErr.Error()),
		AttemptCount: int32(payload.AttemptCount),
	})
	d.retry.ScheduleRetry(ctx, *payload, 5*time.Second)
}

func (d *Dispatcher) retryLoop() {
	defer d.wg.Done()

	ticker := time.NewTicker(5 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-d.stopCh:
			return
		case <-ticker.C:
			if err := d.retry.PollRetries(context.Background()); err != nil {
				d.logger.Error("retry poll error", "error", err)
			}
		}
	}
}

func ptrStr(s string) *string { return &s }

// toPgUUID converts uuid.UUID to pgtype.UUID for sqlc queries.
func toPgUUID(id uuid.UUID) pgtype.UUID {
	return pgtype.UUID{Bytes: id, Valid: true}
}
```

Note: The `store.UpdateJobStepResultsParams`, `store.FailJobParams`, `store.UpdateJobStatusParams` types are generated by sqlc. Their exact field names depend on the generated code. Adjust field names to match what sqlc generates (check `internal/store/jobs.sql.go` after running `sqlc generate`).

- [ ] **Step 2: Verify it compiles**

```bash
go build ./internal/worker/...
```

If there are import path issues, check the module name in `go.mod` and adjust imports accordingly.

- [ ] **Step 3: Commit**

```bash
git add internal/worker/dispatcher.go
git commit -m "feat(saves): add worker dispatcher with step execution and retry"
```

### Task 16: Processing Steps

**Files:**
- Create: `internal/worker/steps/extract.go`
- Create: `internal/worker/steps/vision.go`
- Create: `internal/worker/steps/summarize.go`
- Create: `internal/worker/steps/embed.go`
- Create: `internal/worker/steps/store.go`

- [ ] **Step 1: Create extract step (Jina Reader)**

Create `internal/worker/steps/extract.go`:

```go
package steps

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/ksushant6566/mindtab/server/internal/services"
	"github.com/ksushant6566/mindtab/server/internal/worker"
)

type ExtractResult struct {
	Text  string `json:"text"`
	Title string `json:"title,omitempty"`
}

// Extract fetches article content via Jina Reader.
func Extract(ctx context.Context, jina *services.JinaReader, job *worker.Job) (*worker.StepResult, error) {
	if job.SourceURL == "" {
		return nil, fmt.Errorf("extract: no source URL")
	}

	text, err := jina.Extract(ctx, job.SourceURL)
	if err != nil {
		// Fallback to plain HTTP
		text, err = jina.FallbackExtract(ctx, job.SourceURL)
		if err != nil {
			return nil, fmt.Errorf("extract (with fallback): %w", err)
		}
	}

	result := ExtractResult{Text: text}
	data, _ := json.Marshal(result)
	return &worker.StepResult{Data: data}, nil
}
```

- [ ] **Step 2: Create vision step**

Create `internal/worker/steps/vision.go`:

```go
package steps

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/ksushant6566/mindtab/server/internal/providers"
	"github.com/ksushant6566/mindtab/server/internal/providers/llm"
	"github.com/ksushant6566/mindtab/server/internal/worker"
)

type VisionResult struct {
	ExtractedText     string `json:"extracted_text"`
	VisualDescription string `json:"visual_description"`
}

const visionSystemPrompt = `You analyze images. Return a JSON object with exactly two fields:
- "extracted_text": any visible text in the image (OCR). Empty string if no text.
- "visual_description": a detailed description of the image content.
Return ONLY valid JSON, no markdown fences.`

// Vision analyzes an image using the LLM chain (multimodal).
func Vision(ctx context.Context, llmChain *providers.Chain[llm.LLMProvider], job *worker.Job) (*worker.StepResult, error) {
	if len(job.ImageData) == 0 {
		return nil, fmt.Errorf("vision: no image data")
	}

	var resp *llm.LLMResponse
	err := llmChain.Execute(func(name string, provider llm.LLMProvider) error {
		var callErr error
		resp, callErr = provider.Complete(ctx, llm.LLMRequest{
			SystemPrompt: visionSystemPrompt,
			UserPrompt:   "Analyze this image.",
			Images: []llm.ImageInput{{
				Data:      job.ImageData,
				MediaType: job.ImageType,
			}},
			MaxTokens:   1024,
			Temperature: 0.1,
		})
		return callErr
	})
	if err != nil {
		return nil, fmt.Errorf("vision: %w", err)
	}

	var result VisionResult
	if err := json.Unmarshal([]byte(resp.Text), &result); err != nil {
		// If JSON parsing fails, treat the whole response as visual description
		result = VisionResult{VisualDescription: resp.Text}
	}

	data, _ := json.Marshal(result)
	return &worker.StepResult{Data: data}, nil
}
```

- [ ] **Step 3: Create summarize step**

Create `internal/worker/steps/summarize.go`:

```go
package steps

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/ksushant6566/mindtab/server/internal/providers"
	"github.com/ksushant6566/mindtab/server/internal/providers/llm"
	"github.com/ksushant6566/mindtab/server/internal/worker"
)

type SummarizeResult struct {
	Summary   string   `json:"summary"`
	Tags      []string `json:"tags"`
	KeyTopics []string `json:"key_topics"`
	Provider  string   `json:"provider"`
}

const summarizeSystemPrompt = `You summarize content. Return a JSON object with exactly three fields:
- "summary": a concise 2-4 sentence summary of the content
- "tags": an array of 3-8 lowercase tags describing the content
- "key_topics": an array of 2-5 key topics covered
Return ONLY valid JSON, no markdown fences.`

// Summarize generates summary, tags, and key topics from text content.
func Summarize(ctx context.Context, llmChain *providers.Chain[llm.LLMProvider], text string) (*worker.StepResult, error) {
	if text == "" {
		return nil, fmt.Errorf("summarize: empty input text")
	}

	// Truncate to avoid exceeding context limits
	if len(text) > 30000 {
		text = text[:30000]
	}

	var resp *llm.LLMResponse
	var providerName string
	err := llmChain.Execute(func(name string, provider llm.LLMProvider) error {
		var callErr error
		resp, callErr = provider.Complete(ctx, llm.LLMRequest{
			SystemPrompt: summarizeSystemPrompt,
			UserPrompt:   "Summarize the following content:\n\n" + text,
			MaxTokens:    1024,
			Temperature:  0.3,
		})
		if callErr == nil {
			providerName = name
		}
		return callErr
	})
	if err != nil {
		return nil, fmt.Errorf("summarize: %w", err)
	}

	var result SummarizeResult
	if err := json.Unmarshal([]byte(resp.Text), &result); err != nil {
		// Fallback: use raw text as summary
		result = SummarizeResult{Summary: resp.Text}
	}
	result.Provider = providerName

	data, _ := json.Marshal(result)
	return &worker.StepResult{Data: data}, nil
}
```

- [ ] **Step 4: Create embed step**

Create `internal/worker/steps/embed.go`:

```go
package steps

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/ksushant6566/mindtab/server/internal/providers"
	"github.com/ksushant6566/mindtab/server/internal/providers/embedding"
	"github.com/ksushant6566/mindtab/server/internal/worker"
)

type EmbedResult struct {
	Embedding []float32 `json:"embedding"`
	Provider  string    `json:"provider"`
	Model     string    `json:"model"`
}

// Embed generates a vector embedding from text content.
// Input text should be the summary + relevant extracted content concatenated.
func Embed(ctx context.Context, embeddingChain *providers.Chain[embedding.EmbeddingProvider], text string) (*worker.StepResult, error) {
	if text == "" {
		return nil, fmt.Errorf("embed: empty input text")
	}

	// Truncate to stay within token limits
	if len(text) > 8000 {
		text = text[:8000]
	}

	var embeddings [][]float32
	var providerName string
	var modelName string
	err := embeddingChain.Execute(func(name string, provider embedding.EmbeddingProvider) error {
		var callErr error
		embeddings, callErr = provider.Embed(ctx, []string{text})
		if callErr == nil {
			providerName = name
			// Get model name from provider if it exposes it
			if np, ok := provider.(interface{ ModelName() string }); ok {
				modelName = np.ModelName()
			}
		}
		return callErr
	})
	if err != nil {
		return nil, fmt.Errorf("embed: %w", err)
	}

	if len(embeddings) == 0 || len(embeddings[0]) == 0 {
		return nil, fmt.Errorf("embed: empty embedding returned")
	}

	result := EmbedResult{
		Embedding: embeddings[0],
		Provider:  providerName,
		Model:     modelName,
	}
	data, _ := json.Marshal(result)
	return &worker.StepResult{Data: data}, nil
}
```

- [ ] **Step 5: Create store step**

Create `internal/worker/steps/store.go`:

```go
package steps

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	pgvector "github.com/pgvector/pgvector-go"
	"github.com/ksushant6566/mindtab/server/internal/store"
	"github.com/ksushant6566/mindtab/server/internal/worker"
)

// Store writes all processing results to Postgres.
// Checks deleted_at before writing — skips if content was soft-deleted during processing.
func Store(
	ctx context.Context,
	queries store.Querier,
	pool *pgxpool.Pool,
	job *worker.Job,
	prevResults worker.StepResults,
) (*worker.StepResult, error) {
	// Check if content was deleted during processing
	isDeleted, err := queries.IsContentDeleted(ctx, job.ContentID)
	if err != nil {
		return nil, fmt.Errorf("check deleted: %w", err)
	}
	if isDeleted {
		return nil, nil // content was deleted, skip silently
	}

	// Parse step results
	var extractResult ExtractResult
	var visionResult VisionResult
	var summarizeResult SummarizeResult
	var embedResult EmbedResult
	var mediaKey string

	if r, ok := prevResults["extract"]; ok && r != nil {
		json.Unmarshal(r.Data, &extractResult)
	}
	if r, ok := prevResults["vision"]; ok && r != nil {
		json.Unmarshal(r.Data, &visionResult)
	}
	if r, ok := prevResults["summarize"]; ok && r != nil {
		json.Unmarshal(r.Data, &summarizeResult)
	}
	if r, ok := prevResults["embed"]; ok && r != nil {
		json.Unmarshal(r.Data, &embedResult)
	}
	if r, ok := prevResults["save"]; ok && r != nil {
		var saveResult map[string]string
		json.Unmarshal(r.Data, &saveResult)
		mediaKey = saveResult["media_key"]
	}

	// Update content with results
	// Note: Field types use pgtype.Text to match sqlc-generated params.
	// Use the pgtextFrom() helper from handler/convert.go pattern:
	//   pgtextFrom(s) → pgtype.Text{String: s, Valid: s != ""}
	// Adjust field names to match exact sqlc output after running sqlc generate.
	err = queries.UpdateContentResults(ctx, store.UpdateContentResultsParams{
		ID:                job.ContentID,
		ExtractedText:     pgtextFrom(extractResult.Text),
		VisualDescription: pgtextFrom(visionResult.VisualDescription),
		Summary:           pgtextFrom(summarizeResult.Summary),
		Tags:              summarizeResult.Tags,
		KeyTopics:         summarizeResult.KeyTopics,
		SourceTitle:       pgtextFrom(extractResult.Title),
		SummaryProvider:   pgtextFrom(summarizeResult.Provider),
		EmbeddingProvider: pgtextFrom(embedResult.Provider),
		EmbeddingModel:    pgtextFrom(embedResult.Model),
		MediaKey:          pgtextFrom(mediaKey),
	})
	if err != nil {
		return nil, fmt.Errorf("update content results: %w", err)
	}

	// Update embedding via raw SQL (pgvector type)
	if len(embedResult.Embedding) > 0 {
		vec := pgvector.NewVector(embedResult.Embedding)
		_, err := pool.Exec(ctx,
			"UPDATE mindmap_content SET embedding = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2",
			vec, job.ContentID,
		)
		if err != nil {
			return nil, fmt.Errorf("update embedding: %w", err)
		}
	}

	return nil, nil
}

// pgtextFrom converts a string to pgtype.Text (local helper — handler/convert.go
// version is unexported and in a different package).
func pgtextFrom(s string) pgtype.Text {
	if s == "" {
		return pgtype.Text{}
	}
	return pgtype.Text{String: s, Valid: true}
}
```

Note: The exact `store.UpdateContentResultsParams` field names depend on sqlc-generated code. Adjust field names and types (e.g., `pgtype.Text` vs `*string`) to match what sqlc produces. Check `internal/store/content.sql.go` after running `sqlc generate`.

- [ ] **Step 6: Verify all steps compile**

```bash
go build ./internal/worker/steps/...
```

- [ ] **Step 7: Commit**

```bash
git add internal/worker/steps/
git commit -m "feat(saves): add processing steps (extract, vision, summarize, embed, store)"
```

### Task 17: Article Processor

**Files:**
- Create: `internal/worker/processors/article.go`

- [ ] **Step 1: Create article processor**

Create `internal/worker/processors/article.go`:

```go
package processors

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/ksushant6566/mindtab/server/internal/providers"
	"github.com/ksushant6566/mindtab/server/internal/providers/embedding"
	"github.com/ksushant6566/mindtab/server/internal/providers/llm"
	"github.com/ksushant6566/mindtab/server/internal/services"
	"github.com/ksushant6566/mindtab/server/internal/store"
	"github.com/ksushant6566/mindtab/server/internal/worker"
	"github.com/ksushant6566/mindtab/server/internal/worker/steps"
)

type ArticleProcessor struct {
	jina           *services.JinaReader
	llmChain       *providers.Chain[llm.LLMProvider]
	embeddingChain *providers.Chain[embedding.EmbeddingProvider]
	queries        store.Querier
	pool           *pgxpool.Pool
}

func NewArticleProcessor(
	jina *services.JinaReader,
	llmChain *providers.Chain[llm.LLMProvider],
	embeddingChain *providers.Chain[embedding.EmbeddingProvider],
	queries store.Querier,
	pool *pgxpool.Pool,
) *ArticleProcessor {
	return &ArticleProcessor{
		jina:           jina,
		llmChain:       llmChain,
		embeddingChain: embeddingChain,
		queries:        queries,
		pool:           pool,
	}
}

func (p *ArticleProcessor) ContentType() string { return "article" }

func (p *ArticleProcessor) Steps() []string {
	return []string{"extract", "summarize", "embed", "store"}
}

func (p *ArticleProcessor) Execute(ctx context.Context, step string, job *worker.Job, prevResults worker.StepResults) (*worker.StepResult, error) {
	switch step {
	case "extract":
		return steps.Extract(ctx, p.jina, job)

	case "summarize":
		var extractResult steps.ExtractResult
		if r, ok := prevResults["extract"]; ok && r != nil {
			json.Unmarshal(r.Data, &extractResult)
		}
		return steps.Summarize(ctx, p.llmChain, extractResult.Text)

	case "embed":
		var summarizeResult steps.SummarizeResult
		var extractResult steps.ExtractResult
		if r, ok := prevResults["summarize"]; ok && r != nil {
			json.Unmarshal(r.Data, &summarizeResult)
		}
		if r, ok := prevResults["extract"]; ok && r != nil {
			json.Unmarshal(r.Data, &extractResult)
		}
		// Combine summary + first 2000 chars of extracted text
		embedText := summarizeResult.Summary
		if len(extractResult.Text) > 2000 {
			embedText += "\n\n" + extractResult.Text[:2000]
		} else if extractResult.Text != "" {
			embedText += "\n\n" + extractResult.Text
		}
		return steps.Embed(ctx, p.embeddingChain, embedText)

	case "store":
		return steps.Store(ctx, p.queries, p.pool, job, prevResults)

	default:
		return nil, fmt.Errorf("unknown step: %s", step)
	}
}
```

- [ ] **Step 2: Verify it compiles**

```bash
go build ./internal/worker/processors/...
```

- [ ] **Step 3: Commit**

```bash
git add internal/worker/processors/article.go
git commit -m "feat(saves): add article processor"
```

### Task 18: Image Processor

**Files:**
- Create: `internal/worker/processors/image.go`

- [ ] **Step 1: Create image processor**

Create `internal/worker/processors/image.go`:

```go
package processors

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/ksushant6566/mindtab/server/internal/providers"
	"github.com/ksushant6566/mindtab/server/internal/providers/embedding"
	"github.com/ksushant6566/mindtab/server/internal/providers/llm"
	"github.com/ksushant6566/mindtab/server/internal/services"
	"github.com/ksushant6566/mindtab/server/internal/store"
	"github.com/ksushant6566/mindtab/server/internal/worker"
	"github.com/ksushant6566/mindtab/server/internal/worker/steps"
)

type ImageProcessor struct {
	storage        services.StorageProvider
	llmChain       *providers.Chain[llm.LLMProvider]
	embeddingChain *providers.Chain[embedding.EmbeddingProvider]
	queries        store.Querier
	pool           *pgxpool.Pool
}

func NewImageProcessor(
	storage services.StorageProvider,
	llmChain *providers.Chain[llm.LLMProvider],
	embeddingChain *providers.Chain[embedding.EmbeddingProvider],
	queries store.Querier,
	pool *pgxpool.Pool,
) *ImageProcessor {
	return &ImageProcessor{
		storage:        storage,
		llmChain:       llmChain,
		embeddingChain: embeddingChain,
		queries:        queries,
		pool:           pool,
	}
}

func (p *ImageProcessor) ContentType() string { return "image" }

func (p *ImageProcessor) Steps() []string {
	return []string{"save", "vision", "summarize", "embed", "store"}
}

func (p *ImageProcessor) Execute(ctx context.Context, step string, job *worker.Job, prevResults worker.StepResults) (*worker.StepResult, error) {
	switch step {
	case "save":
		// Save image to storage
		ext := "jpg"
		switch job.ImageType {
		case "image/png":
			ext = "png"
		case "image/webp":
			ext = "webp"
		}
		key := fmt.Sprintf("%s/%s/image.%s", job.UserID, job.ContentID, ext)

		err := p.storage.Save(ctx, key, bytes.NewReader(job.ImageData), job.ImageType)
		if err != nil {
			return nil, fmt.Errorf("save image: %w", err)
		}

		// Store media_key on the content record immediately
		p.queries.UpdateContentStatus(ctx, store.UpdateContentStatusParams{
			ID:               job.ContentID,
			ProcessingStatus: "processing",
		})

		result := map[string]string{"media_key": key}
		data, _ := json.Marshal(result)
		return &worker.StepResult{Data: data}, nil

	case "vision":
		return steps.Vision(ctx, p.llmChain, job)

	case "summarize":
		var visionResult steps.VisionResult
		if r, ok := prevResults["vision"]; ok && r != nil {
			json.Unmarshal(r.Data, &visionResult)
		}
		text := visionResult.VisualDescription
		if visionResult.ExtractedText != "" {
			text += "\n\nExtracted text: " + visionResult.ExtractedText
		}
		return steps.Summarize(ctx, p.llmChain, text)

	case "embed":
		var summarizeResult steps.SummarizeResult
		var visionResult steps.VisionResult
		if r, ok := prevResults["summarize"]; ok && r != nil {
			json.Unmarshal(r.Data, &summarizeResult)
		}
		if r, ok := prevResults["vision"]; ok && r != nil {
			json.Unmarshal(r.Data, &visionResult)
		}
		embedText := summarizeResult.Summary + "\n\n" + visionResult.VisualDescription
		return steps.Embed(ctx, p.embeddingChain, embedText)

	case "store":
		// Set media_key from save step before storing
		if r, ok := prevResults["save"]; ok && r != nil {
			var saveResult map[string]string
			json.Unmarshal(r.Data, &saveResult)
			// media_key will be picked up by the store step via content update
		}
		return steps.Store(ctx, p.queries, p.pool, job, prevResults)

	default:
		return nil, fmt.Errorf("unknown step: %s", step)
	}
}
```

- [ ] **Step 2: Verify it compiles**

```bash
go build ./internal/worker/processors/...
```

- [ ] **Step 3: Commit**

```bash
git add internal/worker/processors/image.go
git commit -m "feat(saves): add image processor"
```

---

## Chunk 6: Search, API Handlers & Wiring

### Task 19: Semantic Search

**Files:**
- Create: `internal/search/semantic.go`

- [ ] **Step 1: Create semantic search**

Create `internal/search/semantic.go`:

```go
package search

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	pgvector "github.com/pgvector/pgvector-go"
	"github.com/ksushant6566/mindtab/server/internal/providers"
	"github.com/ksushant6566/mindtab/server/internal/providers/embedding"
)

// SearchResult represents a single search result with similarity score.
type SearchResult struct {
	ID               uuid.UUID  `json:"id"`
	SourceURL        *string    `json:"source_url,omitempty"`
	SourceType       string     `json:"source_type"`
	SourceTitle      *string    `json:"source_title,omitempty"`
	Summary          *string    `json:"summary,omitempty"`
	Tags             []string   `json:"tags"`
	MediaKey         *string    `json:"media_key,omitempty"`
	Similarity       float64    `json:"similarity"`
	CreatedAt        time.Time  `json:"created_at"`
}

// SemanticSearch embeds a query and finds similar content using pgvector.
type SemanticSearch struct {
	pool           *pgxpool.Pool
	embeddingChain *providers.Chain[embedding.EmbeddingProvider]
}

func NewSemanticSearch(pool *pgxpool.Pool, embeddingChain *providers.Chain[embedding.EmbeddingProvider]) *SemanticSearch {
	return &SemanticSearch{pool: pool, embeddingChain: embeddingChain}
}

// Search embeds the query text and returns the top N most similar content items.
func (s *SemanticSearch) Search(ctx context.Context, userID string, query string, limit int) ([]SearchResult, error) {
	if limit <= 0 {
		limit = 10
	}

	// Embed the query
	var queryEmbedding []float32
	err := s.embeddingChain.Execute(func(name string, provider embedding.EmbeddingProvider) error {
		embeddings, err := provider.Embed(ctx, []string{query})
		if err != nil {
			return err
		}
		if len(embeddings) > 0 {
			queryEmbedding = embeddings[0]
		}
		return nil
	})
	if err != nil {
		return nil, fmt.Errorf("embed query: %w", err)
	}

	if len(queryEmbedding) == 0 {
		return nil, fmt.Errorf("empty query embedding")
	}

	vec := pgvector.NewVector(queryEmbedding)

	rows, err := s.pool.Query(ctx, `
		SELECT id, source_url, source_type, source_title, summary, tags, media_key,
		       1 - (embedding <=> $1) AS similarity,
		       created_at
		FROM mindmap_content
		WHERE user_id = $2
		  AND deleted_at IS NULL
		  AND embedding IS NOT NULL
		ORDER BY embedding <=> $1
		LIMIT $3
	`, vec, userID, limit)
	if err != nil {
		return nil, fmt.Errorf("search query: %w", err)
	}
	defer rows.Close()

	var results []SearchResult
	for rows.Next() {
		var r SearchResult
		err := rows.Scan(
			&r.ID, &r.SourceURL, &r.SourceType, &r.SourceTitle,
			&r.Summary, &r.Tags, &r.MediaKey,
			&r.Similarity, &r.CreatedAt,
		)
		if err != nil {
			return nil, fmt.Errorf("scan result: %w", err)
		}
		results = append(results, r)
	}

	return results, rows.Err()
}
```

- [ ] **Step 2: Verify it compiles**

```bash
go build ./internal/search/...
```

- [ ] **Step 3: Commit**

```bash
git add internal/search/semantic.go
git commit -m "feat(saves): add semantic search with pgvector"
```

### Task 20: Saves HTTP Handler

**Files:**
- Create: `internal/handler/saves.go`

- [ ] **Step 1: Create saves handler**

Create `internal/handler/saves.go`:

```go
package handler

import (
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"os"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/ksushant6566/mindtab/server/internal/middleware"
	"github.com/ksushant6566/mindtab/server/internal/queue"
	"github.com/ksushant6566/mindtab/server/internal/search"
	"github.com/ksushant6566/mindtab/server/internal/store"
)

type SavesHandler struct {
	queries  store.Querier
	producer *queue.Producer
	search   *search.SemanticSearch
	maxSize  int64 // max upload size in bytes
}

func NewSavesHandler(queries store.Querier, producer *queue.Producer, search *search.SemanticSearch, maxSizeMB int) *SavesHandler {
	return &SavesHandler{
		queries:  queries,
		producer: producer,
		search:   search,
		maxSize:  int64(maxSizeMB) * 1024 * 1024,
	}
}

// saveResponse is the JSON response for POST /saves.
type saveResponse struct {
	ID     string `json:"id"`
	Status string `json:"status"`
}

// contentJSON is the JSON response for content items.
type contentJSON struct {
	ID                string   `json:"id"`
	SourceURL         *string  `json:"source_url,omitempty"`
	SourceType        string   `json:"source_type"`
	SourceTitle       *string  `json:"source_title,omitempty"`
	Summary           *string  `json:"summary,omitempty"`
	Tags              []string `json:"tags"`
	KeyTopics         []string `json:"key_topics"`
	MediaKey          *string  `json:"media_key,omitempty"`
	ProcessingStatus  string   `json:"processing_status"`
	ProcessingError   *string  `json:"processing_error,omitempty"`
	ExtractedText     *string  `json:"extracted_text,omitempty"`
	VisualDescription *string  `json:"visual_description,omitempty"`
	CreatedAt         string   `json:"created_at"`
	UpdatedAt         string   `json:"updated_at"`
}

// Create handles POST /saves — accepts URL (JSON) or image (multipart).
func (h *SavesHandler) Create(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())
	contentType := r.Header.Get("Content-Type")

	if strings.HasPrefix(contentType, "multipart/form-data") {
		h.createFromImage(w, r, userID)
		return
	}

	h.createFromURL(w, r, userID)
}

func (h *SavesHandler) createFromURL(w http.ResponseWriter, r *http.Request, userID string) {
	var req struct {
		URL string `json:"url"`
	}
	if err := ReadJSON(r, &req); err != nil {
		WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	// Validate URL
	if req.URL == "" {
		WriteError(w, http.StatusBadRequest, "url is required")
		return
	}
	if len(req.URL) > 2048 {
		WriteError(w, http.StatusBadRequest, "url too long (max 2048 chars)")
		return
	}
	parsed, err := url.ParseRequestURI(req.URL)
	if err != nil || (parsed.Scheme != "http" && parsed.Scheme != "https") {
		WriteError(w, http.StatusBadRequest, "invalid URL (must be http or https)")
		return
	}

	// Create content record
	content, err := h.queries.CreateContent(r.Context(), store.CreateContentParams{
		UserID:      userID,
		SourceUrl:   pgtextFrom(req.URL),
		SourceType:  "article",
		SourceTitle: pgtextFrom(req.URL),
	})
	if err != nil {
		slog.Error("create content", "error", err)
		WriteError(w, http.StatusInternalServerError, "failed to create save")
		return
	}

	// Create job (returns pgtype.UUID)
	jobID, err := h.queries.CreateJob(r.Context(), store.CreateJobParams{
		ContentID:   content.ID,
		UserID:      userID,
		ContentType: "article",
	})
	if err != nil {
		slog.Error("create job", "error", err)
		WriteError(w, http.StatusInternalServerError, "failed to create job")
		return
	}

	// Enqueue — convert pgtype.UUID to uuid.UUID for Redis payload
	err = h.producer.Enqueue(r.Context(), queue.JobPayload{
		JobID:       uuidFromPgtype(jobID),
		ContentID:   uuidFromPgtype(content.ID),
		UserID:      userID,
		ContentType: "article",
		SourceURL:   req.URL,
		MaxAttempts: 5,
	})
	if err != nil {
		slog.Error("enqueue job", "error", err)
		WriteError(w, http.StatusInternalServerError, "failed to queue job")
		return
	}

	WriteJSON(w, http.StatusCreated, saveResponse{
		ID:     uuidToString(content.ID),
		Status: "pending",
	})
}

func (h *SavesHandler) createFromImage(w http.ResponseWriter, r *http.Request, userID string) {
	r.Body = http.MaxBytesReader(w, r.Body, h.maxSize)

	if err := r.ParseMultipartForm(h.maxSize); err != nil {
		WriteError(w, http.StatusRequestEntityTooLarge, fmt.Sprintf("file too large (max %dMB)", h.maxSize/(1024*1024)))
		return
	}
	defer r.MultipartForm.RemoveAll()

	file, header, err := r.FormFile("image")
	if err != nil {
		WriteError(w, http.StatusBadRequest, "image file required")
		return
	}
	defer file.Close()

	// Validate MIME type
	mimeType := header.Header.Get("Content-Type")
	if mimeType != "image/jpeg" && mimeType != "image/png" && mimeType != "image/webp" {
		WriteError(w, http.StatusBadRequest, "unsupported image type (jpeg, png, webp only)")
		return
	}

	// Save image to temp file (workers read from disk, not Redis payload)
	tempDir := fmt.Sprintf("/tmp/mindtab/%s", uuid.New().String())
	if err := os.MkdirAll(tempDir, 0755); err != nil {
		WriteError(w, http.StatusInternalServerError, "failed to create temp dir")
		return
	}
	ext := "jpg"
	switch mimeType {
	case "image/png":
		ext = "png"
	case "image/webp":
		ext = "webp"
	}
	tempPath := fmt.Sprintf("%s/upload.%s", tempDir, ext)
	tempFile, err := os.Create(tempPath)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "failed to create temp file")
		return
	}
	if _, err := io.Copy(tempFile, file); err != nil {
		tempFile.Close()
		WriteError(w, http.StatusInternalServerError, "failed to write temp file")
		return
	}
	tempFile.Close()

	// Create content record
	content, err := h.queries.CreateContent(r.Context(), store.CreateContentParams{
		UserID:      userID,
		SourceType:  "image",
		SourceTitle: pgtextFrom(header.Filename),
	})
	if err != nil {
		slog.Error("create content", "error", err)
		os.RemoveAll(tempDir) // clean up temp file on failure
		WriteError(w, http.StatusInternalServerError, "failed to create save")
		return
	}

	// Create job
	jobID, err := h.queries.CreateJob(r.Context(), store.CreateJobParams{
		ContentID:   content.ID,
		UserID:      userID,
		ContentType: "image",
	})
	if err != nil {
		slog.Error("create job", "error", err)
		os.RemoveAll(tempDir)
		WriteError(w, http.StatusInternalServerError, "failed to create job")
		return
	}

	// Enqueue — worker reads image from temp file path
	err = h.producer.Enqueue(r.Context(), queue.JobPayload{
		JobID:         uuidFromPgtype(jobID),
		ContentID:     uuidFromPgtype(content.ID),
		UserID:        userID,
		ContentType:   "image",
		TempImagePath: tempPath,
		ImageMIME:     mimeType,
		MaxAttempts:   5,
	})
	if err != nil {
		slog.Error("enqueue job", "error", err)
		WriteError(w, http.StatusInternalServerError, "failed to queue job")
		return
	}

	WriteJSON(w, http.StatusCreated, saveResponse{
		ID:     uuidToString(content.ID),
		Status: "pending",
	})
}

// uuidFromPgtype converts pgtype.UUID to uuid.UUID for use in Redis payloads.
func uuidFromPgtype(u pgtype.UUID) uuid.UUID {
	return uuid.UUID(u.Bytes)
}

// List handles GET /saves — paginated list of saved content.
func (h *SavesHandler) List(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())

	limit := 20
	offset := 0
	// Parse query params (optional, use defaults if not provided)
	if l := r.URL.Query().Get("limit"); l != "" {
		fmt.Sscanf(l, "%d", &limit)
	}
	if o := r.URL.Query().Get("offset"); o != "" {
		fmt.Sscanf(o, "%d", &offset)
	}
	if limit > 100 {
		limit = 100
	}

	items, err := h.queries.ListContent(r.Context(), store.ListContentParams{
		UserID: userID,
		Limit:  int32(limit),
		Offset: int32(offset),
	})
	if err != nil {
		slog.Error("list content", "error", err)
		WriteError(w, http.StatusInternalServerError, "failed to list saves")
		return
	}

	// Convert to JSON response using existing convert.go helpers
	result := make([]contentJSON, len(items))
	for i, item := range items {
		result[i] = contentJSON{
			ID:               uuidToString(item.ID),
			SourceURL:        textToPtr(item.SourceUrl),
			SourceType:       item.SourceType,
			SourceTitle:      textToPtr(item.SourceTitle),
			Summary:          textToPtr(item.Summary),
			Tags:             item.Tags,
			MediaKey:         textToPtr(item.MediaKey),
			ProcessingStatus: item.ProcessingStatus,
			ProcessingError:  textToPtr(item.ProcessingError),
			CreatedAt:        item.CreatedAt.Time.Format("2006-01-02T15:04:05Z07:00"),
			UpdatedAt:        item.UpdatedAt.Time.Format("2006-01-02T15:04:05Z07:00"),
		}
	}

	WriteJSON(w, http.StatusOK, result)
}

// Get handles GET /saves/{id}.
func (h *SavesHandler) Get(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())

	id, err := GetUUIDParam(r, "id")
	if err != nil {
		WriteError(w, http.StatusBadRequest, "invalid id")
		return
	}

	item, err := h.queries.GetContentByID(r.Context(), store.GetContentByIDParams{
		ID:     uuidFromGoogle(id),
		UserID: userID,
	})
	if err != nil {
		WriteError(w, http.StatusNotFound, "not found")
		return
	}

	result := contentJSON{
		ID:                uuidToString(item.ID),
		SourceURL:         textToPtr(item.SourceUrl),
		SourceType:        item.SourceType,
		SourceTitle:       textToPtr(item.SourceTitle),
		Summary:           textToPtr(item.Summary),
		Tags:              item.Tags,
		KeyTopics:         item.KeyTopics,
		MediaKey:          textToPtr(item.MediaKey),
		ProcessingStatus:  item.ProcessingStatus,
		ProcessingError:   textToPtr(item.ProcessingError),
		ExtractedText:     textToPtr(item.ExtractedText),
		VisualDescription: textToPtr(item.VisualDescription),
		CreatedAt:         item.CreatedAt.Time.Format("2006-01-02T15:04:05Z07:00"),
		UpdatedAt:         item.UpdatedAt.Time.Format("2006-01-02T15:04:05Z07:00"),
	}

	WriteJSON(w, http.StatusOK, result)
}

// Delete handles DELETE /saves/{id}.
func (h *SavesHandler) Delete(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())

	id, err := GetUUIDParam(r, "id")
	if err != nil {
		WriteError(w, http.StatusBadRequest, "invalid id")
		return
	}

	err = h.queries.SoftDeleteContent(r.Context(), store.SoftDeleteContentParams{
		ID:     uuidFromGoogle(id),
		UserID: userID,
	})
	if err != nil {
		WriteError(w, http.StatusNotFound, "not found")
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// Search handles POST /saves/search.
func (h *SavesHandler) Search(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())

	var req struct {
		Query string `json:"query"`
		Limit int    `json:"limit,omitempty"`
	}
	if err := ReadJSON(r, &req); err != nil || req.Query == "" {
		WriteError(w, http.StatusBadRequest, "query is required")
		return
	}

	results, err := h.search.Search(r.Context(), userID, req.Query, req.Limit)
	if err != nil {
		slog.Error("search", "error", err)
		WriteError(w, http.StatusInternalServerError, "search failed")
		return
	}

	WriteJSON(w, http.StatusOK, results)
}
```

Note: The exact field names for sqlc-generated params depend on what sqlc produces. After running `sqlc generate`, adjust field names to match. The handler uses existing conversion helpers from `convert.go` (`uuidToString`, `uuidFromGoogle`, `pgtextFrom`, `textToPtr`, etc.) and adds `uuidFromPgtype` for converting pgtype.UUID → uuid.UUID for Redis payloads. Add `"os"` to the imports for temp file handling.

- [ ] **Step 2: Verify it compiles**

```bash
go build ./internal/handler/...
```

If there are type mismatches with sqlc-generated code, adjust field names and types to match.

- [ ] **Step 3: Commit**

```bash
git add internal/handler/saves.go
git commit -m "feat(saves): add saves HTTP handler with CRUD and search endpoints"
```

### Task 21: Wire Everything in main.go

**Files:**
- Modify: `cmd/api/main.go`

- [ ] **Step 1: Add imports and Redis connection**

Add to imports in `cmd/api/main.go`:

```go
"github.com/redis/go-redis/v9"
// + internal package imports for providers, queue, worker, processors, search, services
```

After the database connection section (after `queries := store.New(pool)`), add:

```go
// Redis (optional — saves feature disabled if not configured)
var savesHandler *handler.SavesHandler
if cfg.RedisURL != "" {
    redisClient, err := queue.ConnectRedis(context.Background(), cfg.RedisURL)
    if err != nil {
        slog.Error("failed to connect to Redis", "error", err)
        os.Exit(1)
    }
    defer redisClient.Close()

    // Provider registry
    registry, err := providers.NewRegistry(providers.RegistryConfig{
        GeminiAPIKey:         cfg.GeminiAPIKey,
        GeminiModel:          cfg.GeminiModel,
        OpenAIAPIKey:         cfg.OpenAIAPIKey,
        OpenAIEmbeddingModel: cfg.OpenAIEmbeddingModel,
        EmbeddingDimensions:  cfg.EmbeddingDimensions,
    }, slog.Default())
    if err != nil {
        slog.Error("failed to initialize providers", "error", err)
        os.Exit(1)
    }

    // Storage
    storage := services.NewLocalStorage(cfg.StorageLocalPath)

    // Jina Reader
    jina := services.NewJinaReader(cfg.JinaAPIKey)

    // Queue
    producer := queue.NewProducer(redisClient)
    consumer := queue.NewConsumer(redisClient)
    retryScheduler := queue.NewRetryScheduler(redisClient, slog.Default())

    // Search
    semanticSearch := search.NewSemanticSearch(pool, registry.Embedding)

    // Saves handler
    savesHandler = handler.NewSavesHandler(queries, producer, semanticSearch, cfg.MaxFileSizeMB)

    // Worker dispatcher
    dispatcher := worker.NewDispatcher(consumer, retryScheduler, queries, cfg.WorkerConcurrency, slog.Default())
    dispatcher.RegisterProcessor(processors.NewArticleProcessor(jina, registry.LLM, registry.Embedding, queries, pool))
    dispatcher.RegisterProcessor(processors.NewImageProcessor(storage, registry.LLM, registry.Embedding, queries, pool))

    // Startup recovery
    retryScheduler.RecoverOrphans(context.Background())

    // Start workers
    dispatcher.Start()
    defer dispatcher.Stop(cfg.WorkerShutdownTimeout)
}
```

- [ ] **Step 2: Add saves routes to protected group**

In the protected route group (inside `r.Group(func(r chi.Router) { r.Use(mw.Auth(cfg.JWTSecret)) ... })`), add:

```go
// Saves (only if configured)
if savesHandler != nil {
    r.Post("/saves", savesHandler.Create)
    r.Get("/saves", savesHandler.List)
    r.Post("/saves/search", savesHandler.Search)
    r.Get("/saves/{id}", savesHandler.Get)
    r.Delete("/saves/{id}", savesHandler.Delete)
}
```

Place `/saves/search` before `/saves/{id}` so the literal path matches first (same pattern used for existing routes like `/goals/count` before `/goals/{id}`).

- [ ] **Step 3: Update shutdown timeout**

Change the existing shutdown context timeout to coordinate with worker shutdown:

```go
shutdownTimeout := 10 * time.Second
if cfg.WorkerShutdownTimeout > shutdownTimeout {
    shutdownTimeout = cfg.WorkerShutdownTimeout
}
ctx, cancel := context.WithTimeout(context.Background(), shutdownTimeout)
```

- [ ] **Step 4: Verify it compiles**

```bash
go build ./cmd/api/...
```

Fix any import path issues. The module name in `go.mod` determines the import prefix for all internal packages.

- [ ] **Step 5: Commit**

```bash
git add cmd/api/main.go go.mod go.sum
git commit -m "feat(saves): wire Redis, providers, workers, and saves handler into main.go"
```

### Task 22: Docker Compose Update

**Files:**
- Modify: `docker-compose.yml` or `Dockerfile.dev` (if exists)

- [ ] **Step 1: Add Redis service**

If a `docker-compose.yml` exists in the server directory, add a Redis service:

```yaml
redis:
  image: redis:7-alpine
  ports: ["6379:6379"]
  volumes: [redisdata:/data]
```

Add `redisdata:` to the `volumes:` section.

Add `depends_on: [redis]` to the server service if it exists.

If no docker-compose exists, document in `.env.example` that Redis is needed:

```env
# Redis (required for saves feature)
REDIS_URL=redis://localhost:6379/0
```

- [ ] **Step 2: Update .env.example**

Add all new env vars to `.env.example`:

```env
# === Saves Feature ===
REDIS_URL=redis://localhost:6379/0
GEMINI_API_KEY=
OPENAI_API_KEY=
JINA_API_KEY=
GEMINI_MODEL=gemini-2.0-flash
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
EMBEDDING_DIMENSIONS=1536
STORAGE_PROVIDER=local
STORAGE_LOCAL_PATH=/data/mindtab/media
WORKER_CONCURRENCY=4
WORKER_SHUTDOWN_TIMEOUT=30s
MAX_FILE_SIZE_MB=20
```

- [ ] **Step 3: Commit**

```bash
git add .env.example
git commit -m "feat(saves): add saves env vars to .env.example"
```

### Task 23: Media Serving Endpoint

**Files:**
- Modify: `internal/handler/saves.go`
- Modify: `cmd/api/main.go` (route registration)

- [ ] **Step 1: Add media serving method to SavesHandler**

Add to `internal/handler/saves.go`:

```go
// ServeMedia handles GET /media/* — serves stored media files behind auth.
func (h *SavesHandler) ServeMedia(storage services.StorageProvider) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID := middleware.UserIDFromContext(r.Context())
		key := chi.URLParam(r, "*")

		// Verify the key belongs to this user (key format: {user_id}/{content_id}/{filename})
		if !strings.HasPrefix(key, userID+"/") {
			WriteError(w, http.StatusForbidden, "access denied")
			return
		}

		rc, err := storage.Get(r.Context(), key)
		if err != nil {
			WriteError(w, http.StatusNotFound, "file not found")
			return
		}
		defer rc.Close()

		io.Copy(w, rc)
	}
}
```

- [ ] **Step 2: Register media route in main.go**

In the protected route group, add:

```go
if savesHandler != nil {
    r.Get("/media/*", savesHandler.ServeMedia(storage))
}
```

- [ ] **Step 3: Commit**

```bash
git add internal/handler/saves.go cmd/api/main.go
git commit -m "feat(saves): add media serving endpoint"
```

### Task 24: Verify Full Build

- [ ] **Step 1: Run full build**

```bash
go build ./...
```

Expected: success.

- [ ] **Step 2: Run all tests**

```bash
go test ./...
```

Expected: all tests pass (provider chain tests, storage tests, jina tests).

- [ ] **Step 3: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix(saves): resolve build issues"
```

### Task 25: Update OpenAPI Spec

**Files:**
- Modify: `packages/api-spec/` (OpenAPI spec file)

- [ ] **Step 1: Add saves endpoints to OpenAPI spec**

Add the following endpoints to the OpenAPI spec:
- `POST /saves` — request body (JSON URL or multipart image), response `201` with `{ id, status }`
- `GET /saves` — query params `limit`, `offset`, response `200` with array of content items
- `GET /saves/{id}` — response `200` with full content item
- `DELETE /saves/{id}` — response `204`
- `POST /saves/search` — request body `{ query, limit? }`, response `200` with array of search results
- `GET /media/*` — response `200` with file content

- [ ] **Step 2: Regenerate TypeScript types**

```bash
cd packages/api-spec && pnpm build
```

- [ ] **Step 3: Commit**

```bash
git add packages/api-spec/
git commit -m "feat(saves): add saves endpoints to OpenAPI spec"
```
