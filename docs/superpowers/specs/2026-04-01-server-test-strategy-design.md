# Server Test Strategy — Design Spec

Comprehensive test strategy for the MindTab Go server covering all handlers, workers, queue, search, providers, and services. Three-layer architecture: fast unit tests, integration tests with real Postgres+Redis via testcontainers, and HTTP-level handler tests.

## Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Mock generation | `moq` for Querier, hand-written for everything else | Querier has ~100 methods — codegen avoids boilerplate. Small interfaces (2–4 methods) stay hand-written for readability. moq has zero runtime dependency. |
| Integration test infra | testcontainers-go | Real Postgres+Redis in Docker, no manual setup. GitHub Actions has Docker pre-installed. |
| External binaries (yt-dlp, ffmpeg) | Mock at service boundary | No binaries in CI. Pure parsing logic tested with fixtures. |
| Auth in tests | Context injection (`WithUserID`) for unit tests, real middleware for integration | Avoids JWT ceremony in unit tests while still verifying the full auth chain in integration. |
| Coverage target | No hard number — all critical paths covered | Focus on correctness of important flows, not vanity metrics. |
| Build tags | `//go:build integration` for container tests | Default `go test ./...` is fast (no Docker). CI runs integration explicitly. |
| Test style | Table-driven subtests | Standard Go idiom. `map[string]struct{}` pattern for handler validation and step functions. |

## Three-Layer Architecture

### Layer 1: Unit Tests (no infra, fast)

Every package gets `_test.go` files. Dependencies are mocked via interfaces. No Docker, no network calls, no file I/O (except `t.TempDir()` where needed).

Covers: validation logic, routing, response shaping, pipeline step ordering, retry backoff calculation, HMAC signing, URL detection, VTT parsing, provider chain behavior.

Runs with: `go test ./server/...`

### Layer 2: Integration Tests (real Postgres + Redis)

Shared `testutil.TestMain` boots containers once per test run and runs migrations. External APIs (Gemini, OpenAI, Jina, Groq) are mocked via `httptest.Server`.

Covers: actual SQL queries via sqlc, Redis queue lifecycle (enqueue → dequeue → complete/retry/dead-letter), pgvector similarity search, job persistence and checkpoint resume, orphan recovery.

Runs with: `go test -tags=integration ./server/...`

### Layer 3: Handler Tests (HTTP-level)

Uses `httptest.NewRecorder()` and `chi.NewRouter()` to test the full HTTP surface. Auth context injected via `testutil.WithUserID`. Querier, Producer, and SemanticSearch are mocked.

Covers: request parsing, status codes, response bodies, pagination, validation error messages, content-type routing, signed URL generation/verification.

Runs with: `go test ./server/...` (no build tag — these are unit tests)

## Shared Test Infrastructure

### Package: `server/internal/testutil/`

#### `db.go` — Testcontainers Postgres

Boots a Postgres container with the `pgvector/pgvector:pg16` image. Runs all migrations from `server/migrations/` in order. Returns a `*pgxpool.Pool` and a cleanup function. Used only in `//go:build integration` tests.

```go
func SetupTestDB(t *testing.T) *pgxpool.Pool
```

Container is started once per test binary via `TestMain`. Each test gets a clean state by truncating tables, not by rebooting the container.

#### `redis.go` — Testcontainers Redis

Boots a Redis container. Returns a `*redis.Client` and a cleanup function.

```go
func SetupTestRedis(t *testing.T) *redis.Client
```

Same lifecycle as Postgres — one container per binary, flush between tests.

#### `auth.go` — Auth Context Helper

```go
func WithUserID(ctx context.Context, userID string) context.Context
```

Injects user ID into context using the same key as `middleware.UserIDFromContext`. Bypasses JWT parsing entirely. Used in handler unit tests and integration tests.

#### `http.go` — HTTP Test Helpers

```go
func JSONRequest(method, path string, body any) *http.Request
func MultipartRequest(path, fieldName, fileName string, fileData []byte, mimeType string) *http.Request
func AssertStatus(t *testing.T, resp *httptest.ResponseRecorder, expected int)
func DecodeJSON[T any](t *testing.T, resp *httptest.ResponseRecorder) T
```

#### `factory.go` — Test Data Factories

Functional options pattern. Each factory returns a struct with sane defaults; tests override only what they care about.

```go
type ContentOption func(*store.CreateContentRow)

func NewContentRow(opts ...ContentOption) store.CreateContentRow
func NewListContentRow(opts ...ListContentOption) store.ListContentRow
func NewJobPayload(opts ...PayloadOption) queue.JobPayload
func NewGetContentRow(opts ...GetContentOption) store.GetContentByIDRow
```

#### `mocks.go` — Hand-Written Mocks

Small interfaces with 2–4 methods. Each mock records calls and returns configurable responses.

```go
// MockLLMProvider — records calls, returns configurable text response.
type MockLLMProvider struct {
    Response string
    Err      error
    Calls    []llm.LLMRequest
}

// MockEmbeddingProvider — returns a fixed embedding vector.
type MockEmbeddingProvider struct {
    Embedding []float32
    Err       error
}

// MockTranscriptionProvider — returns a fixed transcript.
type MockTranscriptionProvider struct {
    Transcript string
    Err        error
}

// MockStorageProvider — in-memory, map-backed.
type MockStorageProvider struct {
    Files map[string][]byte
}

// MockProducer — records enqueued payloads.
type MockProducer struct {
    Enqueued []queue.JobPayload
    Err      error
}

// MockSemanticSearch — returns configurable results.
type MockSemanticSearch struct {
    Results []search.SearchResult
    Err     error
}

// MockConsumer — records dequeue/complete/dead-letter calls.
type MockConsumer struct { ... }

// MockRetryScheduler — records scheduled retries.
type MockRetryScheduler struct { ... }
```

#### Querier Mock — moq-generated

```
moq -out internal/store/mock_querier.go -pkg store ./internal/store Querier
```

Generates a struct with function fields. Each test sets only the fields it needs:

```go
mock := &QuerierMock{
    CreateContentFunc: func(ctx context.Context, arg CreateContentParams) (CreateContentRow, error) {
        return testutil.NewContentRow(), nil
    },
}
```

## Critical Paths by Package

### `handler/` — HTTP Surface

#### Saves Handler (`saves_test.go`)

| Test | Method | Scenario | Expected |
|---|---|---|---|
| `TestSaves_Create_ArticleURL` | POST /saves | Valid HTTP URL, JSON body | 201, `status: "pending"`, job enqueued |
| `TestSaves_Create_YouTubeURL` | POST /saves | YouTube URL (youtube.com/watch, youtu.be, shorts) | 201, content_type: "youtube" |
| `TestSaves_Create_ImageUpload` | POST /saves | Multipart JPEG upload | 201, content_type: "image" |
| `TestSaves_Create_EmptyURL` | POST /saves | `{ "url": "" }` | 400 |
| `TestSaves_Create_InvalidScheme` | POST /saves | `{ "url": "ftp://..." }` | 400 |
| `TestSaves_Create_URLTooLong` | POST /saves | URL > 2048 chars | 400 |
| `TestSaves_Create_BadMIME` | POST /saves | Multipart with `image/gif` | 400 |
| `TestSaves_Create_OversizedFile` | POST /saves | File exceeds maxSize | 413 |
| `TestSaves_Create_WithPreExtracted` | POST /saves | JSON with `content` field | 201, CreateContentWithExtracted called |
| `TestSaves_Create_DBError` | POST /saves | Querier returns error | 500 |
| `TestSaves_Create_QueueError` | POST /saves | Producer returns error | 500 |
| `TestSaves_List_Default` | GET /saves | No params | 200, limit=20, offset=0 |
| `TestSaves_List_CustomPagination` | GET /saves | `?limit=5&offset=10` | 200, respects params |
| `TestSaves_List_LimitClamped` | GET /saves | `?limit=999` | 200, clamped to 100 |
| `TestSaves_List_InvalidParams` | GET /saves | `?limit=abc` | 400 |
| `TestSaves_List_SignedMediaURLs` | GET /saves | Content with media_key | 200, media_url is signed |
| `TestSaves_Get_Found` | GET /saves/{id} | Valid ID, user owns it | 200, full content JSON |
| `TestSaves_Get_NotFound` | GET /saves/{id} | ID doesn't exist | 404 |
| `TestSaves_Get_BadUUID` | GET /saves/{id} | Malformed UUID | 400 |
| `TestSaves_Delete_Success` | DELETE /saves/{id} | Valid ID | 204 |
| `TestSaves_Search_Valid` | POST /saves/search | `{ "query": "..." }` | 200, results array |
| `TestSaves_Search_EmptyQuery` | POST /saves/search | `{ "query": "" }` | 400 |
| `TestSaves_Search_LimitClamped` | POST /saves/search | `{ "query": "...", "limit": 999 }` | 200, clamped to 50 |
| `TestSaves_Search_NullResults` | POST /saves/search | Search returns nil | 200, empty array |
| `TestSaves_ServeMedia_ValidSig` | GET /media/* | Valid HMAC + unexpired | 200, file contents |
| `TestSaves_ServeMedia_ExpiredSig` | GET /media/* | Valid HMAC + expired | 403 |
| `TestSaves_ServeMedia_InvalidSig` | GET /media/* | Tampered HMAC | 403 |
| `TestSaves_ServeMedia_BearerAuth` | GET /media/* | No sig, valid bearer, user owns path | 200 |
| `TestSaves_ServeMedia_WrongUser` | GET /media/* | No sig, valid bearer, different user's path | 403 |

#### Other Handlers — Same Pattern

Each handler gets tests for:
- Valid CRUD operations (create → 201, list → 200, get → 200, delete → 204)
- Input validation (missing fields → 400, malformed input → 400)
- Not found (→ 404)
- DB errors (→ 500)

Handlers to cover: `auth`, `goals`, `habits`, `habit_tracker`, `journals`, `bookmarks`, `projects`, `activity`, `chat`, `mentions`, `search`, `users`, `email_auth`, `ws`.

#### Helper Functions (`saves_test.go` or separate)

| Test | Function | Scenario |
|---|---|---|
| `TestIsYouTubeURL` | `isYouTubeURL` | Table-driven: youtube.com/watch, youtu.be/x, /shorts/, /embed/, /v/, non-YouTube URLs, invalid URLs |
| `TestImageExtFromMIME` | `imageExtFromMIME` | jpeg → .jpg, png → .png, webp → .webp, unknown → "" |
| `TestSignAndVerifyMediaURL` | `signMediaURL` / `verifyMediaSignature` | Round-trip: sign → verify succeeds, tampered sig fails, expired fails |
| `TestNullableStringSlice` | `nullableStringSlice` | nil → empty slice, non-nil passes through |

### `worker/` — Pipeline Correctness

#### Dispatcher (`dispatcher_test.go`)

| Test | Scenario |
|---|---|
| `TestDispatcher_HappyPath` | Dequeue → processor found → all steps execute in order → job completed |
| `TestDispatcher_UnknownContentType` | Dequeue → no processor registered → permanent error → dead letter |
| `TestDispatcher_CheckpointResume` | Job with 2/4 steps completed in step_results → resumes from step 3 |
| `TestDispatcher_RetriableError` | Step fails with retriable error → retry scheduled with backoff |
| `TestDispatcher_PermanentError` | Step fails with permanent error → dead letter immediately |
| `TestDispatcher_MaxAttempts` | Attempt count = max → dead letter regardless of error type |
| `TestDispatcher_LockAcquired` | Lock obtained before processing, released after |
| `TestDispatcher_LockContention` | Lock already held → job re-queued, not processed |
| `TestDispatcher_GracefulShutdown` | Context cancelled → worker exits after current job completes |
| `TestDispatcher_TempFileCleanup` | Image job completes → temp file removed. Image job fails → temp file removed. |

#### Article Processor (`processors/article_test.go`)

| Test | Scenario |
|---|---|
| `TestArticle_HappyPath` | extract → summarize → embed → store all succeed |
| `TestArticle_PreExtractedContent` | Content already in DB → extract step skips Jina fetch |
| `TestArticle_ExtractFails` | Jina fails → error returned at extract step |
| `TestArticle_SummarizeFails` | LLM returns error → error returned at summarize step |
| `TestArticle_StepOrder` | Steps() returns `["extract", "summarize", "embed", "store"]` |

#### Image Processor (`processors/image_test.go`)

| Test | Scenario |
|---|---|
| `TestImage_HappyPath` | save → vision → summarize → embed → store all succeed |
| `TestImage_SaveCreatesMediaKey` | Media key format: `{userID}/{contentID}/image{ext}` |
| `TestImage_VisionFails` | LLM vision error → error returned |
| `TestImage_StepOrder` | Steps() returns `["save", "vision", "summarize", "embed", "store"]` |

#### YouTube Processor (`processors/youtube_test.go`)

| Test | Scenario |
|---|---|
| `TestYouTube_HappyPath` | All 8 steps succeed |
| `TestYouTube_ExceedsMaxDuration` | metadata returns duration > max → permanent error |
| `TestYouTube_CaptionsAvailable` | transcribe step uses captions, skips Whisper |
| `TestYouTube_NoCaptions` | transcribe step falls back to Whisper |
| `TestYouTube_StepOrder` | Steps() returns all 8 steps in order |
| `TestYouTube_LockTTL` | LockTTL() returns 15 minutes (longer than article/image) |

#### Step Functions (`steps/*_test.go`)

Each step tested in isolation with mocked dependencies:

| Test File | Key Tests |
|---|---|
| `extract_test.go` | Jina success, Jina failure, pre-extracted content check |
| `summarize_test.go` | Valid JSON parsed from LLM, malformed JSON error, correct prompt construction |
| `embed_test.go` | Embedding returned with 1536 dimensions, long text truncated at 2000 chars |
| `vision_test.go` | Single image vision, batch vision ≤20 images per request, empty batch |
| `store_test.go` | Content not deleted → fields persisted, content soft-deleted → job cancelled |
| `metadata_test.go` | Valid metadata parsed, duration extracted |
| `transcribe_test.go` | Captions path, Whisper path, audio extraction |
| `download_test.go` | Video downloaded to temp dir, path returned |
| `extract_frames_test.go` | Frame paths returned, frame cap applied |

### `queue/` — Redis Lifecycle

#### Unit Tests (mocked Redis)

| Test | File | Scenario |
|---|---|---|
| `TestProducer_Enqueue` | `producer_test.go` | Payload serialized, LPUSH to pending |
| `TestConsumer_Dequeue` | `consumer_test.go` | BRPOPLPUSH pending → processing, payload deserialized |
| `TestConsumer_DequeueTimeout` | `consumer_test.go` | No jobs available → nil returned |
| `TestConsumer_AcquireLock` | `consumer_test.go` | SETNX succeeds → true |
| `TestConsumer_LockContention` | `consumer_test.go` | SETNX fails (already held) → false |
| `TestConsumer_Complete` | `consumer_test.go` | LREM from processing |
| `TestConsumer_SendToDeadLetter` | `consumer_test.go` | LREM from processing + LPUSH to dead |
| `TestRetry_CalculateBackoff` | `retry_test.go` | Exponential: attempt 1 → 30s, attempt 2 → 60s, ..., capped at 10min |
| `TestRetry_BackoffJitter` | `retry_test.go` | Jitter adds ±25% variance |
| `TestRetry_ScheduleRetry` | `retry_test.go` | ZADD to retry set with correct score |

#### Integration Tests (`integration_test.go`, `//go:build integration`)

| Test | Scenario |
|---|---|
| `TestQueue_FullLifecycle` | Enqueue → dequeue → complete. Verify pending/processing lists empty. |
| `TestQueue_RetryLifecycle` | Enqueue → dequeue → schedule retry → poll → job back in pending |
| `TestQueue_DeadLetterLifecycle` | Enqueue → dequeue → dead letter. Verify in dead list. |
| `TestQueue_OrphanRecovery` | Job in processing, no lock → RecoverOrphans moves to pending |
| `TestQueue_LockExpiry` | Acquire lock → wait for TTL → lock gone |

### `search/` — Semantic Search

#### Unit Test (`semantic_test.go`)

| Test | Scenario |
|---|---|
| `TestSearch_EmbedsQuery` | Verifies embedding provider called with query text |

#### Integration Test (`integration_test.go`, `//go:build integration`)

| Test | Scenario |
|---|---|
| `TestSearch_ReturnsRankedResults` | Insert 3 contents with embeddings → search → results ordered by similarity |
| `TestSearch_UserScoped` | User A's content not returned for user B's search |
| `TestSearch_ExcludesSoftDeleted` | Soft-deleted content excluded from results |
| `TestSearch_EmptyResults` | No matching content → empty array |

### `providers/` — Chain & Registry

| Test | File | Scenario |
|---|---|---|
| (existing) | `chain_test.go` | First succeeds, fallback on retriable, stops on permanent, all exhausted |
| `TestChain_SingleProvider` | `chain_test.go` | One provider, success and failure |
| `TestRegistry_MissingKey` | `registry_test.go` | Required API key missing → error logged, clean exit |

### `services/` — Pure Function Tests

| Test | File | Scenario |
|---|---|---|
| (existing) | `jina_test.go` | Extract success, extract error |
| (existing) | `storage_test.go` | Save+Get, Delete, GetNotFound |
| `TestVTTParsing` | `ytdlp_test.go` | Hardcoded VTT fixture → cleaned transcript. Deduplication, HTML tag stripping, timestamp removal. |
| `TestFFmpegFrameParsing` | `ffmpeg_test.go` | Hardcoded stdout → frame paths extracted. Cap applied. Empty output handled. |

### `store/` — SQL Queries (Integration Only)

`integration_test.go` (`//go:build integration`):

| Test | Scenario |
|---|---|
| `TestStore_CreateAndGetContent` | Insert content → get by ID → fields match |
| `TestStore_ListContent` | Insert 3 → list with limit 2 → 2 returned, ordered by created_at DESC |
| `TestStore_SoftDelete` | Insert → soft delete → get returns not found, list excludes it |
| `TestStore_CreateAndCompleteJob` | Insert job → start → complete → status transitions correct |
| `TestStore_UpdateJobStepResults` | Insert job → update step_results JSONB → get → results persisted |
| `TestStore_UpdateContentResults` | Insert content → update with summary/tags/topics → get → fields match |
| `TestStore_UpdateContentEmbedding` | Insert content → update embedding → verify vector stored |
| `TestStore_IsContentDeleted` | Active content → false, soft-deleted → true |

### `middleware/` — Auth (Integration Only)

| Test | Scenario |
|---|---|
| `TestAuth_ValidJWT` | Valid token → user ID in context, request proceeds |
| `TestAuth_ExpiredJWT` | Expired token → 401 |
| `TestAuth_MissingToken` | No Authorization header → 401 |

## File Structure

```
server/internal/
├── testutil/
│   ├── db.go                       # Testcontainers Postgres + migrations
│   ├── redis.go                    # Testcontainers Redis
│   ├── auth.go                     # WithUserID context helper
│   ├── http.go                     # JSON/multipart request builders, assertions
│   ├── factory.go                  # Test data factories (functional options)
│   └── mocks.go                    # Hand-written mocks for small interfaces
├── handler/
│   ├── saves_test.go
│   ├── auth_test.go
│   ├── goals_test.go
│   ├── habits_test.go
│   ├── habit_tracker_test.go
│   ├── journals_test.go
│   ├── bookmarks_test.go
│   ├── projects_test.go
│   ├── activity_test.go
│   ├── chat_test.go
│   ├── mentions_test.go
│   ├── search_test.go
│   ├── users_test.go
│   ├── email_auth_test.go
│   └── ws_test.go
├── worker/
│   ├── dispatcher_test.go
│   ├── processor_test.go
│   ├── processors/
│   │   ├── article_test.go
│   │   ├── image_test.go
│   │   └── youtube_test.go
│   └── steps/
│       ├── extract_test.go
│       ├── summarize_test.go
│       ├── embed_test.go
│       ├── vision_test.go
│       ├── store_test.go
│       ├── metadata_test.go
│       ├── transcribe_test.go
│       ├── download_test.go
│       └── extract_frames_test.go
├── queue/
│   ├── producer_test.go
│   ├── consumer_test.go
│   ├── retry_test.go
│   └── integration_test.go         # //go:build integration
├── search/
│   ├── semantic_test.go
│   └── integration_test.go         # //go:build integration
├── services/
│   ├── jina_test.go                # (existing)
│   ├── storage_test.go             # (existing)
│   ├── ytdlp_test.go
│   └── ffmpeg_test.go
├── providers/
│   ├── chain_test.go               # (existing)
│   └── registry_test.go
├── store/
│   ├── mock_querier.go             # moq-generated
│   └── integration_test.go         # //go:build integration
└── middleware/
    └── auth_test.go                # //go:build integration
```

## CI Pipeline

### `test-unit.yml` — Every push and PR

Runs all unit tests. No Docker, no containers, no external services. Target: under 30 seconds.

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

### `test-integration.yml` — PRs to main

Runs unit + integration tests. Testcontainers handles Docker automatically.

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

### Makefile (`server/Makefile`)

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

## New Go Dependencies (test only)

| Dependency | Purpose |
|---|---|
| `github.com/testcontainers/testcontainers-go` | Postgres + Redis containers for integration tests |
| `github.com/testcontainers/testcontainers-go/modules/postgres` | Postgres module with pgvector image |
| `github.com/testcontainers/testcontainers-go/modules/redis` | Redis module |
| `github.com/matryer/moq` | Querier mock generation (CLI tool, not a runtime dep) |

## Implementation Priority

The order to build, based on value delivered per effort:

1. **`testutil/`** — foundation everything depends on
2. **`handler/saves_test.go`** — highest-risk, most complex handler
3. **`worker/steps/*_test.go`** — isolated, high-value, easy to write
4. **`worker/processors/*_test.go`** — pipeline correctness
5. **`worker/dispatcher_test.go`** — orchestration + retry logic
6. **`queue/*_test.go`** — queue lifecycle
7. **`search/semantic_test.go`** — search correctness
8. **`store/integration_test.go`** — SQL query verification
9. **`queue/integration_test.go`** — real Redis lifecycle
10. **`search/integration_test.go`** — pgvector search
11. **Remaining handler tests** — other CRUD handlers (goals, habits, journals, etc.)
12. **`services/ytdlp_test.go`, `ffmpeg_test.go`** — parsing fixtures
13. **`providers/registry_test.go`** — env var handling
14. **`middleware/auth_test.go`** — auth chain integration
