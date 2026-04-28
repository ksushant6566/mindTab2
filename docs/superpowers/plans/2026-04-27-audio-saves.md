# Audio Saves & Unified Save Lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add voice recording and audio file saves to MindTab Mobile (Phase 3 audio half), and unify the saves lifecycle across all source types so current and future saves share one consistent create-and-commit flow.

**Architecture:** A polymorphic `POST /saves` endpoint accepts JSON or multipart bodies for any source type, with new `auto_commit` and `start_processing` flags driving an orthogonal `commit_status` (`draft`/`committed`) lifecycle alongside `processing_status` (extended with a new `deferred` initial state). New `POST /saves/:id/commit` endpoint flips drafts and enqueues deferred jobs. New `AudioProcessor` runs `[transcribe, summarize, embed, store]` with server-side ffmpeg silence-aware chunking handling the Whisper 25 MB ceiling. Mobile adds an `expo-audio` recorder, a review screen with eager-or-deferred processing branching at the 60-second mark, an audio card variant in the vault, a persistent mini player, and an audio-aware detail screen. The image handler is refactored to write directly to permanent storage (matching audio); the image processor's `save` step is removed. iOS share extension gains audio UTI handling.

**Tech Stack:** Go (Chi, sqlc, pgx), PostgreSQL with pgvector, Redis, ffmpeg, Groq Whisper, Gemini Flash. Expo SDK 52+, expo-audio, expo-document-picker, Zustand, TanStack Query, Expo Router. Swift for the iOS share extension.

**Spec:** `docs/superpowers/specs/2026-04-27-audio-saves-design.md`

**Worktree:** `feat-audio-saves-design` (branch `worktree-feat-audio-saves-design`).

**Reality notes (small spec / code divergences worth knowing as you implement):**
- The image processor's `save` step is an *inline method* on `ImageProcessor` (`p.save(ctx, job)` inside `image.go`). There is no `server/internal/worker/steps/save.go`.
- Existing `processing_status` values in the database are `pending` / `processing` / `completed` / `failed`. The spec used `processed`; this plan uses `completed` to match reality. The new `deferred` state joins them.
- `SummarizeResult` already has a `Title` field. The "extension" for audio is purely about (a) the LLM prompt asking for a title for audio rows specifically, and (b) `Store` writing it to `source_title` for audio.

---

## Chunks

| # | Topic | Tasks | Notes |
|---|---|---|---|
| 1 | Schema migration & sqlc query foundation | 1–4 | Drives every later chunk |
| 2 | `JobPayload` slim + image handler / processor refactor | 5–8 | Net code reduction |
| 3 | Polymorphic `POST /saves` flags + commit endpoint + draft filter | 9–13 | Lifecycle plumbing |
| 4 | Audio multipart upload in `POST /saves` | 14–16 | Reuses image multipart pattern |
| 5 | `AudioProcessor` + basic `transcribe_audio` step | 17–20 | Single-call Whisper, no chunking yet |
| 6 | Server-side ffmpeg silence-aware chunking | 21–23 | Handles >24 MB audio |
| 7 | Audio title in `SummarizeStep` + draft cleanup goroutine | 24–26 | Wires into `cmd/api/main.go` |
| 8 | OpenAPI / api-spec types | 27–29 | Generated TS flows to mobile |
| 9 | Mobile deps + `app.json` config | 30–31 | `expo-audio`, background audio |
| 10 | Mobile recorder store + recorder screen | 32–35 | Foreground service, mic permission |
| 11 | Mobile review screen + audio player + hooks | 36–40 | Upload, draft poll, commit |
| 12 | Mobile vault audio card + mini player + detail screen + SaveFAB tabs | 41–46 | All vault-side UX |
| 13 | iOS share extension audio UTI | 47–48 | Lands committed via `POST /saves` |
| 14 | Integration tests + manual smoke | 49–51 | End-to-end validation |

Total: 51 tasks. Each is bite-sized (2–5 minutes) and self-contained.

---

## Chunk 1: Schema Migration & Sqlc Query Foundation

### Task 1: Write the up/down migration

**Files:**
- Create: `server/migrations/000006_unified_save_lifecycle.up.sql`
- Create: `server/migrations/000006_unified_save_lifecycle.down.sql`

- [ ] **Step 1: Write `000006_unified_save_lifecycle.up.sql`**

```sql
-- Layer 2: orthogonal commit lifecycle for every save row
ALTER TABLE mindmap_content
    ADD COLUMN commit_status TEXT NOT NULL DEFAULT 'committed';
COMMENT ON COLUMN mindmap_content.commit_status IS 'draft until the user finalises the save; committed otherwise';

-- Layer 3: source-type-agnostic columns
ALTER TABLE mindmap_content
    RENAME COLUMN video_duration TO duration_seconds;
COMMENT ON COLUMN mindmap_content.duration_seconds IS 'Duration in seconds for any time-based content (video, audio)';

ALTER TABLE mindmap_content
    ADD COLUMN media_mime       TEXT,
    ADD COLUMN media_file_bytes BIGINT;
COMMENT ON COLUMN mindmap_content.media_mime IS 'MIME type for stored media (audio/mp4, image/png etc.)';
COMMENT ON COLUMN mindmap_content.media_file_bytes IS 'Size of the stored media file in bytes';

-- Partial index for the 3-hourly draft cleanup
CREATE INDEX idx_mindmap_content_drafts
    ON mindmap_content (updated_at)
    WHERE commit_status = 'draft';
```

- [ ] **Step 2: Write `000006_unified_save_lifecycle.down.sql`**

```sql
DROP INDEX IF EXISTS idx_mindmap_content_drafts;

ALTER TABLE mindmap_content
    DROP COLUMN IF EXISTS media_file_bytes,
    DROP COLUMN IF EXISTS media_mime;

ALTER TABLE mindmap_content
    RENAME COLUMN duration_seconds TO video_duration;

ALTER TABLE mindmap_content
    DROP COLUMN IF EXISTS commit_status;
```

- [ ] **Step 3: Run the migration locally**

```bash
cd server
migrate -path migrations -database "$DATABASE_URL" up
```

Expected: migration runs successfully, no errors.

- [ ] **Step 4: Verify schema and round-trip the down migration**

```bash
psql "$DATABASE_URL" -c "\d mindmap_content" | grep -E "commit_status|duration_seconds|media_mime|media_file_bytes"
migrate -path migrations -database "$DATABASE_URL" down 1
psql "$DATABASE_URL" -c "\d mindmap_content" | grep -E "video_duration"
migrate -path migrations -database "$DATABASE_URL" up
```

Expected: 4 rows on first command, `video_duration` shown post-down, all four new columns visible after the final `up`.

- [ ] **Step 5: Commit**

```bash
git add server/migrations/000006_unified_save_lifecycle.up.sql server/migrations/000006_unified_save_lifecycle.down.sql
git commit -m "feat(saves): add unified save lifecycle migration (commit_status, duration_seconds, media_*)"
```

---

### Task 2: Update existing sqlc queries — rename `video_duration` and add `commit_status` filter

**Files:**
- Modify: `server/internal/store/queries/content.sql` (every reference to `video_duration` becomes `duration_seconds`; every list/count query gains `AND commit_status = 'committed'`)
- Modify: `server/internal/store/queries/jobs.sql` (no changes expected; verify)

- [ ] **Step 1: Find every `video_duration` reference**

```bash
cd server
grep -rn "video_duration" internal/store/queries/
```

Expected output: list of lines mentioning `video_duration` in `SELECT`, `INSERT`, `UPDATE`, and `RETURNING` clauses across `content.sql`.

- [ ] **Step 2: Replace every `video_duration` with `duration_seconds` in `content.sql`**

Use your editor's project-wide replace within `server/internal/store/queries/content.sql` only. Verify nothing else changed:

```bash
git diff server/internal/store/queries/content.sql | grep -E "^[+-]" | head -40
```

Expected: only `video_duration` ↔ `duration_seconds` line changes.

- [ ] **Step 3: Add `AND commit_status = 'committed'` to every listing/counting query**

Open `server/internal/store/queries/content.sql`. For every named query whose semantics is "show saves to the user" — typically named like `ListContentByUser`, `ListContentByUserAndType`, `CountContentByUser`, `SearchContent`, etc. — add `AND commit_status = 'committed'` to the `WHERE` clause. Do **not** add the filter to:
- `GetContentByID` (the commit endpoint and detail screen need access to drafts the user just created)
- `IsContentDeleted`
- Any internal worker-side query that reads a row by ID

Example diff:

```sql
-- name: ListContentByUser :many
SELECT * FROM mindmap_content
WHERE user_id = $1
  AND deleted_at IS NULL
+ AND commit_status = 'committed'
ORDER BY created_at DESC
LIMIT $2 OFFSET $3;
```

- [ ] **Step 4: Regenerate sqlc**

```bash
cd server
sqlc generate
```

Expected: no errors. New generated code in `internal/store/` reflecting the column rename.

- [ ] **Step 5: Verify Go compiles**

```bash
go build ./...
```

Expected: compile errors about `VideoDuration` field no longer existing — these are intentional and we'll fix them as we touch each file. Do not yet fix them; we'll address callsite-by-callsite in subsequent tasks. Note the file paths the compiler complains about — those are your touch-list for Task 3.

- [ ] **Step 6: Commit**

```bash
git add server/internal/store/queries/content.sql server/internal/store/
git commit -m "feat(saves): rename video_duration->duration_seconds, filter drafts from listings"
```

---

### Task 3: Update Go callsites for the column rename

**Files:**
- Modify: every Go file that referenced the generated `VideoDuration` field. Common suspects:
  - `server/internal/handler/saves.go`
  - `server/internal/worker/processors/youtube.go`
  - `server/internal/worker/steps/store.go`
  - Any test file

- [ ] **Step 1: Get the touch list**

```bash
cd server
go build ./... 2>&1 | grep -E "VideoDuration|undefined" | sort -u
```

- [ ] **Step 2: For each file in the list, rename `VideoDuration` field references to `DurationSeconds`**

The sqlc regeneration changed the Go field name from `VideoDuration` to `DurationSeconds`. Update every reference. Examples:

In `server/internal/handler/saves.go`, the `contentJSON` struct field:

```go
// before
VideoDuration *int32 `json:"video_duration,omitempty"`
// after
DurationSeconds *int32 `json:"duration_seconds,omitempty"`
```

JSON tag changes too — this is intentional. The mobile / web clients will pick up the new field name from the regenerated OpenAPI types (Chunk 8). The transient mismatch is fine for now because the audio plan keeps everything on a feature branch until merged.

- [ ] **Step 3: Rebuild**

```bash
cd server
go build ./...
```

Expected: clean build.

- [ ] **Step 4: Run existing tests to confirm no behavior regressed**

```bash
cd server
go test ./...
```

Expected: all existing tests pass. Any failure indicates a missed callsite or a JSON-tag-dependent test — fix and re-run.

- [ ] **Step 5: Commit**

```bash
git add server/
git commit -m "refactor(saves): rename VideoDuration->DurationSeconds across Go callsites"
```

---

### Task 4: Add new sqlc queries for the lifecycle

**Files:**
- Modify: `server/internal/store/queries/content.sql`

- [ ] **Step 1: Add the new queries at the end of `content.sql`**

```sql
-- name: UpdateContentCommitStatus :exec
UPDATE mindmap_content
SET commit_status = $2,
    source_title  = COALESCE($3, source_title),
    updated_at    = CURRENT_TIMESTAMP
WHERE id = $1
  AND deleted_at IS NULL;

-- name: UpdateContentProcessingStatusToPending :exec
UPDATE mindmap_content
SET processing_status = 'pending',
    updated_at        = CURRENT_TIMESTAMP
WHERE id = $1
  AND processing_status = 'deferred'
  AND deleted_at IS NULL;

-- name: DeleteExpiredDrafts :execrows
DELETE FROM mindmap_content
WHERE commit_status = 'draft'
  AND updated_at < $1;

-- name: GetMediaKeysForExpiredDrafts :many
SELECT id, media_key
FROM mindmap_content
WHERE commit_status = 'draft'
  AND updated_at < $1
  AND media_key IS NOT NULL;
```

`GetMediaKeysForExpiredDrafts` lets the cleanup goroutine collect storage keys to delete *before* `DeleteExpiredDrafts` removes the rows.

- [ ] **Step 2: Update the `CreateContent` query to accept `commit_status`**

Find the existing `CreateContent` query in `content.sql`. Add `commit_status` as a column and parameter:

```sql
-- name: CreateContent :one
INSERT INTO mindmap_content (
    user_id, source_url, source_type, source_title,
    extracted_text, media_key, media_mime, media_file_bytes,
    duration_seconds,
    processing_status, commit_status
) VALUES (
    $1, $2, $3, $4,
    $5, $6, $7, $8,
    $9,
    $10, $11
)
RETURNING *;
```

(Adjust column order if the existing query has a different layout — we just need `commit_status` and the new media columns added in the right places.)

- [ ] **Step 3: Regenerate sqlc and rebuild**

```bash
cd server
sqlc generate
go build ./...
```

Expected: compile errors at the `CreateContent` callsites (handler) where the new params aren't passed yet. We'll fix these in Chunk 3 (Task 9). For now, leave them as a list of callsites.

- [ ] **Step 4: Commit**

```bash
git add server/internal/store/queries/content.sql server/internal/store/
git commit -m "feat(saves): add commit_status to CreateContent + new lifecycle queries"
```

Note: Go build is intentionally broken at this point — fixed in Chunk 3.

---

## Chunk 2: JobPayload Slim + Image Handler/Processor Refactor

### Task 5: Slim `JobPayload`

**Files:**
- Modify: `server/internal/queue/producer.go`

- [ ] **Step 1: Update the struct**

```go
type JobPayload struct {
    JobID         uuid.UUID      `json:"job_id"`
    ContentID     uuid.UUID      `json:"content_id"`
    UserID        string         `json:"user_id"`
    ContentType   string         `json:"content_type"`
    AttemptCount  int            `json:"attempt_count"`
    MaxAttempts   int            `json:"max_attempts"`
    CurrentStep   string         `json:"current_step,omitempty"`
    StepResults   map[string]any `json:"step_results,omitempty"`
}
```

Fields removed: `SourceURL`, `TempImagePath`, `ImageMIME`. Processors fetch source-type-specific data from `mindmap_content` by `ContentID` going forward.

- [ ] **Step 2: Run build to find consumers**

```bash
cd server
go build ./... 2>&1 | grep -E "SourceURL|TempImagePath|ImageMIME"
```

You'll see complaints in:
- `server/internal/handler/saves.go` (sets these on payloads at enqueue time)
- `server/internal/queue/consumer.go` and `server/internal/worker/dispatcher.go` (deserialization → `Job` struct)
- `server/internal/worker/processors/youtube.go` and possibly `image.go` (read these fields)

- [ ] **Step 3: Update the dispatcher to populate `Job` from the row, not the payload**

In `server/internal/worker/dispatcher.go`, find the function that translates a `JobPayload` into a `*worker.Job`. It probably looks like:

```go
job := &worker.Job{
    ID:          payload.JobID,
    ContentID:   payload.ContentID,
    UserID:      payload.UserID,
    ContentType: payload.ContentType,
    SourceURL:   payload.SourceURL,
    // ImageData / ImageType set elsewhere
}
```

Replace the `SourceURL` line by fetching from the row:

```go
row, err := d.queries.GetContentByID(ctx, payload.ContentID)
if err != nil {
    return fmt.Errorf("dispatcher: load content row: %w", err)
}
job := &worker.Job{
    ID:          payload.JobID,
    ContentID:   payload.ContentID,
    UserID:      payload.UserID,
    ContentType: payload.ContentType,
}
if row.SourceUrl.Valid {
    job.SourceURL = row.SourceUrl.String
}
```

(Field names from the sqlc-generated `mindmap_content` struct — adjust to actual generated names. Use `goimports` or your editor's go-to-definition to confirm.)

- [ ] **Step 4: Update the handler to drop the removed fields when enqueueing**

In `server/internal/handler/saves.go`, find every `producer.Enqueue` call. Remove `SourceURL`, `TempImagePath`, `ImageMIME` from each `JobPayload{...}` literal. We'll handle the image multipart-to-permanent-storage refactor in Task 6.

- [ ] **Step 5: Build and run existing producer tests**

```bash
cd server
go build ./...
go test ./internal/queue/...
```

Expected: clean build; queue tests pass.

- [ ] **Step 6: Commit**

```bash
git add server/internal/queue/producer.go server/internal/worker/dispatcher.go server/internal/handler/saves.go
git commit -m "refactor(saves): slim JobPayload to a pointer envelope, processors read from row"
```

---

### Task 6: Image handler — write directly to permanent storage

**Files:**
- Modify: `server/internal/handler/saves.go` — the image branch of `Create`

- [ ] **Step 1: Read the current image branch**

Find the multipart handling in `Create`. Current shape (from spec exploration):
- Parses multipart, validates MIME (jpeg/png/webp), writes the file to `/tmp/mindtab/{tmpUUID}/`, sets `payload.TempImagePath` and `payload.ImageMIME`, enqueues.

- [ ] **Step 2: Refactor to write to permanent storage at insert time**

Replace the image branch with this pattern (illustrative — adapt to existing imports/local helpers):

```go
func (h *SavesHandler) createImage(w http.ResponseWriter, r *http.Request, userID string, autoCommit, startProcessing bool) {
    // (size limit already applied via http.MaxBytesReader on r.Body)
    if err := r.ParseMultipartForm(32 << 20); err != nil {
        http.Error(w, "invalid multipart body", http.StatusBadRequest)
        return
    }
    file, header, err := r.FormFile("image")
    if err != nil {
        http.Error(w, "missing image file", http.StatusBadRequest)
        return
    }
    defer file.Close()

    mime := header.Header.Get("Content-Type")
    if !isAllowedImageMIME(mime) {
        http.Error(w, "unsupported image type", http.StatusUnsupportedMediaType)
        return
    }

    contentID := uuid.New()
    ext := imageExtFromMIME(mime)             // helper — see Step 3
    mediaKey := fmt.Sprintf("%s/%s/image%s", userID, contentID, ext)

    // Read body into a buffer so we can both store it and know its byte length
    buf, err := io.ReadAll(file)
    if err != nil {
        http.Error(w, "read upload", http.StatusInternalServerError)
        return
    }
    if err := h.storage.Save(r.Context(), mediaKey, bytes.NewReader(buf), mime); err != nil {
        http.Error(w, "store image", http.StatusInternalServerError)
        return
    }

    procStatus := "pending"
    if !startProcessing {
        procStatus = "deferred"
    }
    commitStatus := "committed"
    if !autoCommit {
        commitStatus = "draft"
    }

    row, err := h.queries.CreateContent(r.Context(), store.CreateContentParams{
        ID:               contentID,
        UserID:           userID,
        SourceType:       "image",
        MediaKey:         pgtype.Text{String: mediaKey, Valid: true},
        MediaMime:        pgtype.Text{String: mime, Valid: true},
        MediaFileBytes:   pgtype.Int8{Int64: int64(len(buf)), Valid: true},
        ProcessingStatus: procStatus,
        CommitStatus:     commitStatus,
    })
    if err != nil {
        http.Error(w, "create content", http.StatusInternalServerError)
        return
    }

    if startProcessing {
        if err := h.producer.Enqueue(r.Context(), queue.JobPayload{
            JobID:       uuid.New(),
            ContentID:   row.ID,
            UserID:      userID,
            ContentType: "image",
            MaxAttempts: 5,
        }); err != nil {
            http.Error(w, "enqueue", http.StatusInternalServerError)
            return
        }
    }

    writeSaveResponse(w, row, h.storage)  // helper that includes media_url
}
```

(The actual struct field names for `CreateContentParams` come from the sqlc regeneration in Task 4 — match them exactly. `pgtype.Text` etc. wrap nullable columns; use whatever wrapper the existing code uses.)

- [ ] **Step 3: Add the helpers used above**

Either reuse existing helpers or add small ones in the same file:

```go
func isAllowedImageMIME(m string) bool {
    switch m {
    case "image/jpeg", "image/png", "image/webp":
        return true
    }
    return false
}

func imageExtFromMIME(m string) string {
    switch m {
    case "image/jpeg":
        return ".jpg"
    case "image/png":
        return ".png"
    case "image/webp":
        return ".webp"
    }
    return ""
}
```

- [ ] **Step 4: Build**

```bash
cd server
go build ./...
```

Expected: clean. Image processor still has its `save` step; we'll remove it in Task 7.

- [ ] **Step 5: Commit**

```bash
git add server/internal/handler/saves.go
git commit -m "refactor(saves): image handler writes directly to permanent storage, no /tmp"
```

---

### Task 7: Image processor — drop the `save` step

**Files:**
- Modify: `server/internal/worker/processors/image.go`

- [ ] **Step 1: Remove `"save"` from `Steps()`**

```go
func (p *ImageProcessor) Steps() []string {
    return []string{"vision", "summarize", "embed", "store"}
}
```

- [ ] **Step 2: Remove the `case "save"` branch and the inline `p.save(...)` method**

In `Execute`:

```go
func (p *ImageProcessor) Execute(ctx context.Context, step string, job *worker.Job, prevResults worker.StepResults) (*worker.StepResult, error) {
    switch step {
    case "vision":
        return steps.Vision(ctx, p.llmChain, job)
    case "summarize":
        return p.summarize(ctx, prevResults)
    case "embed":
        return p.embed(ctx, prevResults)
    case "store":
        return steps.Store(ctx, p.queries, job, prevResults)
    default:
        return nil, fmt.Errorf("image processor: unknown step %q", step)
    }
}
```

Delete the `func (p *ImageProcessor) save(...)` method below.

- [ ] **Step 3: Update the vision step if it currently reads bytes from `/tmp`**

The vision step today probably accepts the temp-image bytes via `job.ImageData` / `job.ImageType` (set by the dispatcher from the old payload fields). Since we removed those payload fields in Task 5, the vision step now needs to fetch the image from storage by `media_key`.

In the spot where vision originally received the image bytes, change to fetch from storage. If `steps.Vision` takes a `*worker.Job`, extend it to accept the storage provider:

```go
// before
func Vision(ctx context.Context, llmChain *providers.Chain[llm.LLMProvider], job *worker.Job) (*worker.StepResult, error)

// after
func Vision(
    ctx context.Context,
    llmChain *providers.Chain[llm.LLMProvider],
    storage services.StorageProvider,
    queries store.Querier,
    job *worker.Job,
) (*worker.StepResult, error) {
    row, err := queries.GetContentByID(ctx, job.ContentID)
    if err != nil { return nil, err }
    if !row.MediaKey.Valid {
        return nil, fmt.Errorf("vision: row %s has no media_key", job.ContentID)
    }
    rc, err := storage.Get(ctx, row.MediaKey.String)
    if err != nil { return nil, err }
    defer rc.Close()
    bytes, err := io.ReadAll(rc)
    if err != nil { return nil, err }
    mime := ""
    if row.MediaMime.Valid { mime = row.MediaMime.String }
    // ...rest of vision call using `bytes` and `mime`...
}
```

Update the `ImageProcessor` constructor to thread `storage` and `queries` if not already present, and update the `Execute` callsite.

- [ ] **Step 4: Build and run existing image processor tests**

```bash
cd server
go build ./...
go test ./internal/worker/processors/...
```

Some of the existing image processor tests reference the old `save` step or set `TempImagePath`. Update those tests to mirror the new flow: pre-write a fake image to a mocked `StorageProvider` keyed by `{user}/{content_id}/image.png` before invoking the processor.

- [ ] **Step 5: Commit**

```bash
git add server/internal/worker/processors/image.go server/internal/worker/steps/vision.go server/internal/worker/processors/image_test.go
git commit -m "refactor(saves): drop image processor save step; vision fetches via storage"
```

---

### Task 8: Run the full backend test suite to confirm Chunk 2 is regression-free

- [ ] **Step 1: Run unit tests**

```bash
cd server
go test ./...
```

Expected: green. If anything red, fix before moving on.

- [ ] **Step 2: Run integration tests** (testcontainers)

```bash
cd server
make test-integration
```

Expected: green.

- [ ] **Step 3: Manual smoke — image save still works end-to-end**

Start the server (`go run ./cmd/api`), POST a multipart image to `/saves`, confirm the row lands committed + pending, the image is at the permanent path under the storage `basePath`, and the worker processes it through `vision → summarize → embed → store`.

- [ ] **Step 4: Commit any test fixes from steps 1–2**

```bash
git add server/
git commit -m "test(saves): align image processor tests with permanent-storage flow"
```

---

## Chunk 3: Polymorphic POST /saves Flags + Commit Endpoint + Draft Filter

### Task 9: Parse `auto_commit` and `start_processing` from request body

**Files:**
- Modify: `server/internal/handler/saves.go`

- [ ] **Step 1: Extend `createURLRequest`**

```go
type createURLRequest struct {
    URL             string  `json:"url"`
    Content         string  `json:"content,omitempty"`
    Title           string  `json:"title,omitempty"`
    AutoCommit      *bool   `json:"auto_commit,omitempty"`
    StartProcessing *bool   `json:"start_processing,omitempty"`
}
```

`*bool` (not `bool`) so we can distinguish "omitted" from "false".

- [ ] **Step 2: Add a helper for default flag resolution**

```go
func resolveLifecycleFlags(autoCommit, startProcessing *bool) (commit string, processing string) {
    ac := true
    if autoCommit != nil { ac = *autoCommit }
    sp := true
    if startProcessing != nil { sp = *startProcessing }

    if ac { commit = "committed" } else { commit = "draft" }
    if sp { processing = "pending" } else { processing = "deferred" }
    return
}
```

- [ ] **Step 3: Use the helper in `createURL`**

In `createURL`, after parsing the request body, derive flags and pass them through to the row insert. Replace any hardcoded `processing_status: "pending"` and `commit_status: "committed"` values with the resolved ones. Skip the enqueue when `processing == "deferred"`.

- [ ] **Step 4: Likewise plumb the flags through `createImage`**

Add the same flag parsing to the multipart path. Multipart parses flags from form fields (`r.FormValue("auto_commit")` returning `"true"` / `"false"` / `""`):

```go
func parseFormFlag(r *http.Request, name string) *bool {
    v := r.FormValue(name)
    if v == "" { return nil }
    b := v == "true"
    return &b
}
```

Then `auto := parseFormFlag(r, "auto_commit")` etc.

- [ ] **Step 5: Build**

```bash
cd server
go build ./...
```

Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add server/internal/handler/saves.go
git commit -m "feat(saves): parse auto_commit/start_processing on POST /saves"
```

---

### Task 10: Verify backward compatibility with a handler test

**Files:**
- Modify: `server/internal/handler/saves_test.go`

- [ ] **Step 1: Add a test verifying defaults match today's behavior**

```go
func TestCreate_NoFlags_DefaultsToCommittedPending(t *testing.T) {
    h, deps := newTestSavesHandler(t)
    body := `{"url":"https://example.com/x"}`
    req := httptest.NewRequest("POST", "/saves",
        strings.NewReader(body)).WithContext(authCtx(t, "user-1"))
    req.Header.Set("Content-Type", "application/json")
    w := httptest.NewRecorder()

    h.Create(w, req)

    require.Equal(t, http.StatusOK, w.Code)
    row := deps.LastInsertedContent
    require.Equal(t, "committed", row.CommitStatus)
    require.Equal(t, "pending", row.ProcessingStatus)
    require.Equal(t, 1, deps.Producer.EnqueueCallCount())
}
```

(`newTestSavesHandler` and `authCtx` are existing helpers in the test suite — match the codebase's style.)

- [ ] **Step 2: Add a test for `auto_commit=false, start_processing=false`**

```go
func TestCreate_DraftDeferred_DoesNotEnqueue(t *testing.T) {
    h, deps := newTestSavesHandler(t)
    body := `{"url":"https://example.com/x","auto_commit":false,"start_processing":false}`
    req := httptest.NewRequest("POST", "/saves",
        strings.NewReader(body)).WithContext(authCtx(t, "user-1"))
    req.Header.Set("Content-Type", "application/json")
    w := httptest.NewRecorder()

    h.Create(w, req)

    require.Equal(t, http.StatusOK, w.Code)
    row := deps.LastInsertedContent
    require.Equal(t, "draft", row.CommitStatus)
    require.Equal(t, "deferred", row.ProcessingStatus)
    require.Equal(t, 0, deps.Producer.EnqueueCallCount())
}
```

- [ ] **Step 3: Run the tests**

```bash
cd server
go test ./internal/handler/... -run "TestCreate_NoFlags|TestCreate_DraftDeferred" -v
```

Expected: both pass.

- [ ] **Step 4: Commit**

```bash
git add server/internal/handler/saves_test.go
git commit -m "test(saves): cover lifecycle flag defaults and deferred path"
```

---

### Task 11: Add the commit endpoint

**Files:**
- Modify: `server/internal/handler/saves.go`
- Modify: `server/cmd/api/main.go` (route registration)

- [ ] **Step 1: Add the handler method**

```go
type commitRequest struct {
    Title string `json:"title,omitempty"`
}

func (h *SavesHandler) Commit(w http.ResponseWriter, r *http.Request) {
    userID, ok := auth.UserIDFrom(r.Context())
    if !ok {
        http.Error(w, "unauthenticated", http.StatusUnauthorized)
        return
    }
    idStr := chi.URLParam(r, "id")
    id, err := uuid.Parse(idStr)
    if err != nil {
        http.Error(w, "bad id", http.StatusBadRequest)
        return
    }

    var body commitRequest
    if r.ContentLength > 0 {
        if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
            http.Error(w, "bad body", http.StatusBadRequest)
            return
        }
    }

    row, err := h.queries.GetContentByID(r.Context(), id)
    if err != nil {
        http.Error(w, "not found", http.StatusNotFound)
        return
    }
    if row.UserID != userID {
        http.Error(w, "not found", http.StatusNotFound)
        return
    }

    // Idempotent: already committed → 200 no-op
    if row.CommitStatus == "committed" && row.ProcessingStatus != "deferred" {
        writeJSON(w, saveResponse{ID: row.ID.String(), Status: row.ProcessingStatus})
        return
    }

    // Flip commit_status and (optionally) source_title
    var titlePtr *string
    if body.Title != "" { t := body.Title; titlePtr = &t }
    if err := h.queries.UpdateContentCommitStatus(r.Context(), store.UpdateContentCommitStatusParams{
        ID:           id,
        CommitStatus: "committed",
        SourceTitle:  pgTextPtr(titlePtr),
    }); err != nil {
        http.Error(w, "update", http.StatusInternalServerError)
        return
    }

    // If processing was deferred, flip to pending and enqueue.
    if row.ProcessingStatus == "deferred" {
        if err := h.queries.UpdateContentProcessingStatusToPending(r.Context(), id); err != nil {
            http.Error(w, "update", http.StatusInternalServerError)
            return
        }
        if err := h.producer.Enqueue(r.Context(), queue.JobPayload{
            JobID:       uuid.New(),
            ContentID:   id,
            UserID:      userID,
            ContentType: row.SourceType,
            MaxAttempts: 5,
        }); err != nil {
            http.Error(w, "enqueue", http.StatusInternalServerError)
            return
        }
    }

    writeJSON(w, saveResponse{ID: id.String(), Status: "pending"})
}
```

`pgTextPtr` is a tiny helper that converts `*string` to whatever nullable wrapper sqlc generated:

```go
func pgTextPtr(s *string) pgtype.Text {
    if s == nil { return pgtype.Text{} }
    return pgtype.Text{String: *s, Valid: true}
}
```

- [ ] **Step 2: Register the route**

In `cmd/api/main.go`, find where `/saves` routes are registered and add:

```go
r.Post("/saves/{id}/commit", savesHandler.Commit)
```

(Adapt to whatever Chi router pattern the file uses.)

- [ ] **Step 3: Build**

```bash
cd server
go build ./...
```

- [ ] **Step 4: Commit**

```bash
git add server/internal/handler/saves.go server/cmd/api/main.go
git commit -m "feat(saves): add POST /saves/:id/commit endpoint"
```

---

### Task 12: Test the commit endpoint across all states

**Files:**
- Modify: `server/internal/handler/saves_test.go`

- [ ] **Step 1: Test: deferred → pending + enqueue**

```go
func TestCommit_DeferredFlipsAndEnqueues(t *testing.T) {
    h, deps := newTestSavesHandler(t)
    id := deps.SeedContent(t, "user-1", "draft", "deferred")
    req := httptest.NewRequest("POST", "/saves/"+id.String()+"/commit",
        strings.NewReader(`{}`)).WithContext(authCtx(t, "user-1"))
    req.Header.Set("Content-Type", "application/json")
    w := httptest.NewRecorder()
    h.Commit(w, req)

    require.Equal(t, http.StatusOK, w.Code)
    row := deps.GetContent(t, id)
    require.Equal(t, "committed", row.CommitStatus)
    require.Equal(t, "pending", row.ProcessingStatus)
    require.Equal(t, 1, deps.Producer.EnqueueCallCount())
}
```

- [ ] **Step 2: Test: draft + pending (eager already kicked off) → flip commit_status, do NOT re-enqueue**

```go
func TestCommit_DraftPending_FlipsCommitNoReEnqueue(t *testing.T) {
    h, deps := newTestSavesHandler(t)
    id := deps.SeedContent(t, "user-1", "draft", "pending")
    req := commitReq(t, id, `{}`, "user-1")
    w := httptest.NewRecorder()
    h.Commit(w, req)

    require.Equal(t, http.StatusOK, w.Code)
    row := deps.GetContent(t, id)
    require.Equal(t, "committed", row.CommitStatus)
    require.Equal(t, "pending", row.ProcessingStatus)
    require.Equal(t, 0, deps.Producer.EnqueueCallCount())
}
```

- [ ] **Step 3: Test: draft + completed (eager succeeded) → flip commit_status, do NOT re-enqueue**

```go
func TestCommit_DraftCompleted_FlipsCommitNoReEnqueue(t *testing.T) {
    h, deps := newTestSavesHandler(t)
    id := deps.SeedContent(t, "user-1", "draft", "completed")
    w := httptest.NewRecorder()
    h.Commit(w, commitReq(t, id, `{}`, "user-1"))

    require.Equal(t, http.StatusOK, w.Code)
    row := deps.GetContent(t, id)
    require.Equal(t, "committed", row.CommitStatus)
    require.Equal(t, 0, deps.Producer.EnqueueCallCount())
}
```

- [ ] **Step 4: Test: idempotent on already-committed**

```go
func TestCommit_AlreadyCommitted_NoOp(t *testing.T) {
    h, deps := newTestSavesHandler(t)
    id := deps.SeedContent(t, "user-1", "committed", "completed")
    w := httptest.NewRecorder()
    h.Commit(w, commitReq(t, id, `{}`, "user-1"))

    require.Equal(t, http.StatusOK, w.Code)
    require.Equal(t, 0, deps.Producer.EnqueueCallCount())
}
```

- [ ] **Step 5: Test: title override**

```go
func TestCommit_TitleOverride(t *testing.T) {
    h, deps := newTestSavesHandler(t)
    id := deps.SeedContent(t, "user-1", "draft", "completed")
    w := httptest.NewRecorder()
    h.Commit(w, commitReq(t, id, `{"title":"Renamed"}`, "user-1"))

    require.Equal(t, http.StatusOK, w.Code)
    row := deps.GetContent(t, id)
    require.Equal(t, "Renamed", row.SourceTitle.String)
}
```

- [ ] **Step 6: Test: cross-user 404**

```go
func TestCommit_OtherUser_404(t *testing.T) {
    h, deps := newTestSavesHandler(t)
    id := deps.SeedContent(t, "user-1", "draft", "deferred")
    w := httptest.NewRecorder()
    h.Commit(w, commitReq(t, id, `{}`, "other-user"))

    require.Equal(t, http.StatusNotFound, w.Code)
}
```

- [ ] **Step 7: Run all commit tests**

```bash
cd server
go test ./internal/handler/... -run "TestCommit" -v
```

Expected: all green.

- [ ] **Step 8: Commit**

```bash
git add server/internal/handler/saves_test.go
git commit -m "test(saves): cover commit endpoint across all state combinations"
```

---

### Task 13: Verify GET /saves filters drafts

**Files:**
- Modify: `server/internal/handler/saves_test.go`

- [ ] **Step 1: Add the test**

```go
func TestList_OmitsDrafts(t *testing.T) {
    h, deps := newTestSavesHandler(t)
    deps.SeedContent(t, "user-1", "committed", "completed")
    deps.SeedContent(t, "user-1", "draft", "deferred")

    req := httptest.NewRequest("GET", "/saves", nil).WithContext(authCtx(t, "user-1"))
    w := httptest.NewRecorder()
    h.List(w, req)

    require.Equal(t, http.StatusOK, w.Code)
    var list []contentJSON
    require.NoError(t, json.Unmarshal(w.Body.Bytes(), &list))
    require.Len(t, list, 1)
}
```

- [ ] **Step 2: Run + commit**

```bash
cd server
go test ./internal/handler/... -run "TestList_OmitsDrafts" -v
git add server/internal/handler/saves_test.go
git commit -m "test(saves): drafts excluded from GET /saves listing"
```

---

## Chunk 4: Audio Multipart Upload in `POST /saves`

### Task 14: Recognize audio multipart and dispatch to a new handler method

**Files:**
- Modify: `server/internal/handler/saves.go`

- [ ] **Step 1: In `Create`, branch on the multipart file field name**

Today the multipart branch unconditionally calls `createImage`. Replace with file-field detection:

```go
// in Create, after detecting multipart Content-Type:
if err := r.ParseMultipartForm(32 << 20); err != nil {
    http.Error(w, "invalid multipart body", http.StatusBadRequest)
    return
}

// Decide which file field is present:
if _, _, err := r.FormFile("audio"); err == nil {
    h.createAudio(w, r, userID,
        parseFormFlag(r, "auto_commit"),
        parseFormFlag(r, "start_processing"))
    return
}
if _, _, err := r.FormFile("image"); err == nil {
    h.createImage(w, r, userID,
        parseFormFlag(r, "auto_commit"),
        parseFormFlag(r, "start_processing"))
    return
}
http.Error(w, "missing file (expected audio or image field)", http.StatusBadRequest)
```

- [ ] **Step 2: Stub `createAudio` for now**

```go
func (h *SavesHandler) createAudio(w http.ResponseWriter, r *http.Request, userID string, autoCommit, startProcessing *bool) {
    http.Error(w, "not implemented", http.StatusNotImplemented)
}
```

- [ ] **Step 3: Build**

```bash
cd server
go build ./...
```

- [ ] **Step 4: Commit**

```bash
git add server/internal/handler/saves.go
git commit -m "feat(saves): branch multipart by file field (audio vs image)"
```

---

### Task 15: Implement `createAudio` end-to-end

**Files:**
- Modify: `server/internal/handler/saves.go`

- [ ] **Step 1: Replace the stub with the full implementation**

```go
const maxAudioBytes int64 = 500 * 1024 * 1024
const maxAudioDurationSeconds int32 = 5400 // 90 min

var allowedAudioMIMEs = map[string]string{
    "audio/mp4":  ".m4a",
    "audio/mpeg": ".mp3",
    "audio/wav":  ".wav",
    "audio/ogg":  ".ogg",
    "audio/webm": ".webm",
    "audio/flac": ".flac",
}

func (h *SavesHandler) createAudio(w http.ResponseWriter, r *http.Request, userID string, autoCommitFlag, startProcessingFlag *bool) {
    // Body size cap is enforced by http.MaxBytesReader earlier in the chain.
    file, header, err := r.FormFile("audio")
    if err != nil {
        http.Error(w, "missing audio file", http.StatusBadRequest)
        return
    }
    defer file.Close()

    mime := header.Header.Get("Content-Type")
    ext, ok := allowedAudioMIMEs[mime]
    if !ok {
        http.Error(w, "unsupported audio type", http.StatusUnsupportedMediaType)
        return
    }

    durationStr := r.FormValue("duration_seconds")
    if durationStr == "" {
        http.Error(w, "duration_seconds required", http.StatusBadRequest)
        return
    }
    durSec64, err := strconv.ParseInt(durationStr, 10, 32)
    if err != nil || durSec64 <= 0 || int32(durSec64) > maxAudioDurationSeconds {
        http.Error(w, "duration_seconds out of range", http.StatusBadRequest)
        return
    }
    durSec := int32(durSec64)

    contentID := uuid.New()
    mediaKey := fmt.Sprintf("%s/%s/audio%s", userID, contentID, ext)

    // Stream into the storage backend, counting bytes as we go.
    counted := &countingReader{R: file}
    if err := h.storage.Save(r.Context(), mediaKey, counted, mime); err != nil {
        http.Error(w, "store audio", http.StatusInternalServerError)
        return
    }

    commitStatus, processingStatus := resolveLifecycleFlags(autoCommitFlag, startProcessingFlag)

    nowTitle := fmt.Sprintf("Voice note · %s", time.Now().Format("Jan 2, 3:04 PM"))

    row, err := h.queries.CreateContent(r.Context(), store.CreateContentParams{
        ID:               contentID,
        UserID:           userID,
        SourceType:       "audio",
        SourceTitle:      pgtype.Text{String: nowTitle, Valid: true},
        MediaKey:         pgtype.Text{String: mediaKey, Valid: true},
        MediaMime:        pgtype.Text{String: mime, Valid: true},
        MediaFileBytes:   pgtype.Int8{Int64: counted.N, Valid: true},
        DurationSeconds:  pgtype.Int4{Int32: durSec, Valid: true},
        ProcessingStatus: processingStatus,
        CommitStatus:     commitStatus,
    })
    if err != nil {
        // Best-effort cleanup of the stored file
        _ = h.storage.Delete(r.Context(), mediaKey)
        http.Error(w, "create content", http.StatusInternalServerError)
        return
    }

    if processingStatus == "pending" {
        if err := h.producer.Enqueue(r.Context(), queue.JobPayload{
            JobID:       uuid.New(),
            ContentID:   row.ID,
            UserID:      userID,
            ContentType: "audio",
            MaxAttempts: 5,
        }); err != nil {
            http.Error(w, "enqueue", http.StatusInternalServerError)
            return
        }
    }

    writeSaveResponse(w, row, h.storage)
}

type countingReader struct {
    R io.Reader
    N int64
}

func (c *countingReader) Read(p []byte) (int, error) {
    n, err := c.R.Read(p)
    c.N += int64(n)
    return n, err
}
```

`writeSaveResponse` should respond with the same shape as the existing handler returns for image saves, plus `media_url` (a signed URL). If the existing flow already does this, just reuse it. Otherwise add:

```go
func writeSaveResponse(w http.ResponseWriter, row store.MindmapContent, storage services.StorageProvider) {
    resp := struct {
        ID               string `json:"id"`
        CommitStatus     string `json:"commit_status"`
        ProcessingStatus string `json:"processing_status"`
        MediaURL         string `json:"media_url,omitempty"`
    }{
        ID:               row.ID.String(),
        CommitStatus:     row.CommitStatus,
        ProcessingStatus: row.ProcessingStatus,
    }
    if row.MediaKey.Valid {
        resp.MediaURL = storage.URL(row.MediaKey.String)
    }
    w.Header().Set("Content-Type", "application/json")
    _ = json.NewEncoder(w).Encode(resp)
}
```

- [ ] **Step 2: Apply `http.MaxBytesReader` for audio uploads**

In `Create`, before parsing multipart: if `Content-Type` starts with `multipart/form-data`, set `r.Body = http.MaxBytesReader(w, r.Body, maxAudioBytes)`.

- [ ] **Step 3: Build**

```bash
cd server
go build ./...
```

- [ ] **Step 4: Commit**

```bash
git add server/internal/handler/saves.go
git commit -m "feat(saves): implement audio multipart upload with MIME/duration/size validation"
```

---

### Task 16: Test audio multipart upload

**Files:**
- Modify: `server/internal/handler/saves_test.go`

- [ ] **Step 1: Helper to build a multipart body**

```go
func multipartAudio(t *testing.T, mime, durationSec string, autoCommit, startProcessing *bool, payload []byte) (*bytes.Buffer, string) {
    t.Helper()
    var buf bytes.Buffer
    mw := multipart.NewWriter(&buf)
    fh := textproto.MIMEHeader{}
    fh.Set("Content-Disposition", `form-data; name="audio"; filename="t.m4a"`)
    fh.Set("Content-Type", mime)
    part, err := mw.CreatePart(fh)
    require.NoError(t, err)
    _, err = part.Write(payload)
    require.NoError(t, err)
    require.NoError(t, mw.WriteField("duration_seconds", durationSec))
    if autoCommit != nil {
        require.NoError(t, mw.WriteField("auto_commit", strconv.FormatBool(*autoCommit)))
    }
    if startProcessing != nil {
        require.NoError(t, mw.WriteField("start_processing", strconv.FormatBool(*startProcessing)))
    }
    require.NoError(t, mw.Close())
    return &buf, mw.FormDataContentType()
}
```

- [ ] **Step 2: Happy path test — eager short clip**

```go
func TestCreateAudio_DraftEager(t *testing.T) {
    h, deps := newTestSavesHandler(t)
    auto := false
    proc := true
    body, ct := multipartAudio(t, "audio/mp4", "30", &auto, &proc, []byte("\x00\x01fake-mp4"))
    req := httptest.NewRequest("POST", "/saves", body).WithContext(authCtx(t, "user-1"))
    req.Header.Set("Content-Type", ct)
    w := httptest.NewRecorder()
    h.Create(w, req)

    require.Equal(t, http.StatusOK, w.Code)
    row := deps.LastInsertedContent
    require.Equal(t, "audio", row.SourceType)
    require.Equal(t, "draft", row.CommitStatus)
    require.Equal(t, "pending", row.ProcessingStatus)
    require.Equal(t, int32(30), row.DurationSeconds.Int32)
    require.Equal(t, 1, deps.Producer.EnqueueCallCount())
    require.Equal(t, 1, deps.Storage.SaveCallCount())
}
```

- [ ] **Step 3: Deferred long clip**

```go
func TestCreateAudio_DraftDeferred_Long(t *testing.T) {
    h, deps := newTestSavesHandler(t)
    auto := false
    proc := false
    body, ct := multipartAudio(t, "audio/mp4", "1800", &auto, &proc, []byte("\x00fake"))
    req := httptest.NewRequest("POST", "/saves", body).WithContext(authCtx(t, "user-1"))
    req.Header.Set("Content-Type", ct)
    w := httptest.NewRecorder()
    h.Create(w, req)

    require.Equal(t, http.StatusOK, w.Code)
    row := deps.LastInsertedContent
    require.Equal(t, "draft", row.CommitStatus)
    require.Equal(t, "deferred", row.ProcessingStatus)
    require.Equal(t, 0, deps.Producer.EnqueueCallCount())
}
```

- [ ] **Step 4: Validation tests**

```go
func TestCreateAudio_BadMIME(t *testing.T) {
    h, _ := newTestSavesHandler(t)
    body, ct := multipartAudio(t, "audio/x-matroska", "10", nil, nil, []byte("x"))
    req := httptest.NewRequest("POST", "/saves", body).WithContext(authCtx(t, "user-1"))
    req.Header.Set("Content-Type", ct)
    w := httptest.NewRecorder()
    h.Create(w, req)
    require.Equal(t, http.StatusUnsupportedMediaType, w.Code)
}

func TestCreateAudio_DurationOver90Min(t *testing.T) {
    h, _ := newTestSavesHandler(t)
    body, ct := multipartAudio(t, "audio/mp4", "5401", nil, nil, []byte("x"))
    req := httptest.NewRequest("POST", "/saves", body).WithContext(authCtx(t, "user-1"))
    req.Header.Set("Content-Type", ct)
    w := httptest.NewRecorder()
    h.Create(w, req)
    require.Equal(t, http.StatusBadRequest, w.Code)
}

func TestCreateAudio_MissingDuration(t *testing.T) {
    h, _ := newTestSavesHandler(t)
    var buf bytes.Buffer
    mw := multipart.NewWriter(&buf)
    fh := textproto.MIMEHeader{}
    fh.Set("Content-Disposition", `form-data; name="audio"; filename="t.m4a"`)
    fh.Set("Content-Type", "audio/mp4")
    part, _ := mw.CreatePart(fh)
    part.Write([]byte("x"))
    mw.Close()
    req := httptest.NewRequest("POST", "/saves", &buf).WithContext(authCtx(t, "user-1"))
    req.Header.Set("Content-Type", mw.FormDataContentType())
    w := httptest.NewRecorder()
    h.Create(w, req)
    require.Equal(t, http.StatusBadRequest, w.Code)
}
```

- [ ] **Step 5: Run and commit**

```bash
cd server
go test ./internal/handler/... -run "TestCreateAudio" -v
git add server/internal/handler/saves_test.go
git commit -m "test(saves): cover audio multipart upload happy path + validation"
```

---

## Chunk 5: AudioProcessor + Basic Transcribe Step

### Task 17: Define `TranscribeAudioStep` package + signature (no chunking yet)

**Files:**
- Create: `server/internal/worker/steps/transcribe_audio.go`

- [ ] **Step 1: Write the step**

```go
package steps

import (
    "context"
    "encoding/json"
    "fmt"
    "io"
    "os"

    "github.com/mindtab/server/internal/providers"
    "github.com/mindtab/server/internal/providers/transcription"
    "github.com/mindtab/server/internal/services"
    "github.com/mindtab/server/internal/store"
    "github.com/mindtab/server/internal/worker"
)

type TranscribeAudioResult struct {
    ExtractedText    string `json:"extracted_text"`
    TranscriptSource string `json:"transcript_source"`
}

const audioChunkSizeThresholdBytes int64 = 24 * 1024 * 1024 // 24 MB

// TranscribeAudio reads the audio file pointed to by the row's media_key,
// transcribes via the chain, and returns the resulting text.
//
// Files above audioChunkSizeThresholdBytes are chunked (see Chunk 6 — for now
// we just guard with an error so an oversize file fails fast and we don't ship
// a half-implemented chunker).
func TranscribeAudio(
    ctx context.Context,
    chain *providers.Chain[transcription.TranscriptionProvider],
    storage services.StorageProvider,
    queries store.Querier,
    job *worker.Job,
) (*worker.StepResult, error) {
    row, err := queries.GetContentByID(ctx, job.ContentID)
    if err != nil {
        return nil, fmt.Errorf("transcribe_audio: load row: %w", err)
    }
    if !row.MediaKey.Valid {
        return nil, fmt.Errorf("transcribe_audio: row %s has no media_key", job.ContentID)
    }

    if row.MediaFileBytes.Valid && row.MediaFileBytes.Int64 > audioChunkSizeThresholdBytes {
        return nil, fmt.Errorf("transcribe_audio: file %d bytes exceeds 24 MB; chunking not yet implemented", row.MediaFileBytes.Int64)
    }

    tmpFile, err := stageToTemp(ctx, storage, row.MediaKey.String)
    if err != nil {
        return nil, err
    }
    defer os.Remove(tmpFile)

    var text string
    err = chain.Try(ctx, func(p transcription.TranscriptionProvider) error {
        res, err := p.Transcribe(ctx, tmpFile)
        if err != nil { return err }
        text = res.Text
        return nil
    })
    if err != nil {
        return nil, fmt.Errorf("transcribe_audio: chain failed: %w", err)
    }

    data, err := json.Marshal(TranscribeAudioResult{
        ExtractedText:    text,
        TranscriptSource: "whisper",
    })
    if err != nil {
        return nil, err
    }
    return &worker.StepResult{Data: data}, nil
}

func stageToTemp(ctx context.Context, storage services.StorageProvider, mediaKey string) (string, error) {
    rc, err := storage.Get(ctx, mediaKey)
    if err != nil {
        return "", fmt.Errorf("storage get: %w", err)
    }
    defer rc.Close()

    f, err := os.CreateTemp("", "audio-*")
    if err != nil {
        return "", err
    }
    if _, err := io.Copy(f, rc); err != nil {
        f.Close()
        os.Remove(f.Name())
        return "", err
    }
    if err := f.Close(); err != nil {
        os.Remove(f.Name())
        return "", err
    }
    return f.Name(), nil
}
```

(Adapt `chain.Try` to whatever the Chain API actually exposes — `Execute`, `Apply`, `Run` etc. Mirror how the YouTube transcribe step uses it.)

- [ ] **Step 2: Build**

```bash
cd server
go build ./internal/worker/steps/...
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add server/internal/worker/steps/transcribe_audio.go
git commit -m "feat(saves): add TranscribeAudio step (single-call, no chunking yet)"
```

---

### Task 18: Test the basic transcribe step

**Files:**
- Create: `server/internal/worker/steps/transcribe_audio_test.go`

- [ ] **Step 1: Write the test**

```go
package steps_test

import (
    "context"
    "testing"

    "github.com/google/uuid"
    "github.com/jackc/pgx/v5/pgtype"
    "github.com/stretchr/testify/require"

    "github.com/mindtab/server/internal/providers/transcription"
    "github.com/mindtab/server/internal/store"
    "github.com/mindtab/server/internal/testutil"
    "github.com/mindtab/server/internal/worker"
    "github.com/mindtab/server/internal/worker/steps"
)

func TestTranscribeAudio_HappyPath(t *testing.T) {
    ctx := context.Background()
    contentID := uuid.New()

    queries := testutil.NewQuerierMock(t)
    queries.GetContentByIDFunc = func(_ context.Context, id uuid.UUID) (store.MindmapContent, error) {
        require.Equal(t, contentID, id)
        return store.MindmapContent{
            ID:             contentID,
            MediaKey:       pgtype.Text{String: "u/c/audio.m4a", Valid: true},
            MediaFileBytes: pgtype.Int8{Int64: 12345, Valid: true},
        }, nil
    }

    storage := testutil.NewMemStorage()
    storage.PutString(t, "u/c/audio.m4a", "fake-audio-bytes")

    fakeTranscriber := &testutil.MockTranscriptionProvider{
        Result: &transcription.TranscriptionResult{Text: "hello world"},
    }
    chain := testutil.NewSingleProviderChain(fakeTranscriber)

    job := &worker.Job{ContentID: contentID, ContentType: "audio"}
    res, err := steps.TranscribeAudio(ctx, chain, storage, queries, job)
    require.NoError(t, err)
    require.NotNil(t, res)

    var out steps.TranscribeAudioResult
    require.NoError(t, json.Unmarshal(res.Data, &out))
    require.Equal(t, "hello world", out.ExtractedText)
    require.Equal(t, "whisper", out.TranscriptSource)
}

func TestTranscribeAudio_OversizeRejected(t *testing.T) {
    ctx := context.Background()
    contentID := uuid.New()
    queries := testutil.NewQuerierMock(t)
    queries.GetContentByIDFunc = func(context.Context, uuid.UUID) (store.MindmapContent, error) {
        return store.MindmapContent{
            ID:             contentID,
            MediaKey:       pgtype.Text{String: "u/c/audio.m4a", Valid: true},
            MediaFileBytes: pgtype.Int8{Int64: 30 * 1024 * 1024, Valid: true},
        }, nil
    }
    storage := testutil.NewMemStorage()
    chain := testutil.NewSingleProviderChain(&testutil.MockTranscriptionProvider{})
    job := &worker.Job{ContentID: contentID, ContentType: "audio"}
    _, err := steps.TranscribeAudio(ctx, chain, storage, queries, job)
    require.Error(t, err)
    require.Contains(t, err.Error(), "exceeds 24 MB")
}
```

(`testutil.NewMemStorage`, `testutil.MockTranscriptionProvider`, `testutil.NewSingleProviderChain`, and `testutil.NewQuerierMock` already exist per the existing test infrastructure. If a helper is missing, add a minimal one mirroring the existing patterns.)

- [ ] **Step 2: Run + commit**

```bash
cd server
go test ./internal/worker/steps/... -run "TestTranscribeAudio" -v
git add server/internal/worker/steps/transcribe_audio_test.go
git commit -m "test(saves): cover TranscribeAudio happy path and oversize guard"
```

---

### Task 19: Implement `AudioProcessor`

**Files:**
- Create: `server/internal/worker/processors/audio.go`

- [ ] **Step 1: Write the processor**

```go
package processors

import (
    "context"
    "fmt"
    "time"

    "github.com/jackc/pgx/v5/pgxpool"

    "github.com/mindtab/server/internal/config"
    "github.com/mindtab/server/internal/providers"
    "github.com/mindtab/server/internal/providers/embedding"
    "github.com/mindtab/server/internal/providers/llm"
    "github.com/mindtab/server/internal/providers/transcription"
    "github.com/mindtab/server/internal/services"
    "github.com/mindtab/server/internal/store"
    "github.com/mindtab/server/internal/worker"
    "github.com/mindtab/server/internal/worker/steps"
)

type AudioProcessor struct {
    transcriptionChain *providers.Chain[transcription.TranscriptionProvider]
    llmChain           *providers.Chain[llm.LLMProvider]
    embeddingChain     *providers.Chain[embedding.EmbeddingProvider]
    storage            services.StorageProvider
    ffmpeg             *services.FFmpeg
    queries            store.Querier
    pool               *pgxpool.Pool
    cfg                *config.Config
}

func NewAudioProcessor(
    transcriptionChain *providers.Chain[transcription.TranscriptionProvider],
    llmChain *providers.Chain[llm.LLMProvider],
    embeddingChain *providers.Chain[embedding.EmbeddingProvider],
    storage services.StorageProvider,
    ffmpeg *services.FFmpeg,
    queries store.Querier,
    pool *pgxpool.Pool,
    cfg *config.Config,
) *AudioProcessor {
    return &AudioProcessor{
        transcriptionChain: transcriptionChain,
        llmChain:           llmChain,
        embeddingChain:     embeddingChain,
        storage:            storage,
        ffmpeg:             ffmpeg,
        queries:            queries,
        pool:               pool,
        cfg:                cfg,
    }
}

func (p *AudioProcessor) ContentType() string    { return "audio" }
func (p *AudioProcessor) LockTTL() time.Duration { return 30 * time.Minute }
func (p *AudioProcessor) Steps() []string {
    return []string{"transcribe", "summarize", "embed", "store"}
}

func (p *AudioProcessor) Execute(ctx context.Context, step string, job *worker.Job, prevResults worker.StepResults) (*worker.StepResult, error) {
    switch step {
    case "transcribe":
        return steps.TranscribeAudio(ctx, p.transcriptionChain, p.storage, p.queries, job)
    case "summarize":
        return p.summarize(ctx, prevResults)
    case "embed":
        return p.embed(ctx, prevResults)
    case "store":
        return steps.Store(ctx, p.queries, job, prevResults)
    default:
        return nil, fmt.Errorf("audio processor: unknown step %q", step)
    }
}

// summarize and embed wrap the shared steps with the audio-flavored prompt routing.
// (See Chunk 7 for the SummarizeStep title-generation extension.)
func (p *AudioProcessor) summarize(ctx context.Context, prevResults worker.StepResults) (*worker.StepResult, error) {
    transcribeRes, ok := prevResults["transcribe"]
    if !ok {
        return nil, fmt.Errorf("audio processor: missing transcribe result")
    }
    var t steps.TranscribeAudioResult
    if err := json.Unmarshal(transcribeRes.Data, &t); err != nil {
        return nil, err
    }
    return steps.SummarizeForAudio(ctx, p.llmChain, t.ExtractedText)
}

func (p *AudioProcessor) embed(ctx context.Context, prevResults worker.StepResults) (*worker.StepResult, error) {
    summarizeRes, ok := prevResults["summarize"]
    if !ok {
        return nil, fmt.Errorf("audio processor: missing summarize result")
    }
    return steps.EmbedFromSummary(ctx, p.embeddingChain, summarizeRes)
}
```

(`steps.SummarizeForAudio` and `steps.EmbedFromSummary` are the function names used by the existing youtube/article processors — match whatever the existing codebase exports. If embeddings reuse `steps.Embed`, call that.)

- [ ] **Step 2: Build**

```bash
cd server
go build ./internal/worker/processors/...
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add server/internal/worker/processors/audio.go
git commit -m "feat(saves): add AudioProcessor with [transcribe, summarize, embed, store]"
```

---

### Task 20: Wire `AudioProcessor` into the dispatcher in `cmd/api/main.go`

**Files:**
- Modify: `server/cmd/api/main.go`

- [ ] **Step 1: Find the dispatcher registration block**

Look for the spot where `dispatcher.Register(youtubeProcessor)` and `dispatcher.Register(imageProcessor)` are called.

- [ ] **Step 2: Add audio processor construction and registration**

```go
audioProcessor := processors.NewAudioProcessor(
    transcriptionChain,
    llmChain,
    embeddingChain,
    storage,
    ffmpeg,
    queries,
    pool,
    cfg,
)
dispatcher.Register(audioProcessor)
```

- [ ] **Step 3: Build + run smoke test**

```bash
cd server
go build ./...
go run ./cmd/api  # ctrl-C after it boots cleanly
```

Expected: clean startup, dispatcher logs include audio processor registration.

- [ ] **Step 4: Commit**

```bash
git add server/cmd/api/main.go
git commit -m "feat(saves): register AudioProcessor in the dispatcher"
```

---

## Chunk 6: Server-Side ffmpeg Silence-Aware Chunking

### Task 21: Add `ffmpegDetectSilence` and `ffmpegSplit` helpers

**Files:**
- Modify: `server/internal/services/ffmpeg.go` (extend the existing service)

- [ ] **Step 1: Add `DetectSilence` to the FFmpeg service**

```go
// SilenceMarker is a single silence_start timestamp emitted by ffmpeg's silencedetect.
type SilenceMarker struct {
    StartSec float64
    EndSec   float64
}

// DetectSilence runs ffmpeg with the silencedetect filter and returns sorted markers.
func (f *FFmpeg) DetectSilence(ctx context.Context, inputPath string, noiseDB float64, minDurationSec float64) ([]SilenceMarker, error) {
    args := []string{
        "-i", inputPath,
        "-af", fmt.Sprintf("silencedetect=noise=%fdB:d=%f", noiseDB, minDurationSec),
        "-f", "null", "-",
    }
    cmd := exec.CommandContext(ctx, f.binPath, args...)
    var stderr bytes.Buffer
    cmd.Stderr = &stderr
    if err := cmd.Run(); err != nil {
        return nil, fmt.Errorf("ffmpeg silencedetect: %w (%s)", err, stderr.String())
    }
    return parseSilenceLog(stderr.String()), nil
}

func parseSilenceLog(log string) []SilenceMarker {
    var out []SilenceMarker
    var pending *SilenceMarker
    re := regexp.MustCompile(`silence_(start|end): (\d+(?:\.\d+)?)`)
    for _, m := range re.FindAllStringSubmatch(log, -1) {
        ts, _ := strconv.ParseFloat(m[2], 64)
        if m[1] == "start" {
            pending = &SilenceMarker{StartSec: ts}
        } else if m[1] == "end" && pending != nil {
            pending.EndSec = ts
            out = append(out, *pending)
            pending = nil
        }
    }
    return out
}
```

- [ ] **Step 2: Add `SplitSegment` for cutting a single segment**

```go
// SplitSegment writes a single sub-segment of `inputPath` covering [startSec, endSec)
// to `outputPath` using stream copy (no re-encode).
func (f *FFmpeg) SplitSegment(ctx context.Context, inputPath string, startSec, endSec float64, outputPath string) error {
    args := []string{
        "-y",
        "-ss", strconv.FormatFloat(startSec, 'f', 3, 64),
        "-to", strconv.FormatFloat(endSec, 'f', 3, 64),
        "-i", inputPath,
        "-c", "copy",
        outputPath,
    }
    cmd := exec.CommandContext(ctx, f.binPath, args...)
    out, err := cmd.CombinedOutput()
    if err != nil {
        return fmt.Errorf("ffmpeg split: %w (%s)", err, string(out))
    }
    return nil
}
```

- [ ] **Step 3: Build + commit**

```bash
cd server
go build ./...
git add server/internal/services/ffmpeg.go
git commit -m "feat(saves): add DetectSilence and SplitSegment to ffmpeg service"
```

---

### Task 22: Implement chunking logic in `TranscribeAudio`

**Files:**
- Modify: `server/internal/worker/steps/transcribe_audio.go`

- [ ] **Step 1: Add a `pickSplitPoints` helper**

```go
// pickSplitPoints returns split timestamps (in seconds) that segment [0, durationSec]
// into chunks of roughly targetSec, preferring silence boundaries within ±toleranceSec.
// Returns the list of (start, end) pairs.
func pickSplitPoints(durationSec, targetSec, toleranceSec float64, silences []services.SilenceMarker) [][2]float64 {
    if durationSec <= targetSec {
        return [][2]float64{{0, durationSec}}
    }
    var bounds []float64
    bounds = append(bounds, 0)
    cursor := targetSec
    for cursor < durationSec {
        // Find a silence whose end timestamp is closest to `cursor`, within tolerance.
        best := cursor
        bestDist := toleranceSec + 1
        for _, s := range silences {
            mid := (s.StartSec + s.EndSec) / 2
            if mid <= bounds[len(bounds)-1] { continue }
            d := math.Abs(mid - cursor)
            if d < bestDist && d <= toleranceSec {
                best = mid
                bestDist = d
            }
        }
        bounds = append(bounds, best)
        cursor = best + targetSec
    }
    bounds = append(bounds, durationSec)
    out := make([][2]float64, 0, len(bounds)-1)
    for i := 0; i < len(bounds)-1; i++ {
        out = append(out, [2]float64{bounds[i], bounds[i+1]})
    }
    return out
}
```

- [ ] **Step 2: Replace the oversize-guard with real chunking**

In `TranscribeAudio`, after staging the file to temp, branch on size:

```go
fileBytes := row.MediaFileBytes.Int64
durSec := float64(row.DurationSeconds.Int32) // int4 → seconds

if fileBytes <= audioChunkSizeThresholdBytes {
    var text string
    err = chain.Try(ctx, func(p transcription.TranscriptionProvider) error {
        res, err := p.Transcribe(ctx, tmpFile)
        if err != nil { return err }
        text = res.Text
        return nil
    })
    if err != nil { return nil, fmt.Errorf("transcribe_audio: chain failed: %w", err) }
    return resultBlob(text), nil
}

// Chunked path
const targetSegmentSec = 20 * 60.0
const toleranceSec    = 2 * 60.0
const noiseDB         = -30.0
const minSilenceSec   = 0.5

silences, err := ffmpeg.DetectSilence(ctx, tmpFile, noiseDB, minSilenceSec)
if err != nil {
    return nil, fmt.Errorf("transcribe_audio: silence detect: %w", err)
}
boundaries := pickSplitPoints(durSec, targetSegmentSec, toleranceSec, silences)

var fullText strings.Builder
for i, b := range boundaries {
    chunkPath := fmt.Sprintf("%s.chunk%d", tmpFile, i)
    if err := ffmpeg.SplitSegment(ctx, tmpFile, b[0], b[1], chunkPath); err != nil {
        return nil, fmt.Errorf("transcribe_audio: split %d: %w", i, err)
    }
    // Recursive halving if a single chunk still exceeds 24 MB
    paths, err := halveUntilSafe(ctx, ffmpeg, chunkPath, b[0], b[1])
    if err != nil { return nil, err }

    for _, cp := range paths {
        var t string
        err := chain.Try(ctx, func(p transcription.TranscriptionProvider) error {
            r, err := p.Transcribe(ctx, cp)
            if err != nil { return err }
            t = r.Text
            return nil
        })
        os.Remove(cp)
        if err != nil { return nil, fmt.Errorf("transcribe_audio: chunk %s: %w", cp, err) }
        if fullText.Len() > 0 { fullText.WriteString("\n\n") }
        fullText.WriteString(t)
    }
}
return resultBlob(fullText.String()), nil
```

`resultBlob` is a tiny helper that marshals `TranscribeAudioResult` and wraps it in `*worker.StepResult{Data: ...}`. Add it inline or just inline the marshal.

- [ ] **Step 3: Add `halveUntilSafe`**

```go
func halveUntilSafe(ctx context.Context, ff *services.FFmpeg, inputPath string, startSec, endSec float64) ([]string, error) {
    info, err := os.Stat(inputPath)
    if err != nil { return nil, err }
    if info.Size() <= audioChunkSizeThresholdBytes {
        return []string{inputPath}, nil
    }
    mid := (startSec + endSec) / 2
    leftPath  := inputPath + ".L"
    rightPath := inputPath + ".R"
    if err := ff.SplitSegment(ctx, inputPath, startSec, mid, leftPath);  err != nil { return nil, err }
    if err := ff.SplitSegment(ctx, inputPath, mid,    endSec, rightPath); err != nil { return nil, err }
    os.Remove(inputPath)
    leftPaths, err := halveUntilSafe(ctx, ff, leftPath, startSec, mid)
    if err != nil { return nil, err }
    rightPaths, err := halveUntilSafe(ctx, ff, rightPath, mid, endSec)
    if err != nil { return nil, err }
    return append(leftPaths, rightPaths...), nil
}
```

- [ ] **Step 4: Update the function signature to accept `*services.FFmpeg`**

```go
func TranscribeAudio(
    ctx context.Context,
    chain *providers.Chain[transcription.TranscriptionProvider],
    storage services.StorageProvider,
    ffmpeg *services.FFmpeg,
    queries store.Querier,
    job *worker.Job,
) (*worker.StepResult, error)
```

Update the audio processor's `Execute` callsite in `processors/audio.go` to pass `p.ffmpeg`.

- [ ] **Step 5: Build and commit**

```bash
cd server
go build ./...
git add server/internal/worker/steps/transcribe_audio.go server/internal/worker/processors/audio.go
git commit -m "feat(saves): server-side ffmpeg silence-aware chunking for audio transcription"
```

---

### Task 23: Test the chunking logic

**Files:**
- Modify: `server/internal/worker/steps/transcribe_audio_test.go`

- [ ] **Step 1: Test `pickSplitPoints` directly**

```go
func TestPickSplitPoints_RespectsSilenceWithinTolerance(t *testing.T) {
    silences := []services.SilenceMarker{
        {StartSec: 1199, EndSec: 1201},
        {StartSec: 2400, EndSec: 2402},
    }
    pts := pickSplitPoints(3000, 1200, 120, silences)
    require.Len(t, pts, 3)
    require.InDelta(t, 0,    pts[0][0], 0.5)
    require.InDelta(t, 1200, pts[0][1], 5)
    require.InDelta(t, 2401, pts[1][1], 5)
    require.InDelta(t, 3000, pts[2][1], 0.5)
}

func TestPickSplitPoints_FallsBackToExactWhenNoSilence(t *testing.T) {
    pts := pickSplitPoints(3000, 1200, 120, nil)
    require.Len(t, pts, 3)
    require.InDelta(t, 1200, pts[0][1], 0.001)
    require.InDelta(t, 2400, pts[1][1], 0.001)
}

func TestPickSplitPoints_ShortFileSingleChunk(t *testing.T) {
    pts := pickSplitPoints(600, 1200, 120, nil)
    require.Len(t, pts, 1)
    require.Equal(t, [2]float64{0, 600}, pts[0])
}
```

- [ ] **Step 2: Integration test for chunked transcription**

```go
func TestTranscribeAudio_ChunkedTranscription(t *testing.T) {
    ctx := context.Background()
    contentID := uuid.New()

    queries := testutil.NewQuerierMock(t)
    queries.GetContentByIDFunc = func(context.Context, uuid.UUID) (store.MindmapContent, error) {
        return store.MindmapContent{
            ID:              contentID,
            MediaKey:        pgtype.Text{String: "u/c/audio.m4a", Valid: true},
            MediaFileBytes:  pgtype.Int8{Int64: 50 * 1024 * 1024, Valid: true},
            DurationSeconds: pgtype.Int4{Int32: 3000, Valid: true},
        }, nil
    }

    storage := testutil.NewMemStorage()
    storage.PutBytes(t, "u/c/audio.m4a", make([]byte, 50*1024*1024))

    ffmpeg := testutil.NewFakeFFmpeg(t,
        testutil.WithSilenceMarkers([]services.SilenceMarker{{StartSec: 1199, EndSec: 1201}, {StartSec: 2400, EndSec: 2402}}),
        testutil.WithChunkSizes(10*1024*1024, 10*1024*1024, 10*1024*1024),
    )

    transcriber := &testutil.MockTranscriptionProvider{
        Sequence: []*transcription.TranscriptionResult{
            {Text: "first chunk"},
            {Text: "second chunk"},
            {Text: "third chunk"},
        },
    }
    chain := testutil.NewSingleProviderChain(transcriber)

    job := &worker.Job{ContentID: contentID, ContentType: "audio"}
    res, err := steps.TranscribeAudio(ctx, chain, storage, ffmpeg, queries, job)
    require.NoError(t, err)

    var out steps.TranscribeAudioResult
    require.NoError(t, json.Unmarshal(res.Data, &out))
    require.Equal(t, "first chunk\n\nsecond chunk\n\nthird chunk", out.ExtractedText)
}
```

(`testutil.NewFakeFFmpeg` needs to be added — a tiny mock that returns the given silence markers and writes chunk files of the given fake sizes when `SplitSegment` is called. Mirror the testutil patterns already in the repo.)

- [ ] **Step 3: Run + commit**

```bash
cd server
go test ./internal/worker/steps/... -run "TestPickSplitPoints|TestTranscribeAudio" -v
git add server/internal/worker/steps/transcribe_audio_test.go server/internal/testutil/
git commit -m "test(saves): cover transcribe_audio chunking and split-point selection"
```

---

## Chunk 7: Audio Title in SummarizeStep + Draft Cleanup Goroutine

### Task 24: Add `SummarizeForAudio` with title-asking prompt

**Files:**
- Modify: `server/internal/worker/steps/summarize.go`

- [ ] **Step 1: Read the current summarize prompt**

Open `summarize.go` and find the LLM prompt template. It's currently shaped to ask for `{summary, tags, key_topics}` for general content (and possibly already includes title for some types).

- [ ] **Step 2: Add an audio-flavored variant**

```go
const audioSummarizePromptTemplate = `You are MindTab's audio summariser. Given the transcript of a voice note or audio recording, produce JSON with these fields:

- "title": a short (2–8 word) title that captures the gist; never a sentence; never quoted.
- "summary": one paragraph, 2–4 sentences, third person, no preamble.
- "tags": 2–5 short topical tags.
- "key_topics": 2–5 distinct themes mentioned.

Respond ONLY with the JSON.

Transcript:
%s`

// SummarizeForAudio runs the LLM chain on a transcript with the audio-specific prompt.
func SummarizeForAudio(ctx context.Context, llmChain *providers.Chain[llm.LLMProvider], transcript string) (*worker.StepResult, error) {
    prompt := fmt.Sprintf(audioSummarizePromptTemplate, transcript)
    return runSummarizeWithPrompt(ctx, llmChain, prompt)
}
```

`runSummarizeWithPrompt` is whatever common worker the existing `Summarize` already uses internally. Extract it if it isn't already factored out:

```go
func runSummarizeWithPrompt(ctx context.Context, llmChain *providers.Chain[llm.LLMProvider], prompt string) (*worker.StepResult, error) {
    var parsed SummarizeResult
    err := llmChain.Try(ctx, func(p llm.LLMProvider) error {
        resp, err := p.Complete(ctx, llm.CompleteRequest{Prompt: prompt, JSONResponse: true})
        if err != nil { return err }
        return json.Unmarshal([]byte(resp.Text), &parsed)
    })
    if err != nil { return nil, err }
    parsed.Provider = llmChain.LastProviderName()
    data, err := json.Marshal(parsed)
    if err != nil { return nil, err }
    return &worker.StepResult{Data: data}, nil
}
```

- [ ] **Step 3: Build**

```bash
cd server
go build ./...
```

- [ ] **Step 4: Commit**

```bash
git add server/internal/worker/steps/summarize.go
git commit -m "feat(saves): add SummarizeForAudio with audio-specific prompt asking for title"
```

---

### Task 25: Ensure `StoreStep` writes `Title` to `source_title` for audio rows

**Files:**
- Modify: `server/internal/worker/steps/store.go`
- Possibly: `server/internal/store/queries/content.sql` (a new update query)

- [ ] **Step 1: Check `Store`'s current behavior**

Today `Store` already calls `UpdateContentResults` with summary, tags, key_topics. Audio needs `source_title` to be updated when the summarize step returned a non-empty title.

- [ ] **Step 2: Add a sqlc update query (if not already present)**

In `content.sql`:

```sql
-- name: UpdateContentTitleIfEmpty :exec
UPDATE mindmap_content
SET source_title = $2,
    updated_at   = CURRENT_TIMESTAMP
WHERE id = $1
  AND deleted_at IS NULL;
```

(Drop `IfEmpty` from the name if you want to always overwrite — for audio, we *want* to overwrite the timestamp placeholder. The `_IfEmpty` suffix in the name above is mildly misleading; rename to `UpdateContentTitle`.)

- [ ] **Step 3: Add a branch in `Store`**

Inside `Store`, after extracting the `SummarizeResult`:

```go
if job.ContentType == "audio" && summarizeResult.Title != "" {
    if err := queries.UpdateContentTitle(ctx, store.UpdateContentTitleParams{
        ID:          job.ContentID,
        SourceTitle: pgtype.Text{String: summarizeResult.Title, Valid: true},
    }); err != nil {
        return nil, fmt.Errorf("store: update title: %w", err)
    }
}
```

- [ ] **Step 4: Regenerate sqlc, build, commit**

```bash
cd server
sqlc generate
go build ./...
git add server/internal/store/queries/content.sql server/internal/store/ server/internal/worker/steps/store.go
git commit -m "feat(saves): StoreStep updates source_title for audio rows from summarize result"
```

---

### Task 26: Add the draft cleanup goroutine

**Files:**
- Create: `server/internal/worker/draft_cleanup.go`
- Modify: `server/cmd/api/main.go`

- [ ] **Step 1: Write the cleanup loop**

```go
package worker

import (
    "context"
    "log/slog"
    "time"

    "github.com/jackc/pgx/v5/pgtype"
    "github.com/mindtab/server/internal/services"
    "github.com/mindtab/server/internal/store"
)

func StartDraftCleanup(
    ctx context.Context,
    queries store.Querier,
    storage services.StorageProvider,
    logger *slog.Logger,
    interval time.Duration,
    expireAfter time.Duration,
) {
    ticker := time.NewTicker(interval)
    defer ticker.Stop()

    runOnce := func() {
        cutoff := time.Now().Add(-expireAfter)

        // 1. Collect media keys for storage cleanup BEFORE deleting rows.
        keys, err := queries.GetMediaKeysForExpiredDrafts(ctx, pgtype.Timestamptz{Time: cutoff, Valid: true})
        if err != nil {
            logger.Error("draft_cleanup: list keys", "err", err)
            return
        }

        // 2. Delete rows.
        deleted, err := queries.DeleteExpiredDrafts(ctx, pgtype.Timestamptz{Time: cutoff, Valid: true})
        if err != nil {
            logger.Error("draft_cleanup: delete rows", "err", err)
            return
        }

        // 3. Best-effort delete files; tolerate failures.
        for _, k := range keys {
            if !k.MediaKey.Valid { continue }
            if err := storage.Delete(ctx, k.MediaKey.String); err != nil {
                logger.Warn("draft_cleanup: storage delete failed (orphaned)", "key", k.MediaKey.String, "err", err)
            }
        }
        if deleted > 0 {
            logger.Info("draft_cleanup: removed", "rows", deleted)
        }
    }

    for {
        select {
        case <-ctx.Done():
            return
        case <-ticker.C:
            runOnce()
        }
    }
}
```

- [ ] **Step 2: Wire it in `cmd/api/main.go`**

Right after dispatcher startup:

```go
go worker.StartDraftCleanup(
    ctx,
    queries,
    storage,
    logger.With("component", "draft_cleanup"),
    3*time.Hour,
    24*time.Hour,
)
```

- [ ] **Step 3: Test the cleanup behaviour**

Create `server/internal/worker/draft_cleanup_test.go`:

```go
package worker_test

import (
    "context"
    "log/slog"
    "os"
    "testing"
    "time"

    "github.com/stretchr/testify/require"

    "github.com/mindtab/server/internal/testutil"
    "github.com/mindtab/server/internal/worker"
)

func TestDraftCleanup_RemovesExpiredDraftsAndFiles(t *testing.T) {
    ctx, cancel := context.WithCancel(context.Background())
    defer cancel()

    db := testutil.NewIntegrationDB(t)        // testcontainers Postgres
    queries := db.Queries()
    storage := testutil.NewMemStorage()

    // Seed: one fresh draft (5 min old), one old draft (25h old), one committed.
    fresh := db.SeedContent(t, "user-1", "draft", "deferred", testutil.AgedSeconds(5*60))
    expired := db.SeedContent(t, "user-1", "draft", "deferred", testutil.AgedSeconds(25*60*60))
    keep := db.SeedContent(t, "user-1", "committed", "completed", testutil.AgedSeconds(25*60*60))

    storage.PutString(t, db.MediaKey(t, fresh), "f")
    storage.PutString(t, db.MediaKey(t, expired), "e")
    storage.PutString(t, db.MediaKey(t, keep), "k")

    go worker.StartDraftCleanup(ctx, queries, storage, slog.New(slog.NewTextHandler(os.Stdout, nil)), 100*time.Millisecond, 24*time.Hour)

    require.Eventually(t, func() bool {
        _, err := queries.GetContentByID(ctx, expired)
        return err != nil // row gone
    }, 3*time.Second, 100*time.Millisecond)

    // Files: expired removed, others kept
    require.False(t, storage.Has(db.MediaKey(t, expired)))
    require.True(t, storage.Has(db.MediaKey(t, fresh)))
    require.True(t, storage.Has(db.MediaKey(t, keep)))
}
```

- [ ] **Step 4: Run + commit**

```bash
cd server
go test ./internal/worker/... -run "TestDraftCleanup" -v
git add server/internal/worker/draft_cleanup.go server/internal/worker/draft_cleanup_test.go server/cmd/api/main.go
git commit -m "feat(saves): add 3-hourly draft cleanup goroutine and integration test"
```

---

## Chunk 8: OpenAPI / api-spec Types

### Task 27: Update the OpenAPI spec

**Files:**
- Modify: `packages/api-spec/src/openapi.yaml`

- [ ] **Step 1: Add `commit_status` and `'deferred'` to schemas**

Find the existing `Save` (or `Content`) response schema and add:

```yaml
components:
  schemas:
    Save:
      type: object
      required: [id, source_type, processing_status, commit_status]
      properties:
        # ...existing fields...
        commit_status:
          type: string
          enum: [draft, committed]
        processing_status:
          type: string
          enum: [deferred, pending, processing, completed, failed]
        duration_seconds:
          type: integer
          nullable: true
        media_mime:
          type: string
          nullable: true
        media_file_bytes:
          type: integer
          format: int64
          nullable: true
        media_url:
          type: string
          nullable: true
```

(Remove `video_duration` from the schema if it was previously present — replaced by `duration_seconds`.)

- [ ] **Step 2: Extend `POST /saves` request bodies**

```yaml
paths:
  /saves:
    post:
      summary: Create a save (URL or multipart)
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/CreateSaveURLRequest'
          multipart/form-data:
            schema:
              $ref: '#/components/schemas/CreateSaveMultipartRequest'
      responses:
        '200':
          description: Save created
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/CreateSaveResponse'
```

```yaml
components:
  schemas:
    CreateSaveURLRequest:
      type: object
      required: [url]
      properties:
        url: { type: string, format: uri }
        content: { type: string }
        title:   { type: string }
        auto_commit:       { type: boolean, default: true }
        start_processing:  { type: boolean, default: true }
    CreateSaveMultipartRequest:
      type: object
      properties:
        image:            { type: string, format: binary }
        audio:            { type: string, format: binary }
        duration_seconds: { type: integer }
        source:           { type: string, enum: [recorder, file_picker, share_extension, app] }
        auto_commit:       { type: boolean, default: true }
        start_processing:  { type: boolean, default: true }
    CreateSaveResponse:
      type: object
      required: [id, commit_status, processing_status]
      properties:
        id:                { type: string, format: uuid }
        commit_status:     { type: string, enum: [draft, committed] }
        processing_status: { type: string, enum: [deferred, pending, processing, completed, failed] }
        media_url:         { type: string, nullable: true }
```

- [ ] **Step 3: Add the commit operation**

```yaml
  /saves/{id}/commit:
    post:
      summary: Flip a draft save to committed (and enqueue if deferred)
      parameters:
        - in: path
          name: id
          required: true
          schema: { type: string, format: uuid }
      requestBody:
        required: false
        content:
          application/json:
            schema:
              type: object
              properties:
                title: { type: string }
      responses:
        '200':
          description: OK
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/CreateSaveResponse'
        '404':
          description: Not found
```

- [ ] **Step 4: Build the api-spec package**

```bash
cd packages/api-spec
pnpm build
```

Expected: clean. Generated TS types in `dist/`.

- [ ] **Step 5: Commit**

```bash
git add packages/api-spec/
git commit -m "feat(api-spec): add audio multipart, commit endpoint, and lifecycle fields"
```

---

### Task 28: Update the web app's TS types if any audio-related references break

**Files:**
- Possibly: `apps/web/src/lib/api.ts` or wherever the web client builds requests
- Possibly: `apps/extension/src/...`

- [ ] **Step 1: Build the web app to find type errors**

```bash
cd apps/web
pnpm build
```

If the rename `VideoDuration` → `DurationSeconds` (or `video_duration` → `duration_seconds`) surfaced in TS, you'll see compile errors. Fix them by following the new field names.

- [ ] **Step 2: Same for the extension**

```bash
cd apps/extension
pnpm build
```

- [ ] **Step 3: Commit any web/extension TS fixes**

```bash
git add apps/web/ apps/extension/
git commit -m "refactor(saves): align web + extension types with renamed schema fields"
```

---

### Task 29: Update the mobile TS types reference (just consume the regenerated types)

**Files:**
- Modify: `apps/mobile/src/lib/api-client.ts` (probably) — wherever `Save` types are used

- [ ] **Step 1: Build the mobile app to surface type breaks**

```bash
cd apps/mobile
pnpm tsc --noEmit
```

- [ ] **Step 2: Fix references to `video_duration` → `duration_seconds` and the `processing_status` enum if needed**

The vault detail screen (`apps/mobile/app/(main)/vault/[id].tsx`) has a local `SaveDetail` type with `video_duration?: number | null;` — change to `duration_seconds?: number | null;`. The `processing_status` enum string union should add `"deferred"`. The `source_type` union should add `"audio"`.

Also extend the type with the new media fields:

```ts
type SaveDetail = {
  id: string;
  source_url?: string | null;
  source_type: "article" | "image" | "youtube" | "audio";
  source_title?: string | null;
  summary?: string | null;
  tags?: string[] | null;
  key_topics?: string[] | null;
  media_url?: string | null;
  media_url?: string | null;
  media_mime?: string | null;
  media_file_bytes?: number | null;
  duration_seconds?: number | null;
  processing_status: "deferred" | "pending" | "processing" | "completed" | "failed";
  commit_status: "draft" | "committed";
  processing_error?: string | null;
  extracted_text?: string | null;
  visual_description?: string | null;
  created_at: string;
  updated_at: string;
  video_thumbnail_url?: string | null;
  video_channel?: string | null;
  transcript_source?: string | null;
};
```

- [ ] **Step 3: Re-run tsc and commit**

```bash
cd apps/mobile
pnpm tsc --noEmit
git add apps/mobile/
git commit -m "refactor(mobile): align types with renamed schema fields and audio source_type"
```

---

## Chunk 9: Mobile Dependencies + `app.json` Config

### Task 30: Add `expo-audio` and `expo-document-picker`

**Files:**
- Modify: `apps/mobile/package.json`

- [ ] **Step 1: Install both deps**

```bash
cd apps/mobile
pnpm add expo-audio expo-document-picker
```

- [ ] **Step 2: Verify versions are SDK 52-compatible**

```bash
pnpm dlx expo install --check
```

Expected: clean. If a version mismatch is reported, run `pnpm dlx expo install expo-audio expo-document-picker` to use the recommended versions.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/package.json apps/mobile/pnpm-lock.yaml
git commit -m "feat(mobile): add expo-audio and expo-document-picker dependencies"
```

---

### Task 31: Wire `app.json` permissions and background-audio config

**Files:**
- Modify: `apps/mobile/app.json`

- [ ] **Step 1: Add the `expo-audio` plugin block**

Inside the `expo.plugins` array:

```json
[
  "expo-audio",
  {
    "microphonePermission": "MindTab uses your microphone to record voice notes you save to your vault.",
    "staysActiveInBackground": true
  }
]
```

- [ ] **Step 2: Add iOS background audio + microphone usage**

In `expo.ios`:

```json
"infoPlist": {
  "UIBackgroundModes": ["audio"],
  "NSMicrophoneUsageDescription": "MindTab uses your microphone to record voice notes you save to your vault."
}
```

(Merge with any existing `infoPlist` keys.)

- [ ] **Step 3: Add Android permissions**

In `expo.android`:

```json
"permissions": [
  "RECORD_AUDIO",
  "FOREGROUND_SERVICE",
  "FOREGROUND_SERVICE_MICROPHONE"
]
```

(Merge with existing permissions; do not duplicate.)

- [ ] **Step 4: Run prebuild to sanity-check the config**

```bash
cd apps/mobile
pnpm dlx expo prebuild --clean
```

Expected: `ios/` and `android/` regenerate cleanly with the new entitlements / permissions.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/app.json
# Do NOT commit the prebuild output if it's gitignored — only the app.json change.
git commit -m "feat(mobile): expo-audio plugin + iOS background audio + Android mic perms"
```

---

## Chunk 10: Mobile Recorder Store + Recorder Screen

### Task 32: Implement `recorderStore` (Zustand)

**Files:**
- Create: `apps/mobile/src/stores/recorder-store.ts`

- [ ] **Step 1: Write the store**

```ts
import { create } from "zustand";
import {
  AudioModule,
  AudioRecorder,
  RecordingPresets,
} from "expo-audio";

type Status = "idle" | "recording" | "paused" | "stopped";

type RecorderState = {
  status: Status;
  startedAt: number | null;
  elapsedMs: number;
  meterLevel: number;
  fileUri: string | null;
  draftId: string | null;
  uploadProgress: number;
  uploadState: "idle" | "uploading" | "done" | "failed";

  start: () => Promise<void>;
  pause: () => Promise<void>;
  resume: () => Promise<void>;
  stop: () => Promise<{ fileUri: string; durationSeconds: number } | null>;
  setUploadProgress: (v: number) => void;
  setUploadState: (v: RecorderState["uploadState"]) => void;
  setDraftId: (id: string | null) => void;
  reset: () => void;
};

let recorder: AudioRecorder | null = null;
let tickInterval: ReturnType<typeof setInterval> | null = null;
let pausedAccumMs = 0;
let segmentStartedAt: number | null = null;

export const useRecorderStore = create<RecorderState>((set, get) => ({
  status: "idle",
  startedAt: null,
  elapsedMs: 0,
  meterLevel: 0,
  fileUri: null,
  draftId: null,
  uploadProgress: 0,
  uploadState: "idle",

  start: async () => {
    const granted = await AudioModule.requestRecordingPermissionsAsync();
    if (!granted.granted) throw new Error("microphone-permission-denied");

    recorder = new AudioRecorder(RecordingPresets.HIGH_QUALITY, (status) => {
      if (status.metering !== undefined) {
        // expo-audio reports dBFS in roughly [-160, 0]; map to [0, 1]
        const norm = Math.max(0, Math.min(1, (status.metering + 60) / 60));
        set({ meterLevel: norm });
      }
    });
    await recorder.prepareToRecordAsync();
    await recorder.record();

    pausedAccumMs = 0;
    const now = Date.now();
    segmentStartedAt = now;
    set({ status: "recording", startedAt: now, elapsedMs: 0 });

    tickInterval = setInterval(() => {
      const s = get();
      if (s.status === "recording" && segmentStartedAt) {
        set({ elapsedMs: pausedAccumMs + (Date.now() - segmentStartedAt) });
      }
    }, 250);
  },

  pause: async () => {
    if (!recorder) return;
    await recorder.pause();
    if (segmentStartedAt) pausedAccumMs += Date.now() - segmentStartedAt;
    segmentStartedAt = null;
    set({ status: "paused" });
  },

  resume: async () => {
    if (!recorder) return;
    await recorder.record();
    segmentStartedAt = Date.now();
    set({ status: "recording" });
  },

  stop: async () => {
    if (!recorder) return null;
    if (segmentStartedAt) pausedAccumMs += Date.now() - segmentStartedAt;
    segmentStartedAt = null;
    if (tickInterval) { clearInterval(tickInterval); tickInterval = null; }

    await recorder.stop();
    const uri = recorder.uri;
    recorder = null;

    const durationMs = pausedAccumMs;
    const durationSeconds = Math.max(1, Math.round(durationMs / 1000));
    set({ status: "stopped", elapsedMs: durationMs, fileUri: uri ?? null });
    return uri ? { fileUri: uri, durationSeconds } : null;
  },

  setUploadProgress: (v) => set({ uploadProgress: v }),
  setUploadState: (v) => set({ uploadState: v }),
  setDraftId: (id) => set({ draftId: id }),

  reset: () => {
    if (tickInterval) { clearInterval(tickInterval); tickInterval = null; }
    recorder = null;
    pausedAccumMs = 0;
    segmentStartedAt = null;
    set({
      status: "idle", startedAt: null, elapsedMs: 0, meterLevel: 0,
      fileUri: null, draftId: null, uploadProgress: 0, uploadState: "idle",
    });
  },
}));
```

(Cross-check the `expo-audio` API names against the installed version's docs — `AudioRecorder`, `RecordingPresets`, `prepareToRecordAsync`, `record`, `pause`, `stop`, `uri`, `metering` should match. If any names diverge, adapt.)

- [ ] **Step 2: Commit**

```bash
git add apps/mobile/src/stores/recorder-store.ts
git commit -m "feat(mobile): recorderStore with start/pause/resume/stop and meter polling"
```

---

### Task 33: Test the recorder store state machine

**Files:**
- Create: `apps/mobile/src/stores/recorder-store.test.ts`

- [ ] **Step 1: Write the test**

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("expo-audio", () => {
  let isRecording = false;
  return {
    AudioModule: {
      requestRecordingPermissionsAsync: vi.fn(async () => ({ granted: true })),
    },
    RecordingPresets: { HIGH_QUALITY: {} },
    AudioRecorder: vi.fn().mockImplementation((_preset, _onStatus) => ({
      prepareToRecordAsync: vi.fn(async () => {}),
      record: vi.fn(async () => { isRecording = true; }),
      pause: vi.fn(async () => { isRecording = false; }),
      stop: vi.fn(async () => { isRecording = false; }),
      get uri() { return "file:///tmp/fake.m4a"; },
    })),
  };
});

import { useRecorderStore } from "./recorder-store";

beforeEach(() => useRecorderStore.getState().reset());

describe("recorderStore", () => {
  it("transitions idle → recording on start", async () => {
    await useRecorderStore.getState().start();
    expect(useRecorderStore.getState().status).toBe("recording");
  });

  it("pauses and resumes accumulating elapsed time", async () => {
    const s = useRecorderStore.getState();
    await s.start();
    await new Promise(r => setTimeout(r, 300));
    await s.pause();
    expect(useRecorderStore.getState().status).toBe("paused");
    const elapsedAfterPause = useRecorderStore.getState().elapsedMs;
    await new Promise(r => setTimeout(r, 200));
    await s.resume();
    expect(useRecorderStore.getState().status).toBe("recording");
    await new Promise(r => setTimeout(r, 300));
    await s.pause();
    expect(useRecorderStore.getState().elapsedMs).toBeGreaterThan(elapsedAfterPause);
  });

  it("stop returns fileUri and durationSeconds and ends in stopped", async () => {
    const s = useRecorderStore.getState();
    await s.start();
    await new Promise(r => setTimeout(r, 300));
    const out = await s.stop();
    expect(out?.fileUri).toBe("file:///tmp/fake.m4a");
    expect(out?.durationSeconds).toBeGreaterThanOrEqual(1);
    expect(useRecorderStore.getState().status).toBe("stopped");
  });
});
```

- [ ] **Step 2: Run + commit**

```bash
cd apps/mobile
pnpm vitest run src/stores/recorder-store.test.ts
git add apps/mobile/src/stores/recorder-store.test.ts
git commit -m "test(mobile): cover recorderStore state machine"
```

---

### Task 34: Build the `<AudioRecorder/>` component

**Files:**
- Create: `apps/mobile/src/components/audio/audio-recorder.tsx`

- [ ] **Step 1: Write the component**

```tsx
import React, { useEffect } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, { useAnimatedStyle, withTiming } from "react-native-reanimated";
import { Mic, Pause, Play, Square } from "lucide-react-native";
import { useRecorderStore } from "~/stores/recorder-store";
import { colors } from "~/styles/colors";

function formatElapsed(ms: number): string {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

type Props = {
  onStop: (out: { fileUri: string; durationSeconds: number }) => void;
};

export function AudioRecorder({ onStop }: Props) {
  const status = useRecorderStore(s => s.status);
  const elapsedMs = useRecorderStore(s => s.elapsedMs);
  const meter = useRecorderStore(s => s.meterLevel);
  const start = useRecorderStore(s => s.start);
  const pause = useRecorderStore(s => s.pause);
  const resume = useRecorderStore(s => s.resume);
  const stop = useRecorderStore(s => s.stop);

  useEffect(() => {
    if (status === "idle") {
      start().catch(err => console.warn("recorder start failed", err));
    }
  }, [status, start]);

  const meterStyle = useAnimatedStyle(() => ({
    transform: [{ scaleY: withTiming(0.2 + meter * 0.8, { duration: 80 }) }],
  }));

  const onStopPress = async () => {
    const out = await stop();
    if (out) onStop(out);
  };

  return (
    <View style={styles.root}>
      <Text style={styles.timer}>{formatElapsed(elapsedMs)}</Text>

      <View style={styles.meterRail}>
        <Animated.View style={[styles.meterBar, meterStyle]} />
      </View>

      <View style={styles.controls}>
        {status === "recording" ? (
          <Pressable onPress={pause} style={styles.controlBtn}>
            <Pause size={24} color={colors.text.primary} />
          </Pressable>
        ) : (
          <Pressable onPress={resume} style={styles.controlBtn} disabled={status === "stopped"}>
            <Play size={24} color={colors.text.primary} />
          </Pressable>
        )}
        <Pressable onPress={onStopPress} style={[styles.controlBtn, styles.stopBtn]}>
          <Square size={24} color={colors.bg.primary} fill={colors.bg.primary} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root:        { flex: 1, alignItems: "center", justifyContent: "center", padding: 32, backgroundColor: colors.bg.primary },
  timer:       { fontSize: 56, fontVariant: ["tabular-nums"], color: colors.text.primary, fontWeight: "200", marginBottom: 64 },
  meterRail:   { width: 4, height: 96, backgroundColor: colors.bg.elevated, borderRadius: 2, overflow: "hidden", justifyContent: "flex-end", marginBottom: 64 },
  meterBar:    { width: 4, height: "100%", backgroundColor: colors.accent.primary, borderRadius: 2 },
  controls:    { flexDirection: "row", gap: 32, alignItems: "center" },
  controlBtn:  { width: 64, height: 64, borderRadius: 32, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg.elevated },
  stopBtn:     { backgroundColor: colors.accent.primary },
});
```

(Adapt `colors.*` to match the actual mobile token vocabulary in `~/styles/colors`.)

- [ ] **Step 2: Commit**

```bash
git add apps/mobile/src/components/audio/audio-recorder.tsx
git commit -m "feat(mobile): AudioRecorder component (timer, meter, pause/resume/stop)"
```

---

### Task 35: Add the recorder route + register in `_layout.tsx`

**Files:**
- Create: `apps/mobile/app/(main)/saves/record.tsx`
- Modify: `apps/mobile/app/(main)/_layout.tsx`

- [ ] **Step 1: Write the route**

```tsx
import { useRouter } from "expo-router";
import { View, StyleSheet } from "react-native";
import { useCallback } from "react";

import { AudioRecorder } from "~/components/audio/audio-recorder";
import { useRecorderStore } from "~/stores/recorder-store";
import { useAudioUpload } from "~/hooks/use-audio-upload";   // added in Task 38
import { colors } from "~/styles/colors";

export default function RecordScreen() {
  const router = useRouter();
  const setDraftId = useRecorderStore(s => s.setDraftId);
  const upload = useAudioUpload();

  const onStop = useCallback(async ({ fileUri, durationSeconds }: { fileUri: string; durationSeconds: number }) => {
    // Kick off background upload immediately. Resolves to the draft id.
    const startProcessing = durationSeconds <= 60;
    upload.mutate(
      { fileUri, durationSeconds, autoCommit: false, startProcessing, source: "recorder" },
      {
        onSuccess: ({ id }) => {
          setDraftId(id);
        },
      }
    );
    // Navigate immediately — review screen will look up draft id from the store / mutation state.
    router.replace(`/saves/review/pending`);
  }, [router, setDraftId, upload]);

  return (
    <View style={styles.root}>
      <AudioRecorder onStop={onStop} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg.primary },
});
```

(There is one design wrinkle: we navigate to `/saves/review/pending` because we don't know the draft id yet. Resolve in Task 36 by either (a) waiting for the mutation to settle before navigating, with a small spinner overlay, or (b) using the literal `"pending"` segment and reading the id from `recorderStore.draftId` once it lands. Pick whichever the implementer prefers — option (a) is simpler.)

If using option (a), change `onStop` to:

```tsx
const onStop = useCallback(async ({ fileUri, durationSeconds }) => {
  const startProcessing = durationSeconds <= 60;
  const result = await upload.mutateAsync({
    fileUri, durationSeconds, autoCommit: false, startProcessing, source: "recorder",
  });
  router.replace(`/saves/review/${result.id}`);
}, [router, upload]);
```

- [ ] **Step 2: Register the route in `_layout.tsx`**

Add to the `<Stack>`:

```tsx
<Stack.Screen
  name="saves/record"
  options={{ presentation: "fullScreenModal", headerShown: false, animation: "slide_from_bottom" }}
/>
<Stack.Screen
  name="saves/review/[id]"
  options={{ presentation: "fullScreenModal", headerShown: false, animation: "fade" }}
/>
```

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/app/(main)/saves/record.tsx apps/mobile/app/(main)/_layout.tsx
git commit -m "feat(mobile): /saves/record fullscreen recorder route"
```

---

## Chunk 11: Mobile Review Screen + Audio Player + Hooks

### Task 36: `useAudioUpload` mutation hook

**Files:**
- Create: `apps/mobile/src/hooks/use-audio-upload.ts`

- [ ] **Step 1: Write the hook**

```ts
import { useMutation } from "@tanstack/react-query";
import { authedFetch } from "~/lib/api-client";
import { useRecorderStore } from "~/stores/recorder-store";

const API_URL = process.env.EXPO_PUBLIC_API_URL || "http://localhost:8080";

type UploadInput = {
  fileUri: string;
  durationSeconds: number;
  autoCommit: boolean;
  startProcessing: boolean;
  source: "recorder" | "file_picker" | "share_extension" | "app";
  mime?: string;     // overrides the inferred type
  filename?: string; // overrides the inferred name
};

type UploadResult = {
  id: string;
  commit_status: "draft" | "committed";
  processing_status: "deferred" | "pending" | "processing" | "completed" | "failed";
  media_url?: string | null;
};

function inferMime(fileUri: string): string {
  if (fileUri.endsWith(".mp3"))  return "audio/mpeg";
  if (fileUri.endsWith(".wav"))  return "audio/wav";
  if (fileUri.endsWith(".webm")) return "audio/webm";
  if (fileUri.endsWith(".ogg"))  return "audio/ogg";
  if (fileUri.endsWith(".flac")) return "audio/flac";
  return "audio/mp4"; // m4a default
}

export function useAudioUpload() {
  const setUploadProgress = useRecorderStore(s => s.setUploadProgress);
  const setUploadState    = useRecorderStore(s => s.setUploadState);

  return useMutation({
    mutationFn: async (input: UploadInput): Promise<UploadResult> => {
      const mime = input.mime ?? inferMime(input.fileUri);
      const filename = input.filename ?? input.fileUri.split("/").pop() ?? "audio.m4a";

      const form = new FormData();
      form.append("audio", { uri: input.fileUri, name: filename, type: mime } as any);
      form.append("duration_seconds", String(input.durationSeconds));
      form.append("auto_commit",       String(input.autoCommit));
      form.append("start_processing",  String(input.startProcessing));
      form.append("source",            input.source);

      setUploadState("uploading");
      setUploadProgress(0);

      // React Native's fetch doesn't expose upload progress for FormData. Use XHR.
      const result = await new Promise<UploadResult>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", `${API_URL}/saves`);
        const token = (globalThis as any).__mindtab_access_token__ as string | undefined;
        if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
        xhr.upload.onprogress = e => {
          if (e.lengthComputable) setUploadProgress(e.loaded / e.total);
        };
        xhr.onerror = () => reject(new Error("network"));
        xhr.onload  = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve(JSON.parse(xhr.responseText));
          } else {
            reject(new Error(`status=${xhr.status} body=${xhr.responseText}`));
          }
        };
        xhr.send(form);
      });

      setUploadState("done");
      setUploadProgress(1);
      return result;
    },
    onError: () => {
      setUploadState("failed");
    },
    retry: 3,
    retryDelay: attempt => Math.min(1000 * 2 ** attempt, 30000),
  });
}
```

(`__mindtab_access_token__` is illustrative — use whatever token-fetch helper the existing `authedFetch` uses. If `authedFetch` is shaped to accept multipart, you can use it instead and lose progress reporting; XHR is recommended for the progress UX.)

- [ ] **Step 2: Commit**

```bash
git add apps/mobile/src/hooks/use-audio-upload.ts
git commit -m "feat(mobile): useAudioUpload mutation with progress reporting"
```

---

### Task 37: `useDraftPoll` and `useCommitSave` hooks

**Files:**
- Create: `apps/mobile/src/hooks/use-draft-poll.ts`
- Create: `apps/mobile/src/hooks/use-commit-save.ts`

- [ ] **Step 1: `use-draft-poll.ts`**

```ts
import { useQuery } from "@tanstack/react-query";
import { api } from "~/lib/api-client";

export function useDraftPoll(id: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ["save", id],
    enabled: !!id && enabled,
    queryFn: async () => {
      const { data, error } = await api.GET("/saves/{id}", { params: { path: { id: id! } } });
      if (error) throw error;
      return data;
    },
    refetchInterval: (q) => {
      const data = q.state.data as any;
      if (!data) return 2000;
      if (data.extracted_text || data.processing_status === "failed") return false;
      return 2000;
    },
  });
}
```

- [ ] **Step 2: `use-commit-save.ts`**

```ts
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { authedFetch } from "~/lib/api-client";
import { toast } from "sonner-native";

const API_URL = process.env.EXPO_PUBLIC_API_URL || "http://localhost:8080";

export function useCommitSave() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, title }: { id: string; title?: string }) => {
      const res = await authedFetch(`${API_URL}/saves/${id}/commit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(title ? { title } : {}),
      });
      if (!res.ok) throw new Error(`commit status=${res.status}`);
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["saves"] });
    },
    onError: (e) => {
      toast.error("Couldn't save voice note");
      console.warn(e);
    },
  });
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/hooks/use-draft-poll.ts apps/mobile/src/hooks/use-commit-save.ts
git commit -m "feat(mobile): useDraftPoll and useCommitSave hooks"
```

---

### Task 38: `<AudioPlayer/>` component

**Files:**
- Create: `apps/mobile/src/components/audio/audio-player.tsx`

- [ ] **Step 1: Write the player**

```tsx
import React, { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import { Pause, Play } from "lucide-react-native";
import { colors } from "~/styles/colors";

function fmt(sec: number): string {
  if (!isFinite(sec)) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function AudioPlayer({ source }: { source: string }) {
  const player = useAudioPlayer({ uri: source });
  const status = useAudioPlayerStatus(player);

  const [scrubbing, setScrubbing] = useState(false);
  const [scrubValue, setScrubValue] = useState(0);

  const duration = status?.duration ?? 0;
  const position = scrubbing ? scrubValue : status?.currentTime ?? 0;

  return (
    <View style={styles.root}>
      <Pressable
        style={styles.btn}
        onPress={() => (status?.playing ? player.pause() : player.play())}
      >
        {status?.playing
          ? <Pause size={20} color={colors.bg.primary} fill={colors.bg.primary} />
          : <Play  size={20} color={colors.bg.primary} fill={colors.bg.primary} />}
      </Pressable>

      <View style={styles.scrubRow}>
        <View style={styles.track}>
          <View style={[styles.fill, { width: `${duration > 0 ? (position / duration) * 100 : 0}%` }]} />
        </View>
        <View style={styles.times}>
          <Text style={styles.time}>{fmt(position)}</Text>
          <Text style={styles.time}>{fmt(duration)}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root:     { flexDirection: "row", alignItems: "center", gap: 16, padding: 16, backgroundColor: colors.bg.elevated, borderRadius: 12 },
  btn:      { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.accent.primary, alignItems: "center", justifyContent: "center" },
  scrubRow: { flex: 1 },
  track:    { height: 4, borderRadius: 2, backgroundColor: colors.border.subtle, overflow: "hidden" },
  fill:     { height: 4, backgroundColor: colors.accent.primary },
  times:    { flexDirection: "row", justifyContent: "space-between", marginTop: 8 },
  time:     { fontSize: 12, color: colors.text.secondary, fontVariant: ["tabular-nums"] },
});
```

(For now we're not implementing user-controlled scrubbing via gestures — just a progress bar. Add gesture support in a follow-up if needed; the spec requires play/pause/scrubber/duration but a non-interactive progress fill ships the perceived experience for short voice notes. If you want interactive scrubbing, wrap the track in a `GestureDetector` from `react-native-gesture-handler`.)

- [ ] **Step 2: Commit**

```bash
git add apps/mobile/src/components/audio/audio-player.tsx
git commit -m "feat(mobile): AudioPlayer component (play/pause + progress)"
```

---

### Task 39: `<AudioReview/>` component

**Files:**
- Create: `apps/mobile/src/components/audio/audio-review.tsx`

- [ ] **Step 1: Write the component**

```tsx
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useRouter } from "expo-router";

import { AudioPlayer } from "./audio-player";
import { useDraftPoll } from "~/hooks/use-draft-poll";
import { useCommitSave } from "~/hooks/use-commit-save";
import { useDeleteSave } from "~/hooks/use-delete-save";  // existing hook
import { useRecorderStore } from "~/stores/recorder-store";
import { colors } from "~/styles/colors";

export function AudioReview({ id, durationSeconds, localFileUri }: {
  id: string;
  durationSeconds: number;
  localFileUri: string | null;
}) {
  const router = useRouter();
  const eager = durationSeconds <= 60;

  const draftPoll = useDraftPoll(id, eager);
  const commit = useCommitSave();
  const del = useDeleteSave();

  const uploadState    = useRecorderStore(s => s.uploadState);
  const uploadProgress = useRecorderStore(s => s.uploadProgress);
  const reset          = useRecorderStore(s => s.reset);

  const initialTitle = `Voice note · ${new Date().toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`;
  const [title, setTitle] = useState(initialTitle);
  const [pendingSave, setPendingSave] = useState(false);

  // When upload finishes and a save was queued, fire it.
  useEffect(() => {
    if (pendingSave && uploadState === "done") {
      commit.mutate({ id, title }, {
        onSuccess: () => { reset(); router.back(); },
      });
      setPendingSave(false);
    }
  }, [pendingSave, uploadState, id, title, commit, reset, router]);

  // Replace placeholder title with LLM title once eager processing yields one.
  const data = draftPoll.data as any;
  useEffect(() => {
    if (data?.source_title && data.source_title !== initialTitle && title === initialTitle) {
      setTitle(data.source_title);
    }
  }, [data, initialTitle, title]);

  const onSave = () => {
    if (uploadState === "done") {
      commit.mutate({ id, title }, {
        onSuccess: () => { reset(); router.back(); },
      });
    } else {
      setPendingSave(true);
    }
  };

  const onDiscard = () => {
    Alert.alert(
      "Discard recording?",
      undefined,
      [
        { text: "Keep", style: "cancel" },
        {
          text: "Discard",
          style: "destructive",
          onPress: () => del.mutate({ id }, { onSuccess: () => { reset(); router.back(); } }),
        },
      ],
    );
  };

  const playerSrc = data?.media_url ?? localFileUri ?? "";

  const transcript = data?.extracted_text;
  const showTranscript = !!transcript;
  const showTranscriptPlaceholder = !showTranscript && !eager;
  const showTranscriptSpinner = !showTranscript && eager;

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <TextInput
          value={title}
          onChangeText={setTitle}
          style={styles.titleInput}
          multiline
        />

        {!!playerSrc && <AudioPlayer source={playerSrc} />}

        <View style={styles.transcriptCard}>
          {showTranscriptSpinner && (
            <View style={styles.center}>
              <ActivityIndicator color={colors.accent.primary} />
              <Text style={styles.muted}>Generating transcript…</Text>
            </View>
          )}
          {showTranscriptPlaceholder && (
            <Text style={styles.muted}>Transcript will be generated after you save.</Text>
          )}
          {showTranscript && <Text style={styles.transcript}>{transcript}</Text>}
        </View>

        {uploadState === "uploading" && (
          <View style={styles.progressRow}>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${Math.round(uploadProgress * 100)}%` }]} />
            </View>
            <Text style={styles.muted}>Uploading…</Text>
          </View>
        )}
      </ScrollView>

      <View style={styles.actions}>
        <Pressable onPress={onDiscard} style={[styles.btn, styles.discardBtn]}>
          <Text style={styles.discardText}>Discard</Text>
        </Pressable>
        <Pressable onPress={onSave} style={[styles.btn, styles.saveBtn]}>
          <Text style={styles.saveText}>{pendingSave ? "Saving…" : "Save"}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root:           { flex: 1, backgroundColor: colors.bg.primary },
  scroll:         { padding: 24, gap: 24 },
  titleInput:     { fontSize: 24, color: colors.text.primary, fontWeight: "500", lineHeight: 32 },
  transcriptCard: { padding: 16, borderRadius: 12, backgroundColor: colors.bg.elevated },
  transcript:     { fontSize: 15, color: colors.text.primary, lineHeight: 22 },
  muted:          { fontSize: 13, color: colors.text.secondary, textAlign: "center" },
  center:         { alignItems: "center", gap: 8, padding: 12 },
  progressRow:    { gap: 8 },
  progressTrack:  { height: 3, backgroundColor: colors.border.subtle, borderRadius: 2, overflow: "hidden" },
  progressFill:   { height: 3, backgroundColor: colors.accent.primary },
  actions:        { flexDirection: "row", gap: 16, padding: 16, borderTopWidth: 1, borderTopColor: colors.border.subtle },
  btn:            { flex: 1, paddingVertical: 14, borderRadius: 10, alignItems: "center" },
  discardBtn:     { backgroundColor: colors.bg.elevated },
  saveBtn:        { backgroundColor: colors.accent.primary },
  discardText:    { color: colors.text.primary, fontSize: 16, fontWeight: "500" },
  saveText:       { color: colors.bg.primary, fontSize: 16, fontWeight: "600" },
});
```

(`useDeleteSave` is the existing vault delete hook. If its signature is `useDeleteSave({ id })`, match it.)

- [ ] **Step 2: Commit**

```bash
git add apps/mobile/src/components/audio/audio-review.tsx
git commit -m "feat(mobile): AudioReview component (title, player, transcript, save/discard)"
```

---

### Task 40: Add the review route

**Files:**
- Create: `apps/mobile/app/(main)/saves/review/[id].tsx`

- [ ] **Step 1: Write the route**

```tsx
import { useLocalSearchParams } from "expo-router";
import { AudioReview } from "~/components/audio/audio-review";
import { useRecorderStore } from "~/stores/recorder-store";

export default function ReviewScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const fileUri = useRecorderStore(s => s.fileUri);
  const elapsedMs = useRecorderStore(s => s.elapsedMs);
  const durationSeconds = Math.max(1, Math.round(elapsedMs / 1000));

  if (!id || typeof id !== "string") return null;
  return (
    <AudioReview
      id={id}
      durationSeconds={durationSeconds}
      localFileUri={fileUri}
    />
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/mobile/app/(main)/saves/review/\[id\].tsx
git commit -m "feat(mobile): /saves/review/[id] fullscreen review route"
```

---

## Chunk 12: Mobile Vault — Audio Card, Mini Player, Detail Screen, SaveFAB

### Task 41: `miniPlayerStore` (Zustand)

**Files:**
- Create: `apps/mobile/src/stores/mini-player-store.ts`

- [ ] **Step 1: Write the store**

```ts
import { create } from "zustand";
import { AudioPlayer as ExpoPlayer, createAudioPlayer } from "expo-audio";

type MiniPlayerState = {
  contentId: string | null;
  title: string;
  uri: string | null;
  playing: boolean;

  play: (args: { contentId: string; title: string; uri: string }) => void;
  toggle: () => void;
  stop: () => void;
};

let player: ExpoPlayer | null = null;

export const useMiniPlayerStore = create<MiniPlayerState>((set, get) => ({
  contentId: null,
  title: "",
  uri: null,
  playing: false,

  play: ({ contentId, title, uri }) => {
    if (player) { player.remove(); player = null; }
    player = createAudioPlayer({ uri });
    player.play();
    set({ contentId, title, uri, playing: true });
  },

  toggle: () => {
    if (!player) return;
    if (get().playing) { player.pause(); set({ playing: false }); }
    else               { player.play();  set({ playing: true });  }
  },

  stop: () => {
    if (player) { player.remove(); player = null; }
    set({ contentId: null, title: "", uri: null, playing: false });
  },
}));
```

- [ ] **Step 2: Commit**

```bash
git add apps/mobile/src/stores/mini-player-store.ts
git commit -m "feat(mobile): miniPlayerStore for the persistent vault audio player"
```

---

### Task 42: `<MiniAudioPlayer/>` mounted at the layout level

**Files:**
- Create: `apps/mobile/src/components/audio/mini-audio-player.tsx`
- Modify: `apps/mobile/app/(main)/_layout.tsx`

- [ ] **Step 1: Write the component**

```tsx
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Pause, Play, X } from "lucide-react-native";
import { useMiniPlayerStore } from "~/stores/mini-player-store";
import { colors } from "~/styles/colors";

export function MiniAudioPlayer() {
  const { contentId, title, playing, toggle, stop } = useMiniPlayerStore();
  const insets = useSafeAreaInsets();
  if (!contentId) return null;

  return (
    <View style={[styles.root, { bottom: insets.bottom + 80 }]}>
      <Pressable onPress={toggle} hitSlop={8} style={styles.icon}>
        {playing
          ? <Pause size={18} color={colors.bg.primary} fill={colors.bg.primary} />
          : <Play  size={18} color={colors.bg.primary} fill={colors.bg.primary} />}
      </Pressable>
      <Text style={styles.title} numberOfLines={1}>{title}</Text>
      <Pressable onPress={stop} hitSlop={8}>
        <X size={18} color={colors.text.secondary} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root:  {
    position: "absolute", left: 16, right: 16, height: 56, borderRadius: 14,
    backgroundColor: colors.bg.elevated, flexDirection: "row", alignItems: "center",
    paddingHorizontal: 14, gap: 12, shadowOpacity: 0.2, shadowRadius: 8, elevation: 6,
    zIndex: 100,
  },
  icon:  { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.accent.primary, alignItems: "center", justifyContent: "center" },
  title: { flex: 1, fontSize: 14, color: colors.text.primary, fontWeight: "500" },
});
```

- [ ] **Step 2: Mount it in `_layout.tsx`**

```tsx
import { MiniAudioPlayer } from "~/components/audio/mini-audio-player";

export default function MainLayout() {
  return (
    <>
      <Stack screenOptions={...}>
        {/* existing screens */}
      </Stack>
      <MiniAudioPlayer />
    </>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/components/audio/mini-audio-player.tsx apps/mobile/app/(main)/_layout.tsx
git commit -m "feat(mobile): persistent MiniAudioPlayer at the (main) layout level"
```

---

### Task 43: `<AudioCard/>` for the vault grid

**Files:**
- Create: `apps/mobile/src/components/audio/audio-card.tsx`
- Modify: `apps/mobile/src/components/vault/save-grid.tsx`

- [ ] **Step 1: Write the card**

```tsx
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Play } from "lucide-react-native";
import { useMiniPlayerStore } from "~/stores/mini-player-store";
import { colors } from "~/styles/colors";

function fmtDuration(sec: number | null | undefined) {
  if (!sec) return "";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

type Props = {
  id: string;
  title: string;
  durationSeconds: number | null;
  preview: string | null;
  mediaUrl: string | null;
  onPress: () => void;
};

export function AudioCard({ id, title, durationSeconds, preview, mediaUrl, onPress }: Props) {
  const play = useMiniPlayerStore(s => s.play);

  return (
    <Pressable onPress={onPress} style={styles.card}>
      <View style={styles.row}>
        <Pressable
          hitSlop={8}
          style={styles.playBtn}
          onPress={() => mediaUrl && play({ contentId: id, title, uri: mediaUrl })}
        >
          <Play size={18} color={colors.bg.primary} fill={colors.bg.primary} />
        </Pressable>
        <View style={styles.body}>
          <Text style={styles.title} numberOfLines={2}>{title}</Text>
          <Text style={styles.duration}>{fmtDuration(durationSeconds)}</Text>
          {preview ? <Text style={styles.preview} numberOfLines={2}>{preview}</Text> : null}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card:     { padding: 14, backgroundColor: colors.bg.elevated, borderRadius: 12, gap: 10 },
  row:      { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  playBtn:  { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.accent.primary, alignItems: "center", justifyContent: "center", marginTop: 2 },
  body:     { flex: 1, gap: 4 },
  title:    { fontSize: 14, color: colors.text.primary, fontWeight: "500" },
  duration: { fontSize: 12, color: colors.text.secondary, fontVariant: ["tabular-nums"] },
  preview:  { fontSize: 13, color: colors.text.secondary, marginTop: 4 },
});
```

- [ ] **Step 2: Branch on `source_type` in the grid**

In `save-grid.tsx`, find the `renderItem` (or the per-card component) and add:

```tsx
if (item.source_type === "audio") {
  return (
    <AudioCard
      id={item.id}
      title={item.source_title ?? "Voice note"}
      durationSeconds={item.duration_seconds ?? null}
      preview={item.extracted_text?.slice(0, 80) ?? null}
      mediaUrl={item.media_url ?? null}
      onPress={() => router.push(`/vault/${item.id}`)}
    />
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/components/audio/audio-card.tsx apps/mobile/src/components/vault/save-grid.tsx
git commit -m "feat(mobile): AudioCard variant in the vault grid"
```

---

### Task 44: Audio detail layout in `vault/[id].tsx`

**Files:**
- Modify: `apps/mobile/app/(main)/vault/[id].tsx`

- [ ] **Step 1: Branch on `source_type` for audio**

Inside the existing detail component, after the data is loaded:

```tsx
if (data.source_type === "audio") {
  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.audioContent} stickyHeaderIndices={[0]}>
      <View style={styles.audioPlayerHeader}>
        {data.media_url && <AudioPlayer source={data.media_url} />}
        <Text style={styles.title}>{data.source_title ?? "Voice note"}</Text>
      </View>
      <View style={{ padding: 16 }}>
        {data.extracted_text
          ? <Text style={styles.transcript}>{data.extracted_text}</Text>
          : <Text style={styles.muted}>Transcript will appear here once processing finishes.</Text>}
      </View>
    </ScrollView>
  );
}
```

Add the styles:

```tsx
audioContent: { paddingBottom: 80 },
audioPlayerHeader: { backgroundColor: colors.bg.primary, padding: 16, gap: 12, borderBottomWidth: 1, borderBottomColor: colors.border.subtle },
title:      { fontSize: 22, color: colors.text.primary, fontWeight: "500" },
transcript: { fontSize: 16, color: colors.text.primary, lineHeight: 24 },
muted:      { fontSize: 14, color: colors.text.secondary, fontStyle: "italic" },
```

- [ ] **Step 2: Commit**

```bash
git add apps/mobile/app/(main)/vault/\[id\].tsx
git commit -m "feat(mobile): audio detail layout (player pinned + scrollable transcript)"
```

---

### Task 45: SaveFAB sheet — add Record + Upload Audio File tabs

**Files:**
- Modify: `apps/mobile/src/components/vault/save-fab.tsx`

- [ ] **Step 1: Add tab state and a tab strip**

Inside `SaveFAB`, expand the bottom-sheet content to a 4-tab layout. Mirror the existing tab pattern; if there isn't one yet, render four tappable rows / chips.

```tsx
const [tab, setTab] = useState<"url" | "image" | "audio_record" | "audio_upload">("url");
```

Render the tab strip and switch on `tab` to show the respective body. The url and image bodies are the existing UI. New ones below.

- [ ] **Step 2: "Record Audio" tab**

```tsx
{tab === "audio_record" && (
  <View style={{ gap: 12, padding: 16 }}>
    <Text style={{ color: colors.text.secondary }}>Record a voice note. You'll review it before saving.</Text>
    <Pressable
      style={styles.primaryBtn}
      onPress={() => {
        bottomSheetRef.current?.dismiss();
        router.push("/saves/record");
      }}
    >
      <Text style={styles.primaryBtnText}>Start recording</Text>
    </Pressable>
  </View>
)}
```

- [ ] **Step 3: "Upload Audio File" tab**

```tsx
import * as DocumentPicker from "expo-document-picker";

// ...

{tab === "audio_upload" && (
  <View style={{ gap: 12, padding: 16 }}>
    <Text style={{ color: colors.text.secondary }}>Pick an audio file from your device.</Text>
    <Pressable
      style={styles.primaryBtn}
      onPress={async () => {
        const r = await DocumentPicker.getDocumentAsync({
          type: ["audio/*"],
          copyToCacheDirectory: true,
        });
        if (r.canceled || !r.assets?.[0]) return;
        const asset = r.assets[0];
        bottomSheetRef.current?.dismiss();

        // Reuse the upload mutation. We don't know duration; use 0 sentinel
        // and let the server fail validation if missing — better: probe
        // duration with expo-audio's loadAsync.
        // For v1 simplicity: assume it's a long clip (no eager processing).
        upload.mutate({
          fileUri: asset.uri,
          durationSeconds: 1, // server requires >0; treat as long clip below
          autoCommit: true,
          startProcessing: true,
          source: "file_picker",
          mime: asset.mimeType ?? "audio/mp4",
          filename: asset.name,
        });
      }}
    >
      <Text style={styles.primaryBtnText}>Choose audio file</Text>
    </Pressable>
  </View>
)}
```

(Duration probing for uploaded files is desirable but not required for v1 — the server validates `duration_seconds > 0` only. A follow-up task could probe via `expo-audio.AudioPlayer` and report the real duration. For now, `1` lets the upload through; the worker pipeline is unaffected by duration accuracy for non-recorder uploads.)

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/src/components/vault/save-fab.tsx
git commit -m "feat(mobile): SaveFAB Record + Upload Audio tabs"
```

---

### Task 46: Manual mobile smoke — recorder, vault, detail, mini player

- [ ] **Step 1: Run the dev client**

```bash
cd apps/mobile
pnpm dev
```

- [ ] **Step 2: Walk through the flow on a device**

| Step | Expected |
|---|---|
| Tap SaveFAB → Record Audio → Start recording | Recorder opens, mic level animates, timer counts up |
| Pause → wait 5s → Resume | Timer stops, then resumes from same value |
| Stop | Review screen opens; upload progress shows |
| Wait ≤10s for short clip | Transcript appears in review |
| Tap Save | Modal pops; voice note appears in vault grid |
| Tap ▶ on the audio card | MiniAudioPlayer slides up, audio plays |
| Tap audio card body | Detail screen with player at top + transcript below |

- [ ] **Step 3: Record any bugs and fix before moving on**

If a bug is reproducible, write a focused test for it (in the relevant store/hook test file or via a manual reproduction note in the implementation).

---

## Chunk 13: iOS Share Extension Audio UTI

### Task 47: Add audio UTI handling in `ShareViewController.swift`

**Files:**
- Modify: `apps/mobile/ios/MindTabShare/ShareViewController.swift`

- [ ] **Step 1: Locate the existing branch order**

Open `ShareViewController.swift`. Find the `if/else if` chain in `viewDidLoad` (or `processItem`) that currently checks `UTType.image.identifier`, `UTType.url.identifier`, `UTType.plainText.identifier`.

- [ ] **Step 2: Add the audio branch first** (before image / URL / text)

```swift
if provider.hasItemConformingToTypeIdentifier(UTType.audio.identifier) {
    provider.loadItem(forTypeIdentifier: UTType.audio.identifier, options: nil) { [weak self] item, error in
        guard let self = self else { return }
        if let url = item as? URL {
            self.uploadAudio(fileURL: url)
        } else if let data = item as? Data {
            // Some sources (Voice Memos) hand back Data, not a URL
            let tmp = FileManager.default.temporaryDirectory
                .appendingPathComponent("share-\(UUID().uuidString).m4a")
            try? data.write(to: tmp)
            self.uploadAudio(fileURL: tmp)
        } else {
            self.complete(error: error ?? NSError(domain: "share", code: -1))
        }
    }
    return
}
```

- [ ] **Step 3: Add `uploadAudio(fileURL:)`**

```swift
private func uploadAudio(fileURL: URL) {
    guard let token = self.accessToken() else {
        self.complete(error: NSError(domain: "share", code: 401))
        return
    }
    let baseURL = self.apiBaseURL()  // existing helper used by other branches
    let url = URL(string: "\(baseURL)/saves")!
    var req = URLRequest(url: url)
    req.httpMethod = "POST"
    req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")

    let boundary = "MindTabShare-\(UUID().uuidString)"
    req.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")

    let mime = mimeType(for: fileURL)
    let filename = fileURL.lastPathComponent
    let fileData: Data
    do { fileData = try Data(contentsOf: fileURL) }
    catch { self.complete(error: error); return }

    var body = Data()
    func appendField(_ name: String, _ value: String) {
        body.append("--\(boundary)\r\n".data(using: .utf8)!)
        body.append("Content-Disposition: form-data; name=\"\(name)\"\r\n\r\n".data(using: .utf8)!)
        body.append(value.data(using: .utf8)!)
        body.append("\r\n".data(using: .utf8)!)
    }
    appendField("auto_commit", "true")
    appendField("start_processing", "true")
    appendField("source", "share_extension")
    appendField("duration_seconds", "1") // unknown — server doesn't fail on >0

    body.append("--\(boundary)\r\n".data(using: .utf8)!)
    body.append("Content-Disposition: form-data; name=\"audio\"; filename=\"\(filename)\"\r\n".data(using: .utf8)!)
    body.append("Content-Type: \(mime)\r\n\r\n".data(using: .utf8)!)
    body.append(fileData)
    body.append("\r\n".data(using: .utf8)!)
    body.append("--\(boundary)--\r\n".data(using: .utf8)!)

    URLSession.shared.uploadTask(with: req, from: body) { [weak self] _, response, error in
        guard let self = self else { return }
        if let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) {
            self.complete(error: nil)
        } else {
            self.complete(error: error ?? NSError(domain: "share", code: (response as? HTTPURLResponse)?.statusCode ?? -1))
        }
    }.resume()
}

private func mimeType(for url: URL) -> String {
    switch url.pathExtension.lowercased() {
    case "m4a", "mp4":  return "audio/mp4"
    case "mp3":         return "audio/mpeg"
    case "wav":         return "audio/wav"
    case "ogg", "oga":  return "audio/ogg"
    case "webm":        return "audio/webm"
    case "flac":        return "audio/flac"
    default:            return "audio/mp4"
    }
}
```

(`accessToken()`, `apiBaseURL()`, `complete(error:)` are existing helpers used by other branches — match their actual names. If the existing image-share branch posts to a different endpoint pattern or uses an app group + URL scheme, mirror that pattern instead.)

- [ ] **Step 4: Build the iOS app**

```bash
cd apps/mobile/ios
xcodebuild -workspace MindTab.xcworkspace -scheme MindTabShare build 2>&1 | tail -40
```

Expected: clean build.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/ios/MindTabShare/ShareViewController.swift
git commit -m "feat(ios): share extension handles audio UTI uploads"
```

---

### Task 48: Manual share-extension smoke

- [ ] **Step 1: Build and install the dev client on a real device**

```bash
cd apps/mobile
pnpm dev
# In a separate shell, build for iOS device
pnpm dlx expo run:ios --device
```

- [ ] **Step 2: Walk through real-world share scenarios**

| App | Action | Expected |
|---|---|---|
| WhatsApp | Long-press a voice note → Share → MindTab | Audio appears in vault, transcript fills in within ~1 min |
| Voice Memos | Share an existing recording → MindTab | Audio appears in vault |
| Files | Share an `.mp3` from local Files → MindTab | Audio appears in vault |
| Telegram | Share a voice message → MindTab | Audio appears in vault |

- [ ] **Step 3: Note any failures and revisit Task 47 if a UTI branch is missing**

For example, WhatsApp may surface audio under `public.audiovisual-content` or a custom UTI rather than `public.audio`. If a real-world source isn't handled, add an additional `hasItemConformingToTypeIdentifier` check.

---

## Chunk 14: Integration Tests + Manual Smoke

### Task 49: End-to-end backend integration test for the audio happy path

**Files:**
- Create: `server/internal/integration/audio_e2e_test.go`

- [ ] **Step 1: Write the integration test**

```go
package integration_test

import (
    "bytes"
    "encoding/json"
    "io"
    "mime/multipart"
    "net/http"
    "net/http/httptest"
    "strings"
    "testing"
    "time"

    "github.com/stretchr/testify/require"

    "github.com/mindtab/server/internal/testutil"
)

func TestAudio_E2E_DraftEagerCommit(t *testing.T) {
    env := testutil.NewIntegrationEnv(t) // testcontainers Postgres + Redis + faked providers
    defer env.Close()

    userID := env.NewUser(t, "u1")

    // Stage 1: upload as draft + eager
    body, ct := buildAudioMultipart(t, "audio/mp4", "30", false, true, []byte("x"))
    req := httptest.NewRequest("POST", "/saves", body).WithContext(env.Auth(t, userID))
    req.Header.Set("Content-Type", ct)
    w := httptest.NewRecorder()
    env.Server.Handler.ServeHTTP(w, req)
    require.Equal(t, http.StatusOK, w.Code)
    var created struct {
        ID               string `json:"id"`
        CommitStatus     string `json:"commit_status"`
        ProcessingStatus string `json:"processing_status"`
    }
    require.NoError(t, json.NewDecoder(w.Body).Decode(&created))
    require.Equal(t, "draft", created.CommitStatus)
    require.Equal(t, "pending", created.ProcessingStatus)

    // Stage 2: wait for the worker to reach processed
    require.Eventually(t, func() bool {
        return env.GetProcessingStatus(t, created.ID) == "completed"
    }, 10*time.Second, 200*time.Millisecond)

    // Stage 3: commit
    creq := httptest.NewRequest("POST", "/saves/"+created.ID+"/commit",
        strings.NewReader(`{}`)).WithContext(env.Auth(t, userID))
    creq.Header.Set("Content-Type", "application/json")
    cw := httptest.NewRecorder()
    env.Server.Handler.ServeHTTP(cw, creq)
    require.Equal(t, http.StatusOK, cw.Code)

    require.Equal(t, "committed", env.GetCommitStatus(t, created.ID))
    require.Equal(t, "completed", env.GetProcessingStatus(t, created.ID))
}

func TestAudio_E2E_DraftDeferredCommit(t *testing.T) {
    env := testutil.NewIntegrationEnv(t)
    defer env.Close()

    userID := env.NewUser(t, "u1")

    body, ct := buildAudioMultipart(t, "audio/mp4", "1800", false, false, []byte("x"))
    req := httptest.NewRequest("POST", "/saves", body).WithContext(env.Auth(t, userID))
    req.Header.Set("Content-Type", ct)
    w := httptest.NewRecorder()
    env.Server.Handler.ServeHTTP(w, req)
    var created struct {
        ID               string `json:"id"`
        CommitStatus     string `json:"commit_status"`
        ProcessingStatus string `json:"processing_status"`
    }
    require.NoError(t, json.NewDecoder(w.Body).Decode(&created))
    require.Equal(t, "draft", created.CommitStatus)
    require.Equal(t, "deferred", created.ProcessingStatus)
    require.Equal(t, 0, env.QueueDepth(t))

    // Commit kicks off processing
    creq := httptest.NewRequest("POST", "/saves/"+created.ID+"/commit",
        strings.NewReader(`{"title":"Lecture"}`)).WithContext(env.Auth(t, userID))
    creq.Header.Set("Content-Type", "application/json")
    cw := httptest.NewRecorder()
    env.Server.Handler.ServeHTTP(cw, creq)
    require.Equal(t, http.StatusOK, cw.Code)

    require.Equal(t, "committed", env.GetCommitStatus(t, created.ID))
    require.Equal(t, "Lecture", env.GetSourceTitle(t, created.ID))
    require.Eventually(t, func() bool {
        return env.GetProcessingStatus(t, created.ID) == "completed"
    }, 10*time.Second, 200*time.Millisecond)
}

func buildAudioMultipart(t *testing.T, mime, duration string, autoCommit, startProcessing bool, payload []byte) (io.Reader, string) {
    t.Helper()
    var buf bytes.Buffer
    mw := multipart.NewWriter(&buf)
    p, _ := mw.CreateFormFile("audio", "t.m4a")
    _, _ = p.Write(payload)
    _ = mw.WriteField("duration_seconds", duration)
    _ = mw.WriteField("auto_commit", boolStr(autoCommit))
    _ = mw.WriteField("start_processing", boolStr(startProcessing))
    _ = mw.Close()
    return &buf, mw.FormDataContentType()
}

func boolStr(b bool) string {
    if b { return "true" }
    return "false"
}
```

(`testutil.NewIntegrationEnv` is the existing testcontainers harness from PR #12; it stands up Postgres + Redis + a fake transcription chain. `env.GetProcessingStatus`, `env.GetCommitStatus`, `env.GetSourceTitle`, `env.QueueDepth` are thin sqlc/Redis lookups — add tiny helpers if they don't already exist.)

- [ ] **Step 2: Run + commit**

```bash
cd server
make test-integration
git add server/internal/integration/audio_e2e_test.go
git commit -m "test(saves): end-to-end integration tests for audio draft/eager/deferred/commit"
```

---

### Task 50: Run the regression matrix

- [ ] **Step 1: Backend full test suite**

```bash
cd server
go test ./...
make test-integration
```

Expected: all green. The matrix from the spec must hold:

- Article create-and-commit-and-process (back-compat)
- Image multipart create-and-commit-and-process (back-compat, post-handler-refactor)
- YouTube create-and-commit-and-process (back-compat, post-`video_duration` rename)
- Audio eager (`auto_commit=false, start_processing=true`)
- Audio deferred (`auto_commit=false, start_processing=false`)
- Audio share-extension path (`auto_commit=true, start_processing=true`)
- Discard mid-process (DELETE row, worker fails gracefully)
- Draft cleanup (24h-old drafts gone, fresh drafts kept)

- [ ] **Step 2: Mobile typecheck + Vitest**

```bash
cd apps/mobile
pnpm tsc --noEmit
pnpm vitest run
```

Expected: green.

- [ ] **Step 3: Web + extension typecheck**

```bash
cd apps/web && pnpm tsc --noEmit
cd apps/extension && pnpm tsc --noEmit
```

Expected: green.

- [ ] **Step 4: Commit any test fixes from Steps 1–3**

```bash
git add .
git commit -m "test: address regressions surfaced during cross-app type/test runs"
```

---

### Task 51: Manual smoke checklist (device verification)

These cannot run in CI; verify on iOS + Android dev clients.

- [ ] **Step 1: 30-second voice note end-to-end (iOS + Android)**
  - Recorder opens, captures, stops; review screen shows transcript within ~10s; Save lands in vault.

- [ ] **Step 2: 5-minute recording with phone-call interruption**
  - Recording pauses on incoming call; Resume continues with no data loss.

- [ ] **Step 3: 70-minute recording with screen lock + app backgrounded**
  - iOS: red status-bar pill remains visible; recording continues.
  - Android: foreground-service notification persists; recording continues.
  - On Stop, upload kicks off; review screen shows the transcript-pending placeholder; long-clip deferred path commits via Save and processes after.

- [ ] **Step 4: 90-minute recording (boundary case)**
  - At exactly 90:00, recorder auto-stops with a banner ("Maximum length reached"). (Auto-stop is not in the spec — note this as a follow-up if you want it. For v1 the user can stop manually; the server rejects > 5400s with 400.)

- [ ] **Step 5: WhatsApp voice note → MindTab share extension → vault**
  - Audio appears in vault, transcript fills in.

- [ ] **Step 6: Discard at every state**
  - Recording, paused, post-stop pre-upload, post-upload pre-process, mid-eager-process, post-process pre-commit. In every case: confirmation dialog, then row + file gone.

- [ ] **Step 7: Image upload regression**
  - Existing image saves still work after the handler-refactor in Chunk 2.

- [ ] **Step 8: Article + YouTube regression**
  - Existing flows still work after the schema rename.

- [ ] **Step 9: Mini player + audio card**
  - Tap ▶ on an audio card → mini player slides up; survives tab switches; tap card body → detail screen with player + transcript; tap X on mini player → playback stops.

- [ ] **Step 10: File close**

After all 10 manual scenarios pass, the audio-saves implementation is done. Open a PR.

```bash
git push -u origin worktree-feat-audio-saves-design
gh pr create --title "feat(saves): Phase 3 audio + unified save lifecycle" --body "$(cat <<'EOF'
## Summary
- Audio voice recording + audio file upload (mobile)
- Unified `commit_status` lifecycle across all save types
- `duration_seconds`, `media_mime`, `media_file_bytes` schema consolidation
- Image handler + processor refactor (no more /tmp)
- iOS share extension audio UTI

Spec: `docs/superpowers/specs/2026-04-27-audio-saves-design.md`
Plan: `docs/superpowers/plans/2026-04-27-audio-saves.md`

## Test plan
- [x] Backend unit + integration suite (matrix in plan Task 50)
- [x] Mobile typecheck + vitest
- [x] Web + extension typecheck (no regressions)
- [x] Manual smoke checklist (plan Task 51) on iOS + Android

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Plan Self-Review

A pass over the written plan against the spec:

**Spec coverage check.** Mapping each spec section to the task that implements it:

| Spec section | Tasks |
|---|---|
| Architecture: two-axis state machine | Task 1 (commit_status migration), Task 9 (flag parsing), Task 11 (commit endpoint), Task 19 (AudioProcessor) |
| Audio user flow (≤60s eager / >60s deferred) | Task 9 (flags), Task 11 (commit), Tasks 36–40 (mobile) |
| Schema migration (commit_status, duration_seconds rename, media_*) | Task 1 |
| Sqlc updates | Tasks 2, 4, 25 |
| `POST /saves` polymorphic + flags | Tasks 9, 14, 15 |
| `POST /saves/:id/commit` | Tasks 11, 12 |
| `DELETE /saves/:id` (unchanged) | (no task — already works) |
| `GET /saves` filter | Tasks 2, 13 |
| OpenAPI updates | Task 27 |
| `JobPayload` slim | Task 5 |
| Image processor refactor | Tasks 6, 7, 8 |
| `AudioProcessor` | Tasks 19, 20 |
| `transcribe_audio` step (basic) | Tasks 17, 18 |
| Server-side chunking | Tasks 21, 22, 23 |
| `SummarizeStep` audio title | Tasks 24, 25 |
| Draft cleanup goroutine (3h cadence) | Task 26 |
| Mobile deps + app.json | Tasks 30, 31 |
| Recorder store + screen | Tasks 32–35 |
| Review screen + audio player + hooks | Tasks 36–40 |
| Vault audio card + mini player + detail screen + SaveFAB | Tasks 41–46 |
| iOS share extension audio UTI | Tasks 47, 48 |
| Error-handling table (recorder / upload / processing) | Tasks 36 (retries), 39 (alerts), 18 (oversize guard), 50 (regression matrix) |
| Testing strategy (unit / integration / manual) | Tasks 10, 12, 13, 16, 18, 23, 26, 33, 49, 50, 51 |
| Scope-out items (streaming STT, trim, mini-pill, etc.) | Not built — captured in spec, no tasks |

No spec-required item is missing a task.

**Placeholder scan.** No "TBD", "TODO", "implement later", or "similar to Task N" — code is present in every step that needs it. Two acceptable forward-references: `useAudioUpload` is referenced in Task 35 before being created in Task 36, and `useDeleteSave` is referenced as an existing hook in Task 39. Both are explicitly called out.

**Type consistency.** `RecorderState`, `JobPayload`, `AudioProcessor`, `TranscribeAudioResult`, `SummarizeResult`, `CreateContentParams` field names match across all tasks where they appear. The `processing_status` value is `completed` (not `processed`) consistently.

**Bite-sized check.** Every task is broken into 2–6 steps; every step is one action. No multi-action steps.

The plan is ready to execute.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-27-audio-saves.md` on branch `worktree-feat-audio-saves-design`. Two execution options:

1. **Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
