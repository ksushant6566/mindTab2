# YouTube Saves — Phase 2 Design Spec

Phase 2 of the saves feature. Adds support for saving YouTube videos and shorts with AI-powered transcription, frame extraction, summarization, and semantic search.

## Scope

- **YouTube videos** — regular videos up to 2 hours
- **YouTube Shorts** — short-form videos (<60s)
- **Max duration**: 7200 seconds (2 hours). Videos exceeding this are rejected at the metadata step.
- **Input methods**: URL paste in save FAB + iOS share sheet (already accepts YouTube URLs, no changes needed)

## Processing Pipeline

8 steps, executed sequentially with checkpoint after each. 4 new steps, 4 reused from the existing pipeline (summarize, embed, store + vision adapted from image processor).

### Step 1: metadata (NEW)

Extracts video metadata without downloading the video.

- **Tool**: `yt-dlp --dump-json {url}`
- **Outputs**: `title`, `duration`, `thumbnail_url`, `channel_name`, `has_captions` (boolean), `video_id`
- **Validation**: Rejects if `duration > 7200` with a permanent error (no retry)
- **Duration**: ~1-2s

The metadata result is checkpointed. On resume, this step is skipped.

### Step 2: download (NEW)

Downloads the video file for frame extraction and audio fallback.

- **Tool**: `yt-dlp -f "bestvideo[height<=360]+bestaudio/best[height<=360]" -o {output_path}`
- **Quality**: 360p max — sufficient for scene detection and Gemini vision
- **Storage**: `/tmp/mindtab/youtube/{job_id}/video.{ext}`
- **Outputs**: `video_file_path`
- **Duration**: ~10-60s depending on video length

### Step 3: transcribe (NEW)

Dual-path transcription. Tries YouTube captions first, falls back to audio transcription.

**Primary path — YouTube captions:**
- **Tool**: `yt-dlp --write-auto-sub --sub-lang en --skip-download {url}`
- Extracts existing captions/auto-generated subtitles
- Available on ~80% of popular videos
- **Duration**: ~2s

**Fallback path — Groq Whisper:**
- Triggered when `has_captions` is false or caption extraction fails
- Extract audio from downloaded video: `ffmpeg -i {video} -vn -acodec opus {audio.opus}`
- Send audio to Groq Whisper API for transcription
- **Duration**: ~30-120s depending on video length

**Outputs**: `transcript` (full text), `transcript_source` ("captions" | "whisper")

### Step 4: extract_frames (NEW)

Extracts keyframes at visual scene transitions using ffmpeg scene detection.

- **Tool**: `ffmpeg -i {video} -vf "select='gt(scene,0.3)'" -vsync vfn {output_dir}/frame_%04d.jpg`
- **Scene threshold**: 0.3 (configurable, good default for most content)
- **Frame cap**: Maximum 5 frames per minute of video duration
  - 10-min video → max 50 frames
  - 2-hour video → max 600 frames
  - If scene detection produces more than the cap, uniformly downsample: take every Nth frame where `N = ceil(total_frames / cap)`
- **Output format**: JPEG frames in `/tmp/mindtab/youtube/{job_id}/frames/`
- **Outputs**: `frame_paths[]`, `frame_count`
- **Duration**: ~5-15s

### Step 5: vision (ADAPTED from image processor)

Sends extracted frames to Gemini Flash vision for visual description.

- **Provider**: Gemini Flash (via existing LLM chain)
- **Input**: Batch of frame images
- **Prompt**: Describe what's shown in each frame — identify slides, code, diagrams, UI, people, text
- **Output**: Combined `visual_description` — concatenated descriptions of all frames
- **Duration**: ~5-30s depending on frame count

### Step 6: summarize (REUSED)

Existing summarize step. Input is transcript + visual descriptions.

- **Provider**: Gemini Flash (via existing LLM chain)
- **Input**: transcript (as `extracted_text`) + visual descriptions
- **Output**: `summary`, `tags[]`, `key_topics[]`
- **Duration**: ~3-5s

### Step 7: embed (REUSED)

Existing embed step.

- **Provider**: OpenAI text-embedding-3-small (via existing embedding chain)
- **Input**: summary + first 2000 chars of transcript
- **Output**: 1536-dim vector
- **Duration**: ~1-2s

### Step 8: store (REUSED)

Existing store step. Writes all results to `mindmap_content` and cleans up temp files.

- Checks `IsContentDeleted()` before writing (skip if user deleted during processing)
- Writes: `extracted_text` (transcript), `visual_description`, `summary`, `tags`, `key_topics`, `embedding`, `video_duration`, `video_thumbnail_url`, `video_channel`, `transcript_source`
- Sets `processing_status = 'completed'`
- **Cleanup**: Deletes `/tmp/mindtab/youtube/{job_id}/` (video file + frames)
- **Duration**: ~100ms

## Data Model

### Migration 000004: YouTube columns

4 new nullable columns on `mindmap_content`. Only populated when `source_type = 'youtube'`. No changes to existing article/image rows.

```sql
ALTER TABLE mindmap_content
  ADD COLUMN video_duration INTEGER,
  ADD COLUMN video_thumbnail_url TEXT,
  ADD COLUMN video_channel TEXT,
  ADD COLUMN transcript_source TEXT;
```

No index changes needed — existing indexes on `source_type`, `user_id`, `created_at`, and `embedding` cover YouTube queries.

### Existing column reuse

| YouTube field | Stored in | Notes |
|---|---|---|
| Video URL | `source_url` | Existing column |
| Video title | `source_title` | Existing column |
| Transcript | `extracted_text` | Same role as article body text |
| Frame descriptions | `visual_description` | Same role as image descriptions |
| Summary | `summary` | Existing column |
| Tags | `tags` | Existing column |
| Key topics | `key_topics` | Existing column |
| Embedding | `embedding` | Existing column |

### Jobs table

No changes. `content_type: "youtube"` and the existing `step_results` JSONB handles the new steps transparently.

## Server Changes

### Handler: YouTube URL detection

The existing `createURL` function in `saves.go` gets a YouTube URL detector. When a YouTube URL is detected, `source_type` is set to `"youtube"` instead of `"article"`. Same endpoint, same JSON body.

```go
func isYouTubeURL(rawURL string) bool {
    // Matches: youtube.com, www.youtube.com, m.youtube.com, youtu.be, youtube-nocookie.com
    // Handles: /watch?v=, /shorts/, /embed/, youtu.be/ paths
}
```

No new API endpoints needed.

### New services

**YTDLPService** — wraps the yt-dlp binary:
- `GetMetadata(ctx, url) (*VideoMetadata, error)` — `--dump-json`
- `Download(ctx, url, outputPath, maxHeight) error` — download video at specified quality
- `GetCaptions(ctx, url, lang) (string, error)` — `--write-auto-sub --skip-download`

**FFmpegService** — wraps the ffmpeg binary:
- `ExtractFrames(ctx, videoPath, outputDir, sceneThreshold) ([]string, error)` — scene detection
- `ExtractAudio(ctx, videoPath, outputPath, codec) error` — audio extraction for Whisper fallback

Both services execute binaries via `os/exec` with context cancellation support and timeout handling.

### New provider interface

```go
type TranscriptionProvider interface {
    Transcribe(ctx context.Context, audioPath string) (*TranscriptionResult, error)
    Name() string
}

type TranscriptionResult struct {
    Text   string
    Source string // "whisper"
}
```

**GroqTranscriber** implements `TranscriptionProvider` using Groq's Whisper API. Wrapped in a `Chain[TranscriptionProvider]` for future fallback support (e.g., OpenAI Whisper).

### New processor

**YoutubeProcessor** implements the `Processor` interface:
- `ContentType()` → `"youtube"`
- `Steps()` → `["metadata", "download", "transcribe", "extract_frames", "vision", "summarize", "embed", "store"]`
- `LockTTL()` → `15 * time.Minute`
- `Execute(ctx, step, job, prevResults)` — dispatches to the appropriate step function

### Processor interface change

Add `LockTTL()` method to the `Processor` interface so each processor declares its own lock duration:

```go
type Processor interface {
    ContentType() string
    Steps() []string
    LockTTL() time.Duration
    Execute(ctx context.Context, step string, job *Job, prevResults StepResults) (*StepResult, error)
}
```

- `ArticleProcessor.LockTTL()` → `5 * time.Minute` (unchanged behavior)
- `ImageProcessor.LockTTL()` → `5 * time.Minute` (unchanged behavior)
- `YoutubeProcessor.LockTTL()` → `15 * time.Minute`

The dispatcher uses `proc.LockTTL()` when acquiring the lock instead of a hardcoded value.

### Configuration

New environment variables:

| Env var | Default | Required | Purpose |
|---|---|---|---|
| `GROQ_API_KEY` | — | Yes (if YouTube enabled) | Groq Whisper transcription |
| `YTDLP_PATH` | `yt-dlp` | No | Path to yt-dlp binary |
| `FFMPEG_PATH` | `ffmpeg` | No | Path to ffmpeg binary |
| `YOUTUBE_TEMP_PATH` | `/tmp/mindtab/youtube` | No | Temp storage for video downloads + frames |
| `YOUTUBE_MAX_DURATION_SEC` | `7200` | No | Max video duration (2 hours) |
| `YOUTUBE_VIDEO_QUALITY` | `360` | No | Max video height for downloads |
| `YOUTUBE_FRAMES_PER_MIN_CAP` | `5` | No | Scene detection frame cap per minute |

### Registration in main.go

```go
ytdlp := services.NewYTDLP(cfg.YTDLPPath)
ffmpeg := services.NewFFmpeg(cfg.FFmpegPath)
groq := providers.NewGroqTranscriber(cfg.GroqAPIKey)
transcriptionChain := providers.NewChain(groq)

dispatcher.Register(processors.NewYoutubeProcessor(
    ytdlp, ffmpeg, transcriptionChain,
    registry.LLM, registry.Embedding,
    queries, pool, cfg,
))
```

## Mobile UI Changes

### Vault Grid — YouTube Card

YouTube cards in the vault grid display:
- **Thumbnail** with play button overlay (centered)
- **Duration badge** (bottom-right of thumbnail, e.g., "12:34")
- **Red "YT" indicator** (top-left of thumbnail)
- **Title** — video title
- **Channel name** — below title, muted color
- **Summary preview** — 2-line clamp
- **Tags** — same as articles

During processing: same spinner/loader pattern as existing cards.

### Detail Screen

Same layout structure as existing saves with these additions:
- Large thumbnail with play button + duration badge
- Channel name below title
- "Open" action opens YouTube URL (same as article's share action)
- Footer metadata: transcript source ("YouTube captions" | "Whisper") + frame count
- Key topics, summary, tags sections — identical to articles

### Filter Chips

Add "Videos" chip alongside existing All / Articles / Images. Client-side filtering on `source_type === "youtube"`.

### Save FAB

No changes. YouTube URLs are entered in the existing URL text input. The server handles detection and routing.

### Types

Extend `RawSave` and `SaveDetail` types:

```typescript
// Added to RawSave
video_duration?: number | null;
video_thumbnail_url?: string | null;
video_channel?: string | null;

// Added to SaveDetail
video_duration?: number | null;
video_thumbnail_url?: string | null;
video_channel?: string | null;
transcript_source?: string | null;
```

The `source_type` union extends from `"article" | "image"` to `"article" | "image" | "youtube"`.

## Error Handling

| Scenario | Step | Behavior |
|---|---|---|
| Invalid/private YouTube URL | metadata | Permanent error — job fails, no retry |
| Video exceeds 2hr cap | metadata | Permanent error — "Video exceeds maximum duration" |
| Age-restricted video | metadata | Permanent error — "Video is age-restricted" |
| yt-dlp download rate limited | download | Retriable — exponential backoff, max 5 attempts |
| No captions + Groq API down | transcribe | Retriable — backoff, dead letter after max attempts |
| ffmpeg crash on frame extraction | extract_frames | Retriable — re-extract from cached video file |
| Gemini vision rate limit | vision | Retriable — backoff via provider chain |
| User deletes save during processing | store | `IsContentDeleted()` check — skip write, clean up files |

## Temp File Cleanup

- All temp files stored under `/tmp/mindtab/youtube/{job_id}/`
  - `video.{ext}` — downloaded video
  - `frames/frame_NNNN.jpg` — extracted frames
  - `audio.opus` — extracted audio (only if Whisper fallback triggered)
- **On success**: `store` step deletes the entire `{job_id}/` directory
- **On permanent failure**: cleanup runs after job is moved to dead letter
- **On server restart**: startup recovery sweep scans for orphaned temp dirs older than 1 hour and deletes them

## Dependencies

| Dependency | Type | Purpose |
|---|---|---|
| yt-dlp | System binary | Video download, metadata, caption extraction |
| ffmpeg | System binary | Scene detection, frame extraction, audio extraction |
| Groq API | External service | Whisper transcription (fallback) |
| Gemini Flash | External service (existing) | Vision + summarization |
| OpenAI | External service (existing) | Embeddings |

Both yt-dlp and ffmpeg must be available on the server's PATH (or configured via `YTDLP_PATH` / `FFMPEG_PATH`).
