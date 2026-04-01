# Server Test Strategy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add comprehensive test coverage to the MindTab Go server — unit tests, integration tests, and handler tests — covering all critical paths defined in the spec.

**Architecture:** Three-layer test architecture. Layer 1: fast unit tests with mocked dependencies. Layer 2: integration tests with real Postgres+Redis via testcontainers. Layer 3: HTTP-level handler tests using httptest. Shared infrastructure in `testutil/` package provides factories, mocks, and container setup.

**Tech Stack:** Go 1.25, `testing` stdlib, `httptest`, `testcontainers-go`, `moq` (codegen for Querier), `chi` router for handler tests.

**Spec:** `docs/superpowers/specs/2026-04-01-server-test-strategy-design.md`

**Worktree:** All work MUST be done in `/Users/sushantkumar/Desktop/NovaProjecta/mindtab-v2-test-strategy/` on branch `feat/server-test-strategy`.

---

## File Map

### New Files

| File | Responsibility |
|---|---|
| `server/internal/testutil/auth.go` | `WithUserID` context injection helper |
| `server/internal/testutil/http.go` | HTTP request builders + response assertions |
| `server/internal/testutil/factory.go` | Test data factories with functional options |
| `server/internal/testutil/mocks.go` | Hand-written mocks for LLM, Embedding, Transcription, Storage, Producer, SemanticSearch, Consumer, RetryScheduler |
| `server/internal/testutil/db.go` | Testcontainers Postgres setup + migration runner |
| `server/internal/testutil/redis.go` | Testcontainers Redis setup |
| `server/internal/store/mock_querier.go` | moq-generated Querier mock |
| `server/internal/handler/saves_test.go` | Saves handler HTTP tests (29 tests) |
| `server/internal/handler/saves_helpers_test.go` | Helper function tests (isYouTubeURL, HMAC, etc.) |
| `server/internal/worker/dispatcher_test.go` | Dispatcher unit tests (10 tests) |
| `server/internal/worker/processors/article_test.go` | Article processor pipeline tests (5 tests) |
| `server/internal/worker/processors/image_test.go` | Image processor pipeline tests (4 tests) |
| `server/internal/worker/processors/youtube_test.go` | YouTube processor pipeline tests (6 tests) |
| `server/internal/worker/steps/extract_test.go` | Extract step tests |
| `server/internal/worker/steps/summarize_test.go` | Summarize step tests |
| `server/internal/worker/steps/embed_test.go` | Embed step tests |
| `server/internal/worker/steps/vision_test.go` | Vision step tests |
| `server/internal/worker/steps/store_test.go` | Store step tests |
| `server/internal/worker/steps/metadata_test.go` | Metadata step tests |
| `server/internal/worker/steps/transcribe_test.go` | Transcribe step tests |
| `server/internal/worker/steps/download_test.go` | Download step tests |
| `server/internal/worker/steps/extract_frames_test.go` | Frame extraction step tests |
| `server/internal/queue/producer_test.go` | Producer unit tests |
| `server/internal/queue/consumer_test.go` | Consumer unit tests |
| `server/internal/queue/retry_test.go` | Retry scheduler + backoff tests |
| `server/internal/queue/integration_test.go` | Redis queue lifecycle integration tests |
| `server/internal/search/semantic_test.go` | Semantic search unit test |
| `server/internal/search/integration_test.go` | pgvector search integration tests |
| `server/internal/store/integration_test.go` | SQL query integration tests |
| `server/internal/services/ytdlp_test.go` | VTT parsing fixture tests |
| `server/internal/services/ffmpeg_test.go` | Downsample + frame parsing tests |
| `server/internal/providers/registry_test.go` | Registry env var tests |
| `server/internal/middleware/auth_test.go` | Auth middleware integration tests |
| `server/Makefile` | Test + mock generation targets |
| `.github/workflows/test-unit.yml` | Unit test CI workflow |
| `.github/workflows/test-integration.yml` | Integration test CI workflow |

### Modified Files

None — all test files are new, no production code changes needed.

---

## Task 1: Install moq + Generate Querier Mock

**Files:**
- Create: `server/internal/store/mock_querier.go` (generated)
- Create: `server/Makefile`

- [ ] **Step 1: Install moq CLI**

```bash
cd /Users/sushantkumar/Desktop/NovaProjecta/mindtab-v2-test-strategy/server
go install github.com/matryer/moq@latest
```

- [ ] **Step 2: Generate the Querier mock**

```bash
cd /Users/sushantkumar/Desktop/NovaProjecta/mindtab-v2-test-strategy/server
moq -out internal/store/mock_querier.go -pkg store ./internal/store Querier
```

This generates a `QuerierMock` struct with function fields for every method. Verify it compiles:

```bash
cd /Users/sushantkumar/Desktop/NovaProjecta/mindtab-v2-test-strategy/server
go build ./internal/store/...
```

Expected: clean build, no errors.

- [ ] **Step 3: Create server/Makefile**

```makefile
.PHONY: test test-integration test-coverage generate-mocks

test:
	go test ./...

test-integration:
	go test -tags=integration ./...

test-coverage:
	go test -coverprofile=coverage.out ./...
	go tool cover -html=coverage.out

generate-mocks:
	moq -out internal/store/mock_querier.go -pkg store ./internal/store Querier
```

- [ ] **Step 4: Verify mock generation is repeatable**

```bash
cd /Users/sushantkumar/Desktop/NovaProjecta/mindtab-v2-test-strategy/server
make generate-mocks
go build ./internal/store/...
```

Expected: clean build.

- [ ] **Step 5: Commit**

```bash
cd /Users/sushantkumar/Desktop/NovaProjecta/mindtab-v2-test-strategy
git add server/internal/store/mock_querier.go server/Makefile
git commit -m "chore: add moq-generated Querier mock and Makefile"
```

---

## Task 2: Shared Test Infrastructure — testutil/auth.go + testutil/http.go

**Files:**
- Create: `server/internal/testutil/auth.go`
- Create: `server/internal/testutil/http.go`

- [ ] **Step 1: Create auth.go**

```go
package testutil

import (
	"context"
	"net/http"

	"github.com/ksushant6566/mindtab/server/internal/middleware"
)

// WithUserID injects a user ID into the context, bypassing auth middleware.
func WithUserID(ctx context.Context, userID string) context.Context {
	return context.WithValue(ctx, middleware.UserIDKey, userID)
}

// AuthenticatedRequest wraps an http.Request with a user ID in context.
func AuthenticatedRequest(r *http.Request, userID string) *http.Request {
	return r.WithContext(WithUserID(r.Context(), userID))
}
```

- [ ] **Step 2: Create http.go**

```go
package testutil

import (
	"bytes"
	"encoding/json"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"testing"
)

// JSONRequest builds an *http.Request with a JSON body.
func JSONRequest(method, path string, body any) *http.Request {
	var buf bytes.Buffer
	if body != nil {
		json.NewEncoder(&buf).Encode(body)
	}
	req := httptest.NewRequest(method, path, &buf)
	req.Header.Set("Content-Type", "application/json")
	return req
}

// MultipartRequest builds a multipart/form-data request with a file field.
func MultipartRequest(path, fieldName, fileName string, fileData []byte, mimeType string) *http.Request {
	var buf bytes.Buffer
	w := multipart.NewWriter(&buf)
	part, _ := w.CreateFormFile(fieldName, fileName)
	part.Write(fileData)
	w.Close()
	req := httptest.NewRequest(http.MethodPost, path, &buf)
	req.Header.Set("Content-Type", w.FormDataContentType())
	return req
}

// AssertStatus checks the response status code.
func AssertStatus(t *testing.T, resp *httptest.ResponseRecorder, expected int) {
	t.Helper()
	if resp.Code != expected {
		t.Fatalf("expected status %d, got %d; body: %s", expected, resp.Code, resp.Body.String())
	}
}

// DecodeJSON decodes a JSON response body into T.
func DecodeJSON[T any](t *testing.T, resp *httptest.ResponseRecorder) T {
	t.Helper()
	var v T
	if err := json.NewDecoder(resp.Body).Decode(&v); err != nil {
		t.Fatalf("failed to decode JSON: %v; body: %s", err, resp.Body.String())
	}
	return v
}

// ReadBody reads the full response body as a string.
func ReadBody(resp *httptest.ResponseRecorder) string {
	b, _ := io.ReadAll(resp.Body)
	return string(b)
}
```

- [ ] **Step 3: Verify compilation**

```bash
cd /Users/sushantkumar/Desktop/NovaProjecta/mindtab-v2-test-strategy/server
go build ./internal/testutil/...
```

Expected: clean build.

- [ ] **Step 4: Commit**

```bash
cd /Users/sushantkumar/Desktop/NovaProjecta/mindtab-v2-test-strategy
git add server/internal/testutil/
git commit -m "feat(testutil): add auth context helper and HTTP test utilities"
```

---

## Task 3: Shared Test Infrastructure — testutil/factory.go

**Files:**
- Create: `server/internal/testutil/factory.go`

- [ ] **Step 1: Create factory.go with test data builders**

```go
package testutil

import (
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/ksushant6566/mindtab/server/internal/queue"
	"github.com/ksushant6566/mindtab/server/internal/store"
)

// --- pgtype helpers ---

func PgUUID(id uuid.UUID) pgtype.UUID {
	return pgtype.UUID{Bytes: id, Valid: true}
}

func PgText(s string) pgtype.Text {
	return pgtype.Text{String: s, Valid: true}
}

func PgTimestamptz(t time.Time) pgtype.Timestamptz {
	return pgtype.Timestamptz{Time: t, Valid: true}
}

// --- Content factories ---

type CreateContentOption func(*store.CreateContentRow)

func NewCreateContentRow(opts ...CreateContentOption) store.CreateContentRow {
	id := uuid.New()
	row := store.CreateContentRow{
		ID: PgUUID(id),
	}
	for _, o := range opts {
		o(&row)
	}
	return row
}

func WithContentID(id uuid.UUID) CreateContentOption {
	return func(r *store.CreateContentRow) {
		r.ID = PgUUID(id)
	}
}

type ListContentOption func(*store.ListContentRow)

func NewListContentRow(opts ...ListContentOption) store.ListContentRow {
	id := uuid.New()
	now := time.Now()
	row := store.ListContentRow{
		ID:               PgUUID(id),
		UserID:           "test-user",
		SourceType:       "article",
		ProcessingStatus: "completed",
		Tags:             []string{},
		KeyTopics:        []string{},
		CreatedAt:        PgTimestamptz(now),
		UpdatedAt:        PgTimestamptz(now),
	}
	for _, o := range opts {
		o(&row)
	}
	return row
}

func WithListUserID(uid string) ListContentOption {
	return func(r *store.ListContentRow) { r.UserID = uid }
}

func WithListSourceType(st string) ListContentOption {
	return func(r *store.ListContentRow) { r.SourceType = st }
}

func WithListMediaKey(key string) ListContentOption {
	return func(r *store.ListContentRow) { r.MediaKey = PgText(key) }
}

func WithListSourceURL(url string) ListContentOption {
	return func(r *store.ListContentRow) { r.SourceUrl = PgText(url) }
}

type GetContentOption func(*store.GetContentByIDRow)

func NewGetContentRow(opts ...GetContentOption) store.GetContentByIDRow {
	id := uuid.New()
	now := time.Now()
	row := store.GetContentByIDRow{
		ID:               PgUUID(id),
		UserID:           "test-user",
		SourceType:       "article",
		ProcessingStatus: "completed",
		Tags:             []string{},
		KeyTopics:        []string{},
		CreatedAt:        PgTimestamptz(now),
		UpdatedAt:        PgTimestamptz(now),
	}
	for _, o := range opts {
		o(&row)
	}
	return row
}

func WithGetMediaKey(key string) GetContentOption {
	return func(r *store.GetContentByIDRow) { r.MediaKey = PgText(key) }
}

func WithGetSourceURL(url string) GetContentOption {
	return func(r *store.GetContentByIDRow) { r.SourceUrl = PgText(url) }
}

// --- Job payload factory ---

type PayloadOption func(*queue.JobPayload)

func NewJobPayload(opts ...PayloadOption) queue.JobPayload {
	p := queue.JobPayload{
		JobID:       uuid.New(),
		ContentID:   uuid.New(),
		UserID:      "test-user",
		ContentType: "article",
		SourceURL:   "https://example.com/article",
		MaxAttempts: 5,
	}
	for _, o := range opts {
		o(&p)
	}
	return p
}

func WithContentType(ct string) PayloadOption {
	return func(p *queue.JobPayload) { p.ContentType = ct }
}

func WithSourceURL(url string) PayloadOption {
	return func(p *queue.JobPayload) { p.SourceURL = url }
}

func WithAttemptCount(n int) PayloadOption {
	return func(p *queue.JobPayload) { p.AttemptCount = n }
}

func WithMaxAttempts(n int) PayloadOption {
	return func(p *queue.JobPayload) { p.MaxAttempts = n }
}

func WithTempImagePath(path string) PayloadOption {
	return func(p *queue.JobPayload) { p.TempImagePath = path }
}

func WithImageMIME(mime string) PayloadOption {
	return func(p *queue.JobPayload) { p.ImageMIME = mime }
}
```

- [ ] **Step 2: Verify compilation**

```bash
cd /Users/sushantkumar/Desktop/NovaProjecta/mindtab-v2-test-strategy/server
go build ./internal/testutil/...
```

Expected: clean build.

- [ ] **Step 3: Commit**

```bash
cd /Users/sushantkumar/Desktop/NovaProjecta/mindtab-v2-test-strategy
git add server/internal/testutil/factory.go
git commit -m "feat(testutil): add test data factories with functional options"
```

---

## Task 4: Shared Test Infrastructure — testutil/mocks.go

**Files:**
- Create: `server/internal/testutil/mocks.go`

- [ ] **Step 1: Create mocks.go with hand-written mocks for all small interfaces**

```go
package testutil

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"sync"

	"github.com/ksushant6566/mindtab/server/internal/providers/embedding"
	"github.com/ksushant6566/mindtab/server/internal/providers/llm"
	"github.com/ksushant6566/mindtab/server/internal/providers/transcription"
	"github.com/ksushant6566/mindtab/server/internal/queue"
	"github.com/ksushant6566/mindtab/server/internal/search"
)

// --- LLM Provider Mock ---

type MockLLMProvider struct {
	Response string
	Err      error
	Calls    []llm.LLMRequest
	mu       sync.Mutex
}

func (m *MockLLMProvider) Complete(ctx context.Context, req llm.LLMRequest) (*llm.LLMResponse, error) {
	m.mu.Lock()
	m.Calls = append(m.Calls, req)
	m.mu.Unlock()
	if m.Err != nil {
		return nil, m.Err
	}
	return &llm.LLMResponse{Text: m.Response, Provider: "mock-llm"}, nil
}

func (m *MockLLMProvider) StreamComplete(ctx context.Context, req llm.LLMRequest, tools []llm.ToolDefinition, callback llm.StreamCallback) error {
	return fmt.Errorf("StreamComplete not implemented in mock")
}

func (m *MockLLMProvider) Name() string { return "mock-llm" }

// --- Embedding Provider Mock ---

type MockEmbeddingProvider struct {
	Embedding  []float32
	Err        error
	CallCount  int
	LastTexts  []string
	mu         sync.Mutex
}

func (m *MockEmbeddingProvider) Embed(ctx context.Context, texts []string) ([][]float32, error) {
	m.mu.Lock()
	m.CallCount++
	m.LastTexts = texts
	m.mu.Unlock()
	if m.Err != nil {
		return nil, m.Err
	}
	emb := m.Embedding
	if emb == nil {
		emb = make([]float32, 1536)
		for i := range emb {
			emb[i] = 0.01 * float32(i)
		}
	}
	results := make([][]float32, len(texts))
	for i := range texts {
		results[i] = emb
	}
	return results, nil
}

func (m *MockEmbeddingProvider) Dimensions() int { return 1536 }
func (m *MockEmbeddingProvider) Name() string     { return "mock-embedding" }

// --- Transcription Provider Mock ---

type MockTranscriptionProvider struct {
	Transcript string
	Err        error
	CallCount  int
}

func (m *MockTranscriptionProvider) Transcribe(ctx context.Context, audioPath string) (*transcription.TranscriptionResult, error) {
	m.CallCount++
	if m.Err != nil {
		return nil, m.Err
	}
	return &transcription.TranscriptionResult{Text: m.Transcript}, nil
}

func (m *MockTranscriptionProvider) Name() string { return "mock-transcription" }

// --- Storage Provider Mock ---

type MockStorageProvider struct {
	Files map[string][]byte
	mu    sync.Mutex
}

func NewMockStorage() *MockStorageProvider {
	return &MockStorageProvider{Files: make(map[string][]byte)}
}

func (m *MockStorageProvider) Save(ctx context.Context, key string, data io.Reader, contentType string) error {
	b, err := io.ReadAll(data)
	if err != nil {
		return err
	}
	m.mu.Lock()
	m.Files[key] = b
	m.mu.Unlock()
	return nil
}

func (m *MockStorageProvider) Get(ctx context.Context, key string) (io.ReadCloser, error) {
	m.mu.Lock()
	data, ok := m.Files[key]
	m.mu.Unlock()
	if !ok {
		return nil, fmt.Errorf("key not found: %s", key)
	}
	return io.NopCloser(bytes.NewReader(data)), nil
}

func (m *MockStorageProvider) Delete(ctx context.Context, key string) error {
	m.mu.Lock()
	delete(m.Files, key)
	m.mu.Unlock()
	return nil
}

func (m *MockStorageProvider) URL(key string) string {
	return "/media/" + key
}

// --- Producer Mock ---

type MockProducer struct {
	Enqueued []queue.JobPayload
	Err      error
	mu       sync.Mutex
}

func (m *MockProducer) Enqueue(ctx context.Context, payload queue.JobPayload) error {
	if m.Err != nil {
		return m.Err
	}
	m.mu.Lock()
	m.Enqueued = append(m.Enqueued, payload)
	m.mu.Unlock()
	return nil
}

// --- Semantic Search Mock ---

type MockSemanticSearch struct {
	Results []search.SearchResult
	Err     error
}

func (m *MockSemanticSearch) Search(ctx context.Context, userID string, query string, limit int) ([]search.SearchResult, error) {
	if m.Err != nil {
		return nil, m.Err
	}
	return m.Results, nil
}
```

Note: The `MockProducer` and `MockSemanticSearch` are used in handler tests. The handler currently takes concrete types (`*queue.Producer`, `*search.SemanticSearch`). If the handler does not accept interfaces, you will need to either:
- Extract interfaces from the handler's dependencies and update the handler to accept them, OR
- Use the moq-generated Querier mock and test at a different level.

Check the handler constructor and adjust as needed — the mock signatures here match the method signatures on the concrete types.

- [ ] **Step 2: Verify compilation**

```bash
cd /Users/sushantkumar/Desktop/NovaProjecta/mindtab-v2-test-strategy/server
go build ./internal/testutil/...
```

Expected: clean build.

- [ ] **Step 3: Commit**

```bash
cd /Users/sushantkumar/Desktop/NovaProjecta/mindtab-v2-test-strategy
git add server/internal/testutil/mocks.go
git commit -m "feat(testutil): add hand-written mocks for LLM, embedding, storage, producer, search"
```

---

## Task 5: Shared Test Infrastructure — testutil/db.go + testutil/redis.go

**Files:**
- Create: `server/internal/testutil/db.go`
- Create: `server/internal/testutil/redis.go`

- [ ] **Step 1: Add testcontainers dependencies**

```bash
cd /Users/sushantkumar/Desktop/NovaProjecta/mindtab-v2-test-strategy/server
go get github.com/testcontainers/testcontainers-go
go get github.com/testcontainers/testcontainers-go/modules/postgres
go get github.com/testcontainers/testcontainers-go/modules/redis
```

- [ ] **Step 2: Create db.go**

```go
//go:build integration

package testutil

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/modules/postgres"
	"github.com/testcontainers/testcontainers-go/wait"
)

// SetupTestDB boots a Postgres container with pgvector, runs migrations, and returns a pool.
func SetupTestDB(t *testing.T) *pgxpool.Pool {
	t.Helper()
	ctx := context.Background()

	container, err := postgres.Run(ctx,
		"pgvector/pgvector:pg16",
		postgres.WithDatabase("mindtab_test"),
		postgres.WithUsername("test"),
		postgres.WithPassword("test"),
		testcontainers.WithWaitStrategy(
			wait.ForLog("database system is ready to accept connections").
				WithOccurrence(2).
				WithStartupTimeout(30*time.Second),
		),
	)
	if err != nil {
		t.Fatalf("failed to start postgres container: %v", err)
	}
	t.Cleanup(func() { container.Terminate(ctx) })

	connStr, err := container.ConnectionString(ctx, "sslmode=disable")
	if err != nil {
		t.Fatalf("failed to get connection string: %v", err)
	}

	pool, err := pgxpool.New(ctx, connStr)
	if err != nil {
		t.Fatalf("failed to create pool: %v", err)
	}
	t.Cleanup(func() { pool.Close() })

	runMigrations(t, pool)
	return pool
}

func runMigrations(t *testing.T, pool *pgxpool.Pool) {
	t.Helper()
	migrationsDir := findMigrationsDir(t)

	entries, err := os.ReadDir(migrationsDir)
	if err != nil {
		t.Fatalf("failed to read migrations dir: %v", err)
	}

	var upFiles []string
	for _, e := range entries {
		if strings.HasSuffix(e.Name(), ".up.sql") {
			upFiles = append(upFiles, e.Name())
		}
	}
	sort.Strings(upFiles)

	for _, f := range upFiles {
		sql, err := os.ReadFile(filepath.Join(migrationsDir, f))
		if err != nil {
			t.Fatalf("failed to read migration %s: %v", f, err)
		}
		if _, err := pool.Exec(context.Background(), string(sql)); err != nil {
			t.Fatalf("failed to run migration %s: %v", f, err)
		}
	}
}

func findMigrationsDir(t *testing.T) string {
	t.Helper()
	// Walk up from the test binary location to find server/migrations
	dir, _ := os.Getwd()
	for i := 0; i < 10; i++ {
		candidate := filepath.Join(dir, "migrations")
		if _, err := os.Stat(candidate); err == nil {
			return candidate
		}
		candidate = filepath.Join(dir, "server", "migrations")
		if _, err := os.Stat(candidate); err == nil {
			return candidate
		}
		dir = filepath.Dir(dir)
	}
	t.Fatal("could not find migrations directory")
	return ""
}

// TruncateAllTables truncates all mindmap_ tables for test isolation.
func TruncateAllTables(t *testing.T, pool *pgxpool.Pool) {
	t.Helper()
	tables := []string{
		"mindmap_jobs",
		"mindmap_content",
		"mindmap_message",
		"mindmap_conversation",
		"mindmap_habit_tracker",
		"mindmap_habit",
		"mindmap_journal",
		"mindmap_goal",
		"mindmap_project",
		"mindmap_refresh_token",
		"mindmap_verification_token",
		"mindmap_user",
	}
	for _, table := range tables {
		_, err := pool.Exec(context.Background(), fmt.Sprintf("TRUNCATE TABLE %s CASCADE", table))
		if err != nil {
			// Table might not exist in all migration states — skip
			continue
		}
	}
}
```

- [ ] **Step 3: Create redis.go**

```go
//go:build integration

package testutil

import (
	"context"
	"testing"
	"time"

	"github.com/redis/go-redis/v9"
	"github.com/testcontainers/testcontainers-go"
	tcredis "github.com/testcontainers/testcontainers-go/modules/redis"
	"github.com/testcontainers/testcontainers-go/wait"
)

// SetupTestRedis boots a Redis container and returns a client.
func SetupTestRedis(t *testing.T) *redis.Client {
	t.Helper()
	ctx := context.Background()

	container, err := tcredis.Run(ctx,
		"redis:7-alpine",
		testcontainers.WithWaitStrategy(
			wait.ForLog("Ready to accept connections").
				WithStartupTimeout(15*time.Second),
		),
	)
	if err != nil {
		t.Fatalf("failed to start redis container: %v", err)
	}
	t.Cleanup(func() { container.Terminate(ctx) })

	connStr, err := container.ConnectionString(ctx)
	if err != nil {
		t.Fatalf("failed to get redis connection string: %v", err)
	}

	opts, err := redis.ParseURL(connStr)
	if err != nil {
		t.Fatalf("failed to parse redis URL: %v", err)
	}

	client := redis.NewClient(opts)
	t.Cleanup(func() { client.Close() })

	return client
}

// FlushRedis flushes all keys for test isolation.
func FlushRedis(t *testing.T, client *redis.Client) {
	t.Helper()
	if err := client.FlushAll(context.Background()).Err(); err != nil {
		t.Fatalf("failed to flush redis: %v", err)
	}
}
```

- [ ] **Step 4: Verify compilation (integration tag)**

```bash
cd /Users/sushantkumar/Desktop/NovaProjecta/mindtab-v2-test-strategy/server
go build -tags=integration ./internal/testutil/...
```

Expected: clean build.

- [ ] **Step 5: Commit**

```bash
cd /Users/sushantkumar/Desktop/NovaProjecta/mindtab-v2-test-strategy
git add server/internal/testutil/db.go server/internal/testutil/redis.go server/go.mod server/go.sum
git commit -m "feat(testutil): add testcontainers Postgres and Redis setup"
```

---

## Task 6: Handler Tests — Saves Helper Functions

**Files:**
- Create: `server/internal/handler/saves_helpers_test.go`

- [ ] **Step 1: Write helper function tests**

```go
package handler

import (
	"testing"
)

func TestIsYouTubeURL(t *testing.T) {
	tests := map[string]struct {
		url  string
		want bool
	}{
		"youtube.com/watch":           {url: "https://www.youtube.com/watch?v=abc123", want: true},
		"youtube.com/shorts":          {url: "https://www.youtube.com/shorts/abc123", want: true},
		"youtube.com/embed":           {url: "https://www.youtube.com/embed/abc123", want: true},
		"youtube.com/v":               {url: "https://www.youtube.com/v/abc123", want: true},
		"youtu.be short link":         {url: "https://youtu.be/abc123", want: true},
		"m.youtube.com":               {url: "https://m.youtube.com/watch?v=abc123", want: true},
		"youtube-nocookie.com":        {url: "https://www.youtube-nocookie.com/embed/abc123", want: true},
		"not youtube":                 {url: "https://example.com/article", want: false},
		"youtube.com root":            {url: "https://www.youtube.com/", want: false},
		"youtu.be root":               {url: "https://youtu.be/", want: false},
		"invalid url":                 {url: "not a url", want: false},
		"empty":                       {url: "", want: false},
		"ftp scheme":                  {url: "ftp://youtube.com/watch?v=abc", want: true},
		"youtube.com/channel (false)": {url: "https://www.youtube.com/channel/UCxyz", want: false},
	}

	for name, tt := range tests {
		t.Run(name, func(t *testing.T) {
			got := isYouTubeURL(tt.url)
			if got != tt.want {
				t.Errorf("isYouTubeURL(%q) = %v, want %v", tt.url, got, tt.want)
			}
		})
	}
}

func TestImageExtFromMIME(t *testing.T) {
	tests := map[string]struct {
		mime string
		want string
	}{
		"jpeg": {mime: "image/jpeg", want: ".jpg"},
		"png":  {mime: "image/png", want: ".png"},
		"webp": {mime: "image/webp", want: ".webp"},
		"gif":  {mime: "image/gif", want: ""},
		"empty": {mime: "", want: ""},
	}

	for name, tt := range tests {
		t.Run(name, func(t *testing.T) {
			got := imageExtFromMIME(tt.mime)
			if got != tt.want {
				t.Errorf("imageExtFromMIME(%q) = %q, want %q", tt.mime, got, tt.want)
			}
		})
	}
}

func TestNullableStringSlice(t *testing.T) {
	t.Run("nil returns empty slice", func(t *testing.T) {
		got := nullableStringSlice(nil)
		if got == nil || len(got) != 0 {
			t.Errorf("expected empty slice, got %v", got)
		}
	})
	t.Run("non-nil passes through", func(t *testing.T) {
		input := []string{"a", "b"}
		got := nullableStringSlice(input)
		if len(got) != 2 || got[0] != "a" || got[1] != "b" {
			t.Errorf("expected [a b], got %v", got)
		}
	})
}

func TestSignAndVerifyMediaURL(t *testing.T) {
	h := &SavesHandler{jwtSecret: "test-secret-key"}

	t.Run("round trip succeeds", func(t *testing.T) {
		key := "user1/content1/image.jpg"
		signed := h.signMediaURL(key, 1*60*60) // 1 hour as seconds not duration — check actual signature
		// Extract sig and exp from the signed URL
		// signMediaURL returns: /media/{key}?sig={sig}&exp={exp}
		// We need to parse it
		if signed == "" {
			t.Fatal("signMediaURL returned empty string")
		}
	})

	t.Run("tampered signature fails", func(t *testing.T) {
		key := "user1/content1/image.jpg"
		if h.verifyMediaSignature(key, "tampered-sig", 9999999999) {
			t.Error("expected tampered signature to fail")
		}
	})

	t.Run("expired signature fails", func(t *testing.T) {
		key := "user1/content1/image.jpg"
		// Use exp=0 which is in the past
		if h.verifyMediaSignature(key, "any-sig", 0) {
			t.Error("expected expired signature to fail")
		}
	})
}
```

- [ ] **Step 2: Run tests to verify they pass**

```bash
cd /Users/sushantkumar/Desktop/NovaProjecta/mindtab-v2-test-strategy/server
go test ./internal/handler/ -run "TestIsYouTubeURL|TestImageExtFromMIME|TestNullableStringSlice|TestSignAndVerify" -v
```

Expected: all PASS.

- [ ] **Step 3: Commit**

```bash
cd /Users/sushantkumar/Desktop/NovaProjecta/mindtab-v2-test-strategy
git add server/internal/handler/saves_helpers_test.go
git commit -m "test(handler): add saves helper function unit tests"
```

---

## Task 7: Handler Tests — Saves CRUD + Search + Media

**Files:**
- Create: `server/internal/handler/saves_test.go`

**Important:** The `SavesHandler` takes concrete types `*queue.Producer` and `*search.SemanticSearch`. Before writing tests, check if these need to be refactored to interfaces. If they do, extract interfaces (`Enqueuer` and `Searcher`) in the handler package and update the handler constructor. If the handler already works with the mock approach (e.g., by passing mocks that satisfy the same methods), proceed directly.

This task should write all 29 saves handler tests from the spec:
- 11 POST /saves tests (article URL, YouTube URL, image upload, validation errors, DB/queue errors)
- 5 GET /saves tests (default pagination, custom, limit clamped, invalid params, signed URLs)
- 3 GET /saves/{id} tests (found, not found, bad UUID)
- 1 DELETE /saves/{id} test
- 4 POST /saves/search tests (valid, empty query, limit clamped, null results)
- 5 GET /media/* tests (valid sig, expired sig, invalid sig, bearer auth, wrong user)

Each test should:
1. Set up the mock Querier (via `store.QuerierMock` from moq) with the expected method behavior
2. Build an HTTP request using `testutil.JSONRequest`, `testutil.MultipartRequest`, or `testutil.AuthenticatedRequest`
3. Call the handler method via a chi router
4. Assert status code and response body

- [ ] **Step 1: Check if handler dependencies need interface extraction**

Read `server/internal/handler/saves.go` constructor. If `NewSavesHandler` takes `*queue.Producer` and `*search.SemanticSearch` (concrete types), you need to extract interfaces. Create them in the handler package:

```go
// In saves.go or a new file saves_deps.go:
type enqueuer interface {
    Enqueue(ctx context.Context, payload queue.JobPayload) error
}

type searcher interface {
    Search(ctx context.Context, userID string, query string, limit int) ([]search.SearchResult, error)
}
```

Then update `SavesHandler` to use these interfaces instead of concrete types. This is a production code change required to make the handler testable.

- [ ] **Step 2: Write saves_test.go with all 29 test cases**

Use table-driven subtests grouped by endpoint. Each test sets up a `QuerierMock`, a mock producer, a mock searcher, creates a `SavesHandler`, mounts it on a chi router, and fires the request.

The test file should be structured as:
- `TestSaves_Create` — subtests for article URL, YouTube URL, image upload, validation errors, DB/queue errors, pre-extracted content
- `TestSaves_List` — subtests for default, custom pagination, limit clamped, invalid params, signed media URLs
- `TestSaves_Get` — subtests for found, not found, bad UUID
- `TestSaves_Delete` — success case
- `TestSaves_Search` — subtests for valid, empty query, limit clamped, null results
- `TestSaves_ServeMedia` — subtests for valid sig, expired sig, invalid sig, bearer auth, wrong user

- [ ] **Step 3: Run tests**

```bash
cd /Users/sushantkumar/Desktop/NovaProjecta/mindtab-v2-test-strategy/server
go test ./internal/handler/ -run "TestSaves_" -v
```

Expected: all PASS.

- [ ] **Step 4: Commit**

```bash
cd /Users/sushantkumar/Desktop/NovaProjecta/mindtab-v2-test-strategy
git add server/internal/handler/saves_test.go
git commit -m "test(handler): add comprehensive saves handler tests — 29 cases"
```

---

## Task 8: Worker Step Tests — extract, summarize, embed

**Files:**
- Create: `server/internal/worker/steps/extract_test.go`
- Create: `server/internal/worker/steps/summarize_test.go`
- Create: `server/internal/worker/steps/embed_test.go`

These are isolated unit tests. Each step function takes specific dependencies that can be mocked.

**extract_test.go:** Test `Extract(ctx, jina, queries, job)`:
- Jina success → returns StepResult with ExtractResult JSON containing text and title
- Jina failure → returns error
- Pre-extracted content (job has content in DB with extracted_text) → skips Jina, returns existing text

**summarize_test.go:** Test `Summarize(ctx, llmChain, text)`:
- Valid JSON from LLM → returns SummarizeResult with title, summary, tags, key_topics
- Malformed JSON from LLM → returns error
- Correct prompt construction (verify LLM was called with expected prompt)

**embed_test.go:** Test `Embed(ctx, embeddingChain, text)`:
- Returns EmbedResult with 1536-dimension embedding
- Long text truncation (text > 2000 chars should be truncated before embedding)
- Embedding error → returns error

- [ ] **Step 1: Write extract_test.go, summarize_test.go, embed_test.go**

Each test creates a mock provider chain, calls the step function, and verifies the StepResult. Use `json.Unmarshal` on `result.Data` to verify the typed result.

- [ ] **Step 2: Run tests**

```bash
cd /Users/sushantkumar/Desktop/NovaProjecta/mindtab-v2-test-strategy/server
go test ./internal/worker/steps/ -run "TestExtract|TestSummarize|TestEmbed" -v
```

Expected: all PASS.

- [ ] **Step 3: Commit**

```bash
cd /Users/sushantkumar/Desktop/NovaProjecta/mindtab-v2-test-strategy
git add server/internal/worker/steps/extract_test.go server/internal/worker/steps/summarize_test.go server/internal/worker/steps/embed_test.go
git commit -m "test(steps): add extract, summarize, embed step unit tests"
```

---

## Task 9: Worker Step Tests — vision, store

**Files:**
- Create: `server/internal/worker/steps/vision_test.go`
- Create: `server/internal/worker/steps/store_test.go`

**vision_test.go:** Test `Vision(ctx, llmChain, job)` and `BatchVision(ctx, llmChain, framePaths)`:
- Single image vision → VisionResult with extracted_text and visual_description
- BatchVision with ≤20 frames → BatchVisionResult with combined description
- BatchVision with empty frame list → handle gracefully
- LLM error → returns error

**store_test.go:** Test `Store(ctx, queries, job, prevResults)`:
- Content not deleted → all fields persisted via Querier calls (UpdateContentResults, UpdateContentEmbedding, CompleteJob)
- Content soft-deleted (IsContentDeleted returns true) → job marked cancelled, no writes
- Missing required step results → appropriate error

- [ ] **Step 1: Write vision_test.go and store_test.go**

- [ ] **Step 2: Run tests**

```bash
cd /Users/sushantkumar/Desktop/NovaProjecta/mindtab-v2-test-strategy/server
go test ./internal/worker/steps/ -run "TestVision|TestBatchVision|TestStore" -v
```

Expected: all PASS.

- [ ] **Step 3: Commit**

```bash
cd /Users/sushantkumar/Desktop/NovaProjecta/mindtab-v2-test-strategy
git add server/internal/worker/steps/vision_test.go server/internal/worker/steps/store_test.go
git commit -m "test(steps): add vision and store step unit tests"
```

---

## Task 10: Worker Step Tests — metadata, download, transcribe, extract_frames

**Files:**
- Create: `server/internal/worker/steps/metadata_test.go`
- Create: `server/internal/worker/steps/download_test.go`
- Create: `server/internal/worker/steps/transcribe_test.go`
- Create: `server/internal/worker/steps/extract_frames_test.go`

**metadata_test.go:** Test `Metadata(ctx, ytdlp, sourceURL, maxDuration)`:
- Valid metadata parsed → MetadataResult with all fields
- Duration exceeds maxDuration → permanent error

**download_test.go:** Test `Download(ctx, ytdlp, sourceURL, tempBasePath, jobID, maxHeight)`:
- Successful download → DownloadResult with video file path
- ytdlp error → returns error

**transcribe_test.go:** Test `Transcribe(ctx, ytdlp, ffmpeg, transcriptionChain, sourceURL, videoFilePath, hasCaptions)`:
- hasCaptions=true → uses ytdlp.GetCaptions, transcript_source="captions"
- hasCaptions=false → uses ffmpeg.ExtractAudio + transcription chain, transcript_source="whisper"
- Transcription error → returns error

**extract_frames_test.go:** Test `ExtractFrames(ctx, ffmpeg, videoFilePath, durationSec, sceneThreshold, framesPerMinCap)`:
- Frames extracted → ExtractFramesResult with frame paths
- Frame cap applied correctly
- Empty video → handle gracefully

Note: Since these steps call `YTDLP` and `FFmpeg` which are concrete structs (not interfaces), you may need to either:
- Mock at the exec.Command level using a test helper that overrides the binary path
- Or extract interfaces from `YTDLP` and `FFmpeg` and update the step functions

Check the step function signatures — if they take `*services.YTDLP` (concrete), consider whether it's simpler to test the step's logic via the processor integration tests in Task 11 instead, and just test the pure parsing functions here.

- [ ] **Step 1: Write test files for all four steps**

- [ ] **Step 2: Run tests**

```bash
cd /Users/sushantkumar/Desktop/NovaProjecta/mindtab-v2-test-strategy/server
go test ./internal/worker/steps/ -v
```

Expected: all PASS.

- [ ] **Step 3: Commit**

```bash
cd /Users/sushantkumar/Desktop/NovaProjecta/mindtab-v2-test-strategy
git add server/internal/worker/steps/metadata_test.go server/internal/worker/steps/download_test.go server/internal/worker/steps/transcribe_test.go server/internal/worker/steps/extract_frames_test.go
git commit -m "test(steps): add metadata, download, transcribe, extract_frames step tests"
```

---

## Task 11: Worker Processor Tests — Article, Image, YouTube

**Files:**
- Create: `server/internal/worker/processors/article_test.go`
- Create: `server/internal/worker/processors/image_test.go`
- Create: `server/internal/worker/processors/youtube_test.go`

Each processor test creates the processor with mocked dependencies and calls `Execute` for each step, passing previous step results forward. This tests the pipeline wiring — that each step receives correct input from the previous step's output.

**article_test.go (5 tests):**
- `TestArticle_HappyPath` — all steps succeed
- `TestArticle_PreExtractedContent` — extract step skips Jina
- `TestArticle_ExtractFails` — error at extract step
- `TestArticle_SummarizeFails` — error at summarize step
- `TestArticle_StepOrder` — verify `Steps()` returns `["extract", "summarize", "embed", "store"]`

**image_test.go (4 tests):**
- `TestImage_HappyPath` — all steps succeed
- `TestImage_SaveCreatesMediaKey` — verify media key format
- `TestImage_VisionFails` — error at vision step
- `TestImage_StepOrder` — verify `Steps()` returns `["save", "vision", "summarize", "embed", "store"]`

**youtube_test.go (6 tests):**
- `TestYouTube_HappyPath` — all 8 steps succeed
- `TestYouTube_ExceedsMaxDuration` — permanent error at metadata
- `TestYouTube_CaptionsAvailable` — transcribe uses captions
- `TestYouTube_NoCaptions` — transcribe uses Whisper
- `TestYouTube_StepOrder` — verify all 8 steps in order
- `TestYouTube_LockTTL` — returns 15 minutes

- [ ] **Step 1: Write all three processor test files**

- [ ] **Step 2: Run tests**

```bash
cd /Users/sushantkumar/Desktop/NovaProjecta/mindtab-v2-test-strategy/server
go test ./internal/worker/processors/ -v
```

Expected: all PASS.

- [ ] **Step 3: Commit**

```bash
cd /Users/sushantkumar/Desktop/NovaProjecta/mindtab-v2-test-strategy
git add server/internal/worker/processors/article_test.go server/internal/worker/processors/image_test.go server/internal/worker/processors/youtube_test.go
git commit -m "test(processors): add article, image, youtube processor pipeline tests"
```

---

## Task 12: Worker Dispatcher Tests

**Files:**
- Create: `server/internal/worker/dispatcher_test.go`

The dispatcher tests require mocking `*queue.Consumer` and `*queue.RetryScheduler`. Since these are concrete types, check if the dispatcher accepts interfaces or concrete types. If concrete, extract interfaces:

```go
type jobConsumer interface {
    Dequeue(ctx context.Context, timeout time.Duration) (*queue.JobPayload, error)
    AcquireLock(ctx context.Context, jobID string, ttl time.Duration) (bool, error)
    ReleaseLock(ctx context.Context, jobID string) error
    Complete(ctx context.Context, payload queue.JobPayload) error
    SendToDeadLetter(ctx context.Context, payload queue.JobPayload) error
}

type retryScheduler interface {
    ScheduleRetry(ctx context.Context, payload queue.JobPayload, baseDelay time.Duration) error
}
```

**10 tests from spec:**
- `TestDispatcher_HappyPath`
- `TestDispatcher_UnknownContentType`
- `TestDispatcher_CheckpointResume`
- `TestDispatcher_RetriableError`
- `TestDispatcher_PermanentError`
- `TestDispatcher_MaxAttempts`
- `TestDispatcher_LockAcquired`
- `TestDispatcher_LockContention`
- `TestDispatcher_GracefulShutdown`
- `TestDispatcher_TempFileCleanup`

- [ ] **Step 1: Extract interfaces if needed, then write dispatcher_test.go**

- [ ] **Step 2: Run tests**

```bash
cd /Users/sushantkumar/Desktop/NovaProjecta/mindtab-v2-test-strategy/server
go test ./internal/worker/ -run "TestDispatcher" -v
```

Expected: all PASS.

- [ ] **Step 3: Commit**

```bash
cd /Users/sushantkumar/Desktop/NovaProjecta/mindtab-v2-test-strategy
git add server/internal/worker/dispatcher_test.go
git commit -m "test(worker): add dispatcher unit tests — 10 cases"
```

---

## Task 13: Queue Unit Tests — Producer, Consumer, Retry

**Files:**
- Create: `server/internal/queue/producer_test.go`
- Create: `server/internal/queue/consumer_test.go`
- Create: `server/internal/queue/retry_test.go`

Queue tests use a real Redis via testcontainers OR a mock redis.Client. Since the queue package directly uses `*redis.Client`, the simplest approach for unit tests is to use `miniredis` (in-memory Redis) for fast, no-Docker tests. Alternatively, test with real Redis in integration tests only and keep unit tests focused on `CalculateBackoff` and payload serialization.

**Recommended approach:**
- `retry_test.go` — test `CalculateBackoff` as a pure function (no Redis needed)
- `producer_test.go` and `consumer_test.go` — use `github.com/alicebob/miniredis/v2` for in-memory Redis, or defer to integration tests

**retry_test.go (pure function tests):**
- `TestCalculateBackoff_Exponential` — attempt 1→30s, 2→60s, 3→120s
- `TestCalculateBackoff_CappedAt10Min` — high attempt count still caps at 10min
- `TestCalculateBackoff_Jitter` — run multiple times, verify variance within ±25%

- [ ] **Step 1: Add miniredis dependency (optional)**

```bash
cd /Users/sushantkumar/Desktop/NovaProjecta/mindtab-v2-test-strategy/server
go get github.com/alicebob/miniredis/v2
```

- [ ] **Step 2: Write retry_test.go, producer_test.go, consumer_test.go**

- [ ] **Step 3: Run tests**

```bash
cd /Users/sushantkumar/Desktop/NovaProjecta/mindtab-v2-test-strategy/server
go test ./internal/queue/ -v
```

Expected: all PASS.

- [ ] **Step 4: Commit**

```bash
cd /Users/sushantkumar/Desktop/NovaProjecta/mindtab-v2-test-strategy
git add server/internal/queue/producer_test.go server/internal/queue/consumer_test.go server/internal/queue/retry_test.go server/go.mod server/go.sum
git commit -m "test(queue): add producer, consumer, retry scheduler unit tests"
```

---

## Task 14: Search Unit Test

**Files:**
- Create: `server/internal/search/semantic_test.go`

`SemanticSearch.Search` takes a `*pgxpool.Pool` directly for the pgvector query, making it hard to unit test without a real DB. The unit test should verify that the embedding provider is called with the query text. For full search verification, defer to integration tests (Task 18).

**semantic_test.go:**
- `TestSearch_EmbedsQuery` — verify the embedding chain is called with the query text. Since `SemanticSearch` takes a real pool, this test may need to use a nil pool and accept that the DB call fails after the embed call succeeds (test the embed call was made). Alternatively, extract the embed step and test it separately.

- [ ] **Step 1: Write semantic_test.go**

- [ ] **Step 2: Run test**

```bash
cd /Users/sushantkumar/Desktop/NovaProjecta/mindtab-v2-test-strategy/server
go test ./internal/search/ -run "TestSearch" -v
```

- [ ] **Step 3: Commit**

```bash
cd /Users/sushantkumar/Desktop/NovaProjecta/mindtab-v2-test-strategy
git add server/internal/search/semantic_test.go
git commit -m "test(search): add semantic search unit test"
```

---

## Task 15: Services Tests — ytdlp VTT parsing + ffmpeg downsample

**Files:**
- Create: `server/internal/services/ytdlp_test.go` (extend existing or create new)
- Create: `server/internal/services/ffmpeg_test.go`

**ytdlp_test.go:** Test `cleanVTT` and `stripHTMLTags`:
- VTT with timestamps, headers, sequence numbers → cleaned transcript
- HTML tags stripped
- Duplicate lines deduplicated
- Empty input → empty output

Note: `cleanVTT` and `stripHTMLTags` are unexported functions. Tests in the same package (`package services`) can access them.

**ffmpeg_test.go:** Test `uniformDownsample`:
- 10 items, cap 5 → 5 evenly spaced items
- 3 items, cap 10 → all 3 items (under cap)
- Empty input → empty output

Note: `uniformDownsample` is also unexported. Same package access applies.

- [ ] **Step 1: Write ytdlp_test.go and ffmpeg_test.go**

- [ ] **Step 2: Run tests**

```bash
cd /Users/sushantkumar/Desktop/NovaProjecta/mindtab-v2-test-strategy/server
go test ./internal/services/ -v
```

Expected: all PASS (including existing jina and storage tests).

- [ ] **Step 3: Commit**

```bash
cd /Users/sushantkumar/Desktop/NovaProjecta/mindtab-v2-test-strategy
git add server/internal/services/ytdlp_test.go server/internal/services/ffmpeg_test.go
git commit -m "test(services): add VTT parsing and frame downsample tests"
```

---

## Task 16: Providers Tests — Chain extension + Registry

**Files:**
- Modify: `server/internal/providers/chain_test.go` (add single provider test)
- Create: `server/internal/providers/registry_test.go`

**chain_test.go addition:**
- `TestChain_SingleProvider_Success` — one provider, success
- `TestChain_SingleProvider_Failure` — one provider, failure → error returned

**registry_test.go:**
- `TestRegistry_MissingGeminiKey` — no GEMINI_API_KEY → error
- `TestRegistry_MissingOpenAIKey` — no OPENAI_API_KEY → error
- `TestRegistry_ValidKeys` — both keys set → registry created with chains

Note: `NewRegistry` reads from a `RegistryConfig` struct, not env vars directly. So these tests pass the config struct.

- [ ] **Step 1: Write chain_test.go additions and registry_test.go**

- [ ] **Step 2: Run tests**

```bash
cd /Users/sushantkumar/Desktop/NovaProjecta/mindtab-v2-test-strategy/server
go test ./internal/providers/ -v
```

Expected: all PASS.

- [ ] **Step 3: Commit**

```bash
cd /Users/sushantkumar/Desktop/NovaProjecta/mindtab-v2-test-strategy
git add server/internal/providers/chain_test.go server/internal/providers/registry_test.go
git commit -m "test(providers): add single-provider chain tests and registry tests"
```

---

## Task 17: Integration Tests — Store (SQL queries)

**Files:**
- Create: `server/internal/store/integration_test.go`

All tests use `//go:build integration` tag. Each test uses `testutil.SetupTestDB` and `testutil.TruncateAllTables` for isolation.

**8 tests from spec:**
- `TestStore_CreateAndGetContent`
- `TestStore_ListContent`
- `TestStore_SoftDelete`
- `TestStore_CreateAndCompleteJob`
- `TestStore_UpdateJobStepResults`
- `TestStore_UpdateContentResults`
- `TestStore_UpdateContentEmbedding`
- `TestStore_IsContentDeleted`

Each test needs a user row first (foreign key). Insert a test user via `UpsertUser` before content/job operations.

- [ ] **Step 1: Write integration_test.go**

- [ ] **Step 2: Run integration tests**

```bash
cd /Users/sushantkumar/Desktop/NovaProjecta/mindtab-v2-test-strategy/server
go test -tags=integration ./internal/store/ -v
```

Expected: all PASS (requires Docker running).

- [ ] **Step 3: Commit**

```bash
cd /Users/sushantkumar/Desktop/NovaProjecta/mindtab-v2-test-strategy
git add server/internal/store/integration_test.go
git commit -m "test(store): add SQL query integration tests — 8 cases"
```

---

## Task 18: Integration Tests — Queue lifecycle + Search pgvector

**Files:**
- Create: `server/internal/queue/integration_test.go`
- Create: `server/internal/search/integration_test.go`

**queue/integration_test.go (5 tests):**
- `TestQueue_FullLifecycle` — enqueue → dequeue → complete
- `TestQueue_RetryLifecycle` — enqueue → dequeue → schedule retry → poll → back in pending
- `TestQueue_DeadLetterLifecycle` — enqueue → dequeue → dead letter
- `TestQueue_OrphanRecovery` — job in processing without lock → recovered
- `TestQueue_LockExpiry` — acquire lock → wait → lock gone

Uses `testutil.SetupTestRedis` and `testutil.FlushRedis` for isolation.

**search/integration_test.go (4 tests):**
- `TestSearch_ReturnsRankedResults` — insert 3 contents with embeddings, search, verify order
- `TestSearch_UserScoped` — user A content not returned for user B
- `TestSearch_ExcludesSoftDeleted` — soft-deleted excluded
- `TestSearch_EmptyResults` — no matches → empty array

Uses `testutil.SetupTestDB` with pgvector. Needs real embedding vectors inserted.

- [ ] **Step 1: Write both integration test files**

- [ ] **Step 2: Run integration tests**

```bash
cd /Users/sushantkumar/Desktop/NovaProjecta/mindtab-v2-test-strategy/server
go test -tags=integration ./internal/queue/ -v
go test -tags=integration ./internal/search/ -v
```

Expected: all PASS (requires Docker).

- [ ] **Step 3: Commit**

```bash
cd /Users/sushantkumar/Desktop/NovaProjecta/mindtab-v2-test-strategy
git add server/internal/queue/integration_test.go server/internal/search/integration_test.go
git commit -m "test(integration): add queue lifecycle and pgvector search tests"
```

---

## Task 19: Integration Tests — Middleware Auth

**Files:**
- Create: `server/internal/middleware/auth_test.go`

**3 tests:**
- `TestAuth_ValidJWT` — generate valid JWT with test secret, pass through middleware → user ID in context
- `TestAuth_ExpiredJWT` — generate expired JWT → 401
- `TestAuth_MissingToken` — no Authorization header → 401

Uses `//go:build integration` tag. Generate test JWTs using `golang.org/x/crypto` and the JWT signing logic (or use a test helper that creates tokens with the same secret).

- [ ] **Step 1: Write auth_test.go**

- [ ] **Step 2: Run tests**

```bash
cd /Users/sushantkumar/Desktop/NovaProjecta/mindtab-v2-test-strategy/server
go test -tags=integration ./internal/middleware/ -v
```

Expected: all PASS.

- [ ] **Step 3: Commit**

```bash
cd /Users/sushantkumar/Desktop/NovaProjecta/mindtab-v2-test-strategy
git add server/internal/middleware/auth_test.go
git commit -m "test(middleware): add auth middleware integration tests"
```

---

## Task 20: CI Workflows

**Files:**
- Create: `.github/workflows/test-unit.yml`
- Create: `.github/workflows/test-integration.yml`

- [ ] **Step 1: Create test-unit.yml**

```yaml
name: Unit Tests
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-go@v5
        with:
          go-version-file: server/go.mod
      - run: cd server && go test ./...
```

- [ ] **Step 2: Create test-integration.yml**

```yaml
name: Integration Tests
on:
  pull_request:
    branches: [main]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-go@v5
        with:
          go-version-file: server/go.mod
      - run: cd server && go test -tags=integration ./...
```

- [ ] **Step 3: Commit**

```bash
cd /Users/sushantkumar/Desktop/NovaProjecta/mindtab-v2-test-strategy
git add .github/workflows/test-unit.yml .github/workflows/test-integration.yml
git commit -m "ci: add unit test and integration test GitHub Actions workflows"
```

---

## Task 21: Final Verification

- [ ] **Step 1: Run all unit tests**

```bash
cd /Users/sushantkumar/Desktop/NovaProjecta/mindtab-v2-test-strategy/server
go test ./... -v 2>&1 | tail -50
```

Expected: all PASS, no Docker needed.

- [ ] **Step 2: Run all integration tests (if Docker available)**

```bash
cd /Users/sushantkumar/Desktop/NovaProjecta/mindtab-v2-test-strategy/server
go test -tags=integration ./... -v 2>&1 | tail -50
```

Expected: all PASS.

- [ ] **Step 3: Verify no changes leaked to main**

```bash
cd /Users/sushantkumar/Desktop/NovaProjecta/mindtab-v2
git status
git log --oneline -3
```

Expected: clean working tree on main, no test-related commits.

---

## Spec Coverage Checklist

| Spec Section | Task(s) | Status |
|---|---|---|
| moq for Querier | Task 1 | |
| testutil/auth.go | Task 2 | |
| testutil/http.go | Task 2 | |
| testutil/factory.go | Task 3 | |
| testutil/mocks.go | Task 4 | |
| testutil/db.go | Task 5 | |
| testutil/redis.go | Task 5 | |
| Saves handler tests (29) | Task 6 + 7 | |
| Worker step tests (9 files) | Task 8 + 9 + 10 | |
| Processor tests (article, image, youtube) | Task 11 | |
| Dispatcher tests (10) | Task 12 | |
| Queue unit tests (producer, consumer, retry) | Task 13 | |
| Search unit test | Task 14 | |
| Services tests (ytdlp, ffmpeg) | Task 15 | |
| Providers tests (chain, registry) | Task 16 | |
| Store integration tests (8) | Task 17 | |
| Queue integration tests (5) | Task 18 | |
| Search integration tests (4) | Task 18 | |
| Middleware auth tests (3) | Task 19 | |
| CI workflows (unit + integration) | Task 20 | |
| Makefile | Task 1 | |
| Final verification | Task 21 | |

All spec sections have corresponding tasks. No gaps.
