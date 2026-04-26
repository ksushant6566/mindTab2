# Audio Saves & Unified Save Lifecycle — Design Spec

**Phase:** Saves Phase 3 (audio half — Reels follows separately)
**Goal:** Add voice-recording and audio-file saves to MindTab Mobile, and harmonize the saves lifecycle so every current and future source type goes through one consistent create-and-commit flow.
**Spec source:** Brainstorm session, 2026-04-25 to 2026-04-27.
**Predecessors:** `docs/superpowers/specs/2026-03-12-saves-feature-design.md` (Phase 1), `docs/superpowers/specs/2026-03-30-youtube-saves-design.md` (Phase 2).

---

## Why this spec covers more than audio

The audio feature requires a "draft → review → commit" lifecycle that doesn't exist today. Bolting that lifecycle on for audio alone would leave article, image, and YouTube saves on the legacy create-and-commit-immediately model — a permanent inconsistency that future source types (Reels, audio-file uploads via share extension, anything else) would have to choose sides on.

The design therefore unifies the lifecycle across all source types as a precondition for adding audio. The unification is backward-compatible: existing callers that send no new flags get exactly today's behavior.

Two layers of cleanup land alongside audio:

- **Layer 2 (lifecycle):** every save has an orthogonal `commit_status` ∈ {draft, committed} alongside its existing `processing_status`. `POST /saves` becomes polymorphic with optional `auto_commit` and `start_processing` flags. New `POST /saves/:id/commit` endpoint flips drafts to committed and (if needed) enqueues processing.
- **Layer 3 (schema consolidation):** `video_duration` renamed to `duration_seconds`; new generic `media_mime` and `media_file_bytes` replace what would have been audio-specific columns. Reels (next phase) and any future media type reuse them.

---

## Architecture

Two orthogonal axes on every save row:

```
   commit_status:    draft ─────────► committed
                     (invisible        (visible in vault)
                      to vault)

   processing_status: deferred ──► pending ──► processing ──► processed
                                                                  │
                                                                  └──► failed
```

The two move independently. Vault filter is `WHERE commit_status='committed'`. The worker pipeline only cares about `processing_status`.

`deferred` is a new initial value used **only** when a save is created with `start_processing=false`. It means "the row exists but no job has been enqueued yet, and won't be until something flips it." Existing values (`pending`, `processing`, `processed`, `failed`) are unchanged in meaning. Existing rows are unaffected — no row ever gets implicitly demoted to `deferred`.

### Audio user flow

```
┌──────────────┐   ≤60s clip: client calls POST /saves with
│  Recorder    │              auto_commit=false, start_processing=true
│  screen      │   >60s clip: client calls POST /saves with
└──────┬───────┘              auto_commit=false, start_processing=false
       │
       │  upload runs in background; multipart file streams to
       │  permanent storage at {user_id}/{content_id}/audio.{ext}
       ▼
┌──────────────┐
│   Review     │   ≤60s: backend transcribes → summarizes → embeds → stores
│   screen     │           on the row; commit_status stays 'draft'.
│              │           Client polls GET /saves/:id, transcript appears.
│              │   >60s: row sits as draft; no processing yet.
└──────┬───────┘
       │
       │ Save tap → POST /saves/:id/commit
       │   • flips commit_status → 'committed'
       │   • if processing hasn't started yet (>60s case),
       │     enqueues a job now
       │   • applies optional title override
       ▼
   Vault grid (compact audio card) ── play ──> persistent mini player
                                   └─ tap ──> Detail screen
```

Discard at any state: `DELETE /saves/:id`. Removes row + media file. Any in-flight worker fails harmlessly on the next row write.

### Concrete deliverables

1. **Schema migration** adding `commit_status`, renaming `video_duration → duration_seconds`, adding `media_mime` + `media_file_bytes`.
2. **`POST /saves`** — single polymorphic endpoint (multipart or JSON) with two new flags.
3. **`POST /saves/:id/commit`** — flips draft → committed, enqueues if not yet processing.
4. **Image processor refactored** — handler streams directly to permanent storage; processor's `save` step is removed.
5. **`JobPayload` slimmed** — only carries `ContentID`; processors look the rest up from the row.
6. **`AudioProcessor`** — new processor with steps `[transcribe, summarize, embed, store]`. Server-side ffmpeg silence-aware chunking handles audio above the Whisper 25 MB ceiling.
7. **Mobile** — recorder screen, review screen, audio card, persistent mini player, audio-aware vault detail screen; new dependencies `expo-audio` and `expo-document-picker`.
8. **iOS share extension** — audio UTI handling, lands committed via `POST /saves`.
9. **Draft cleanup goroutine** — runs every 3 hours; deletes drafts older than 24h.

---

## Data model

### Migration `000006_unified_save_lifecycle.up.sql`

```sql
-- Layer 2: per-row commit lifecycle
ALTER TABLE mindmap_content
    ADD COLUMN commit_status TEXT NOT NULL DEFAULT 'committed';
-- Valid values: 'draft' | 'committed'

-- Layer 3: source-type-agnostic columns
ALTER TABLE mindmap_content
    RENAME COLUMN video_duration TO duration_seconds;

ALTER TABLE mindmap_content
    ADD COLUMN media_mime       TEXT,
    ADD COLUMN media_file_bytes BIGINT;

-- Partial index for the 3-hourly draft cleanup
CREATE INDEX idx_mindmap_content_drafts
    ON mindmap_content (updated_at)
    WHERE commit_status = 'draft';
```

Down migration is the reverse: drop the index, drop `media_mime` and `media_file_bytes`, rename `duration_seconds` back to `video_duration`, drop `commit_status`. Existing rows default to `'committed'` so the migration is observably a no-op for current data.

### Per-source-type column usage (post-Layer 3)

| Column | Article | Image | YouTube | Audio |
|---|---|---|---|---|
| `source_url` | URL | NULL | URL | NULL |
| `media_key` | NULL | path | NULL | path |
| `media_mime` | NULL | "image/png" etc. | NULL | "audio/mp4" etc. |
| `media_file_bytes` | NULL | size | NULL | size |
| `duration_seconds` | NULL | NULL | yt duration | recording duration |
| `transcript_source` | NULL | NULL | "captions" / "whisper" | "whisper" |
| `extracted_text` | article body | NULL | transcript | transcript |
| `visual_description` | NULL | vision result | per-frame summary | NULL |

### Sqlc query updates

Every existing query that selects `video_duration` is updated to `duration_seconds` (mechanical, compiler-checked). Every query that lists/counts saves for a user gains `AND commit_status = 'committed'`. New queries for the audio flow:

- `CreateContent` insert helpers gain `commit_status` parameter (defaults to `'committed'`).
- `UpdateContentCommitStatus(id, commit_status, title?)` — used by the commit endpoint.
- `DeleteExpiredDrafts(cutoff)` — used by the cleanup goroutine.

---

## API surface

### `POST /saves` (polymorphic)

Routes on `Content-Type`:
- `application/json` → URL-based saves (article, YouTube — auto-routed by URL inspection, unchanged)
- `multipart/form-data` → file-based saves (image, audio)

Request fields (across forms):

| Field | Default | Notes |
|---|---|---|
| `auto_commit` | `true` | If `false`, row is created with `commit_status='draft'`. |
| `start_processing` | `true` | If `false`, no job is enqueued. |
| `url` | — | Required for JSON variant. |
| `content`, `title` | — | Optional pre-extracted body for articles (preserves the `1d18b96` shortcut). |
| `image` (file field) | — | Image file blob. Existing flow. |
| `audio` (file field) | — | Audio file blob. **New.** |
| `duration_seconds` | — | Required for `audio`; integer in `(0, 5400]`. |
| `source` | `"app"` | Optional analytics tag. Values: `"recorder"`, `"file_picker"`, `"share_extension"`, `"app"`. |

**Audio validation:** MIME ∈ `{audio/mp4, audio/mpeg, audio/wav, audio/ogg, audio/webm, audio/flac}`; max body 500 MB enforced by `http.MaxBytesReader`; `0 < duration_seconds ≤ 5400`.

**Server behavior:**
1. Validate.
2. Insert `mindmap_content` row with `commit_status` per `auto_commit`. For multipart, stream the file body directly to `{user_id}/{content_id}/{audio|image}.{ext}` via `StorageProvider.Save`. Populate `media_*` columns and `duration_seconds`.
3. If `start_processing=true`: set `processing_status='pending'` and enqueue a `JobPayload{ContentID, UserID, ContentType, …}`. If `start_processing=false`: set `processing_status='deferred'`, do not enqueue.
4. Respond `{id, commit_status, processing_status, media_url?}`. `media_url` is a signed URL for the just-stored file (image or audio).

**Backward compatibility:** existing article/image/YouTube callers (web app, Chrome extension, mobile, today's iOS share extension) send no new flags. They get `auto_commit=true, start_processing=true` defaults — exactly today's behavior. Image uploads continue working through the same endpoint; what changes is that the file lands in permanent storage immediately rather than via `/tmp` (see Backend section).

### `POST /saves/:id/commit`

Body: `{ "title": "..." }` — `title` is optional.

Behavior:
1. Auth — user must own the row.
2. If `commit_status='draft'`: flip to `'committed'`. Apply title if provided.
3. If `processing_status='deferred'`: flip to `'pending'` and enqueue a job. (No race: `deferred` only ever exists for rows created with `start_processing=false`, and is the only state that triggers an enqueue here.)
4. If `processing_status` is any other value (`pending`, `processing`, `processed`, `failed`): do nothing — a job already exists or has run.
5. Idempotent: subsequent calls on already-committed rows return 200 with no side effect.

### `DELETE /saves/:id`

Unchanged behavior. Removes row + media file. In-flight worker writes to a deleted row fail; dispatcher logs and stops retrying. No special handling for drafts vs committed — same code path.

### `GET /saves` and listing queries

All vault-listing sqlc queries gain `WHERE commit_status='committed'`. Drafts never leak into the vault grid, search results, or content counts.

### OpenAPI / `packages/api-spec`

`packages/api-spec/src/openapi.yaml` updates:
- Extend `POST /saves` request body schemas with `auto_commit`, `start_processing`, the multipart audio fields, and the `source` analytics tag.
- Add `POST /saves/:id/commit` operation.
- Expose `commit_status` on response shapes.
- Add `'deferred'` to the enum of valid `processing_status` values returned from the API.

Generated TypeScript types flow into `@mindtab/api-spec` via the existing `pnpm build` pipeline; mobile picks them up automatically.

---

## Backend: processors, steps, chunking

### `JobPayload` — slimmed

```go
type JobPayload struct {
    JobID         uuid.UUID
    ContentID     uuid.UUID    // processors fetch everything else from the row
    UserID        string
    ContentType   string
    AttemptCount  int
    MaxAttempts   int
    CurrentStep   string
    StepResults   map[string]any
}
```

Removed: `SourceURL`, `TempImagePath`, `ImageMIME`. Processors that need source-specific fields read them from `mindmap_content` by `ContentID`. The queue is now a thin pointer envelope; the row is the source of truth.

**Deploy migration:** in-flight queued jobs at rollout would have the old payload shape. Mitigation: drain the queue (stop accepting new saves for ~5 min, let workers finish current jobs) before rolling the new binary. Acceptable at current traffic; if traffic grows, a payload-version field can be added.

### Image processor — refactored

**Before:** `[save, vision, summarize, embed, store]`. **After:** `[vision, summarize, embed, store]`.

The handler now writes images directly to `{user_id}/{content_id}/image.{ext}` (matching audio). The `save` step in `server/internal/worker/steps/save.go` is deleted (only image used it).

Files affected:
- `server/internal/handler/saves.go` — image branch streams body to permanent storage via `StorageProvider.Save`, not `/tmp`.
- `server/internal/worker/processors/image.go` — drop `save` from `Steps()`, drop the save-step branch in `Execute`.
- `server/internal/worker/steps/save.go` — delete.
- `server/internal/queue/producer.go` — remove `TempImagePath` and `ImageMIME` from `JobPayload`.

Existing image handler/processor tests get updated; new tests cover the unified create flow. Net code reduction.

### `AudioProcessor` — new

Location: `server/internal/worker/processors/audio.go`.

```go
type AudioProcessor struct {
    transcribe *steps.TranscribeAudioStep
    summarize  *steps.SummarizeStep      // reused
    embed      *steps.EmbedStep          // reused
    store      *steps.StoreStep          // reused
    db         store.Querier
}

func (p *AudioProcessor) ContentType() string    { return "audio" }
func (p *AudioProcessor) LockTTL() time.Duration { return 30 * time.Minute }
func (p *AudioProcessor) Steps() []string {
    return []string{"transcribe", "summarize", "embed", "store"}
}
```

No `save` step — the file is already at its permanent path when the job is enqueued. No eager flag — the processor runs the same pipeline regardless of clip length. Eager-vs-deferred is a *client timing* concern, not a server concern.

`LockTTL` is 30 minutes — comfortable headroom for 90-min audio with chunking + transcription. Article processor uses 5 min, YouTube 15 min.

### `transcribe_audio` step — new, with chunking

Location: `server/internal/worker/steps/transcribe_audio.go`.

Distinct from the YouTube-specific `transcribe.go` (which prefers captions, falls back to extracting and Whisper-ing audio). For audio saves we always go straight to Whisper.

**Flow:**
1. Look up content row, get `media_key` and `media_file_bytes`.
2. Fetch file from storage via `StorageProvider.Get`, write to a worker-local temp path.
3. If `media_file_bytes ≤ 24 MB`: single `transcriptionChain.Transcribe(ctx, tmpPath)` call. Result text becomes `extracted_text`.
4. Else: ffmpeg silence-aware chunking — see below — into ≤ 20-min segments. Transcribe each via the chain. Concatenate results with `\n\n`.
5. Step result: `{extracted_text, transcript_source: "whisper"}`. Persisted by the `store` step.

**Silence-aware chunking:**
- First pass: `ffmpeg -i in.m4a -af silencedetect=noise=-30dB:d=0.5 -f null -`. Parse `silence_start` timestamps from stderr.
- Pick split points: target every 20 minutes; for each target, find the silence boundary within ±2 minutes; if none, fall back to an exact-time split.
- Second pass: `ffmpeg -ss <t1> -to <t2> -c copy <chunk_n>.m4a` for each segment.
- If a single resulting chunk still exceeds 24 MB (e.g., high-bitrate wav), recursively split it in half.

**Failure mode:** if any chunk transcription fails permanently after chain fallback, the whole step fails and the job goes to the retry scheduler. Transient failures inside the provider chain are already handled by `Chain[T]`.

### `SummarizeStep` — title generation extension

Today returns `{summary, tags, key_topics}`. Audio rows have no natural title source (no HTML `<title>`, no YouTube metadata), so for `ContentType='audio'` the LLM prompt is extended to also return `title`.

Implementation: `SummarizeStep.Execute` switches on `job.ContentType`. For `"audio"`, it uses an audio-specific prompt variant that asks for `{title, summary, tags, key_topics}` in JSON. For other content types the existing prompt is unchanged. The step result struct gains an optional `Title string`; `StoreStep` writes it to `source_title` (replacing the timestamp placeholder) when present.

### `cmd/api/main.go` wiring

- Register `AudioProcessor` in the dispatcher.
- Start draft cleanup goroutine: `go startDraftCleanup(ctx, db, logger, 3*time.Hour)` — single ticker, runs `DELETE FROM mindmap_content WHERE commit_status='draft' AND updated_at < NOW() - INTERVAL '24 hours'`.
- No new Redis keys, no cancellation channels — discard works by deleting the row, the worker fails harmlessly.

---

## Mobile

### New dependencies

`apps/mobile/package.json`:
- `expo-audio` — modern recording/playback API on SDK 52+
- `expo-document-picker` — for the file-upload entry point in the SaveFAB sheet

### Config — `apps/mobile/app.json`

- `expo-audio` plugin with `microphonePermission` string and `staysActiveInBackground: true`.
- iOS:
  - `infoPlist.UIBackgroundModes: ["audio"]`
  - `infoPlist.NSMicrophoneUsageDescription`
- Android:
  - `android.permissions: ["RECORD_AUDIO", "FOREGROUND_SERVICE", "FOREGROUND_SERVICE_MICROPHONE"]`

### Navigation

All recorder/review screens are full-screen modals (Expo Router `presentation: "fullScreenModal"`).

```
SaveFAB sheet (extended in apps/mobile/src/components/vault/save-fab.tsx)
  ├─ Save URL          (existing)
  ├─ Save Image        (existing)
  ├─ Record Audio      ⟶ pushes /saves/record  (new)
  └─ Upload Audio File ⟶ document picker, then POST /saves multipart  (new)

/saves/record           recorder modal
   on Stop ⟶ replace with /saves/review/[id]

/saves/review/[id]      review modal
   on Save    ⟶ pop modal; vault refreshes
   on Discard ⟶ confirm dialog → DELETE → pop modal

apps/mobile/app/(main)/vault/[id].tsx (existing, extended)
   when content.source_type === "audio":
     render <AudioPlayer/> pinned to top, scrollable transcript below
     (pattern-match the notes reader)
```

The mini player mounts at the `(main)` layout level — outside the tab navigator — so it persists across vault/chat/home tab switches.

### File inventory

**New files:**

| File | Responsibility |
|---|---|
| `apps/mobile/app/(main)/saves/record.tsx` | Recorder route, wraps `<AudioRecorder/>` |
| `apps/mobile/app/(main)/saves/review/[id].tsx` | Review route, wraps `<AudioReview/>` |
| `apps/mobile/src/components/audio/audio-recorder.tsx` | Timer, mic-level meter, Pause / Stop. Drives `recorderStore` |
| `apps/mobile/src/components/audio/audio-review.tsx` | Title field, `<AudioPlayer/>`, transcript area, upload progress, Save/Discard |
| `apps/mobile/src/components/audio/audio-player.tsx` | Play/pause, scrubber, current/total time. Reused in review, detail, mini player |
| `apps/mobile/src/components/audio/audio-card.tsx` | Compact vault card variant for `source_type='audio'` |
| `apps/mobile/src/components/audio/mini-audio-player.tsx` | Persistent bottom-of-screen player |
| `apps/mobile/src/stores/recorder-store.ts` | Zustand store for recording lifecycle |
| `apps/mobile/src/stores/mini-player-store.ts` | Zustand store for the persistent player |
| `apps/mobile/src/hooks/use-audio-upload.ts` | TanStack mutation wrapping `POST /saves` multipart with progress |
| `apps/mobile/src/hooks/use-draft-poll.ts` | TanStack query polling `GET /saves/:id` until `extracted_text` non-null |
| `apps/mobile/src/hooks/use-commit-save.ts` | TanStack mutation calling `POST /saves/:id/commit` |

**Modified files:**

| File | Change |
|---|---|
| `apps/mobile/src/components/vault/save-fab.tsx` | Add Record + Upload-Audio tabs |
| `apps/mobile/src/components/vault/save-grid.tsx` | Branch on `source_type` to render `<AudioCard/>` |
| `apps/mobile/app/(main)/vault/[id].tsx` | Branch on `source_type='audio'` for the audio detail layout |
| `apps/mobile/app/(main)/_layout.tsx` | Mount `<MiniAudioPlayer/>` once at the layout level |
| `apps/mobile/package.json`, `apps/mobile/app.json` | New deps, permissions, background-audio config |

### State management

**`recorderStore` (Zustand):**

```ts
type RecorderState = {
  status: 'idle' | 'recording' | 'paused' | 'stopped'
  startedAt: number | null
  elapsedMs: number
  meterLevel: number          // 0..1, drives the mic-level UI
  draftId: string | null      // assigned by the upload mutation post-stop
  uploadProgress: number      // 0..1
  uploadState: 'idle' | 'uploading' | 'done' | 'failed'

  start(): Promise<void>
  pause(): void
  resume(): void
  stop(): Promise<void>       // finalizes file, kicks off upload, returns draftId
  reset(): void
}
```

Why a store and not local state: pause/resume + background recording mean the recording can outlive the recorder screen mount. Zustand keeps the lifecycle alive across navigation.

**`miniPlayerStore` (Zustand):**

Tracks the single currently-playing audio across the app. `<AudioCard/>`'s play button calls `miniPlayerStore.play(contentId)`. The mini player subscribes to render itself.

**TanStack Query:**

- `useDraftPoll(id)` — polls `GET /saves/:id` every 2s for the ≤60s eager path; stops when `extracted_text` non-null.
- `useAudioUpload()` — multipart mutation with `onUploadProgress` callback feeding `recorderStore.uploadProgress`.
- `useCommitSave(id)` — mutation calling `POST /saves/:id/commit`.
- `useDeleteSave(id)` — mutation calling `DELETE /saves/:id`. Reuses (and lightly extends if needed) the existing vault delete hook used by article / image / YouTube cards. Invalidates the vault list query on success.

### Recorder lifecycle (concrete)

1. User taps **Record Audio** in the SaveFAB sheet → pushes `/saves/record`.
2. Recorder mounts. Asks for mic permission if not granted. Sets the audio session category to `playAndRecord` with `staysActiveInBackground=true`.
3. Tap **Record** → `expo-audio.AudioRecorder.record()`. Meter polled at ~60Hz, elapsed timer ticks via `requestAnimationFrame`-driven setInterval.
4. Tap **Pause** → `recorder.pause()`; status flips to `paused`. Tap **Resume** → `recorder.record()`. Phone-call interruption auto-pauses with a banner.
5. Tap **Stop** → `recorder.stop()`. The file URI on disk becomes the upload payload.
6. **In parallel:** kick off `useAudioUpload()` mutation with `auto_commit=false` and `start_processing = (duration_seconds <= 60)`. Then `router.replace('/saves/review/' + draftId)` once the server returns the draft id.
7. Review screen mounts. `<AudioPlayer/>` plays the local file URI immediately (faster than waiting for server URL); switches to the server's signed `media_url` once upload completes.
8. If `duration_seconds <= 60`: `useDraftPoll(draftId)` runs, transcript appears inline when `extracted_text` becomes non-null.
9. User taps **Save** → if `uploadState !== 'done'`, the commit call is queued client-side and fires automatically when upload completes (the Save button shows a "saving…" state in the meantime); otherwise `useCommitSave(draftId)` fires immediately. On success, pop modal + invalidate vault query.
10. User taps **Discard** → confirmation dialog ("Discard recording?") → `useDeleteSave(draftId)` mutates → pop modal.

The review screen contains *only* title, player, transcript area (or placeholder), upload progress, Save, and Discard. No notes field, no tag picker — those are edited from the vault detail screen post-save, matching how URL and image saves are annotated today.

### Background recording

- iOS: `staysActiveInBackground: true` on the audio session + `UIBackgroundModes: ["audio"]` lets the recorder keep capturing when the app is backgrounded or the phone is locked. iOS surfaces a red status-bar pill automatically.
- Android: `expo-audio` starts a foreground service when `staysActiveInBackground` is set; the service shows a persistent notification with elapsed time. Tapping the notification returns to the recorder screen.

### Audio card layout

```
┌──────────────────────────────────┐
│ ▶  Voice note · Apr 27, 10:34 AM │  ← title; LLM-generated post-processing
│    4:23                          │  ← duration badge
│    "I was thinking about how the │  ← first ~80 chars of transcript
│     mobile architecture should…" │
└──────────────────────────────────┘
```

Tap **▶** → `miniPlayerStore.play(id)`; the persistent bottom player appears. Tap card body → opens the detail screen.

---

## iOS share extension

`apps/mobile/ios/MindTabShare/ShareViewController.swift` gains an audio branch alongside existing image/URL/text branches:

```swift
if provider.hasItemConformingToTypeIdentifier(UTType.audio.identifier) {
    provider.loadItem(forTypeIdentifier: UTType.audio.identifier) { item, error in
        guard let url = item as? URL else { /* surface error */ return }
        // Copy file into the app group container, then POST /saves multipart
        // with auto_commit=true, start_processing=true, source="share_extension"
    }
}
```

Whether the extension uploads directly or hands off to the host app via app group + URL scheme will follow whichever pattern the existing image-share branch uses (to be confirmed during planning).

Audio shares **bypass the recorder/review flow entirely** — they land in the vault as `commit_status='committed'` immediately, just like a shared image.

**Source MIMEs in the wild:** WhatsApp (`audio/ogg` Opus), iMessage (`audio/mp4` M4A), Voice Memos (`audio/mp4` M4A), Telegram (`audio/ogg`), arbitrary Files-app drops. All covered by the `audio/*` whitelist; server-side Whisper handles them natively or normalizes via ffmpeg as needed.

**Android share intent:** out of scope for this spec.

---

## Error handling

### Recorder errors

| Failure | UI behavior |
|---|---|
| Mic permission denied | Settings-link banner with "Enable microphone in Settings" CTA |
| Recording hardware failure | Toast: "Recording failed — try again" + reset state |
| Phone call interruption | Auto-pause + banner "Paused for call. Tap Resume to continue." |
| Background process killed by OS | On next foreground, recorder shows "Recording was interrupted" + offers to save what was captured (the partial file is still on disk) |
| Low storage at start | Block start with "Not enough storage" alert |
| Low storage mid-record | Force-stop + transition to review with what was captured |

### Upload errors

| Failure | UI behavior |
|---|---|
| Network drop mid-upload | Mutation retries up to 3 times with exponential backoff; Save button stays "queued" |
| Persistent network failure | Banner on review screen: "Couldn't upload — retry?" + Save button disabled until upload succeeds |
| 413 (file too large server-side) | Toast + force-discard (client validates size first; this would be a regression) |
| 415 (bad MIME) | Toast: "Audio format not supported" + force-discard |
| 5xx | Retry up to 3 times, then "Server error — try again later" banner |

### Processing errors (worker side)

Reuse the existing dispatcher retry mechanics — `processing_status='failed'` after `MaxAttempts`. The vault audio card surfaces failures with a small badge (parity with how article/YouTube failures are shown today).

For the eager-process short-clip path: if processing fails, the review screen's polling sees `processing_status='failed'` and shows: "Couldn't generate transcript. You can save anyway and we'll retry, or discard." Tapping Save in that state calls `POST /saves/:id/commit` which re-enqueues a fresh job because no successful processing run completed.

### Cleanup correctness

The 3-hourly draft cleanup goroutine deletes both the row and its file. If the file delete fails (storage hiccup), the row delete still proceeds — orphaned files are tolerable; orphaned DB rows are not.

---

## Testing strategy

Following the patterns established by the recently-shipped server-test PR (#12).

### Backend unit tests

| File | Coverage |
|---|---|
| `server/internal/worker/processors/audio_test.go` | Step orchestration, lock TTL, integration with mocked steps |
| `server/internal/worker/steps/transcribe_audio_test.go` | Chunking decision logic, silence-split parser, exact-time fallback, recursive halving for oversize chunks; mocks `TranscriptionProvider` |
| `server/internal/handler/saves_test.go` (extended) | Polymorphic `POST /saves` across all flag combinations; commit endpoint behavior in each `commit_status` × `processing_status` combination; draft validation and limits |
| `server/internal/store` (extended) | `commit_status` filter in vault listings; new commit/cleanup queries |

### Backend integration tests (testcontainers)

| Scenario | Expected |
|---|---|
| Audio upload with `auto_commit=true, start_processing=true` (share-extension path) | Row created committed + pending; job enqueued; eventually `processed`. |
| Audio upload with `auto_commit=false, start_processing=true` (≤60s eager path) | Row stays draft; processing populates `extracted_text` + summary; commit endpoint flips to committed without re-enqueueing. |
| Audio upload with `auto_commit=false, start_processing=false` (>60s deferred path) | Row `draft` + `deferred`; nothing in queue; commit endpoint flips both (`committed` + `pending`) and enqueues. |
| Discard mid-process | Row + file deleted; in-flight worker fails its next step gracefully. |
| Draft cleanup | Drafts older than 24h deleted; recent drafts survive. |
| Image flow regression | Existing image saves still create + process correctly post-handler-refactor. |
| Article flow regression | Existing article saves still work; pre-extracted-content shortcut still works. |
| YouTube flow regression | Existing YouTube saves still work post `video_duration → duration_seconds` rename. |

### Mobile

Following existing mobile testing patterns (light coverage on stores, none on UI):

- `apps/mobile/src/stores/recorder-store.test.ts` — state transitions, pause/resume idempotence
- `apps/mobile/src/hooks/use-audio-upload.test.ts` — happy path + retry behavior with mocked fetch

UI is verified manually — the recorder screen needs device-level testing (mic permissions, background audio, foreground service notification) which doesn't reproduce in CI.

### Manual smoke checklist (during implementation)

- 30-second voice note end-to-end on iOS + Android
- 5-minute recording with phone-call interruption mid-way
- 70-minute recording with screen lock + app backgrounded
- 90-minute recording (boundary case)
- WhatsApp voice note → MindTab share extension → vault
- Discard at every state: recording, paused, post-stop pre-upload, post-upload pre-process, mid-eager-process, post-process pre-commit
- Image upload regression (existing flow still works after handler refactor)
- Article + YouTube regression (existing flows still work after schema rename)

---

## Scope boundaries

### Explicitly out of scope

- **Live / streaming transcription** during recording — the streaming-STT integration is a meaningful separate feature.
- **Trim handles** in the review screen — adds waveform rendering and edit-in-place upload.
- **Scrolling waveform** during recording — the level meter is sufficient feedback.
- **Floating mini-pill in-app** for cross-screen recording awareness (Tier C from brainstorming) — possible follow-up if useful in practice.
- **Web app and Chrome extension** recording or audio upload — mobile-only this phase.
- **Android share-intent audio** — handled in a follow-up.
- **Speaker diarization, timestamped transcript highlights, chapter detection.**
- **R2 / signed-URL upload** — Phase 5 of the saves roadmap.
- **Fallback transcription providers** beyond Groq Whisper — Phase 4.
- **Multiple audio segments per single save** — one recording produces one save row.

### Future phases enabled by this work

- **Reels (Phase 3 second half)** — same `POST /saves` multipart, new `ReelsProcessor` registered with the dispatcher, reuses `media_*` columns and `duration_seconds`.
- **Preview-before-commit UX for any source type** — the lifecycle is now uniform, so a future "preview image with vision-generated tags" or "preview article with extracted summary" flow is purely a client-side opt-in.
- **File-upload-from-Android** (separate from share intent) trivially via `expo-document-picker`.
- **Resumable / chunked upload** — when R2 signed URLs land in Phase 5, they replace the synchronous handler write without touching processors.
