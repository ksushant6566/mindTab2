# YouTube Saves (Phase 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add YouTube video/shorts saving with transcription, frame extraction, vision analysis, and semantic search.

**Architecture:** New `YoutubeProcessor` registered in the existing dispatcher with 8 steps (4 new, 4 reused). Three new services wrap external tools (yt-dlp, ffmpeg, Groq Whisper). The `Processor` interface gains a `LockTTL()` method so YouTube jobs get a 15-minute lock. Mobile UI adds a YouTube card variant and "Videos" filter chip.

**Tech Stack:** Go (server), yt-dlp + ffmpeg (system binaries), Groq Whisper API (transcription), Gemini Flash (vision + summarization), OpenAI (embeddings), React Native / Expo (mobile)

**Spec:** `docs/superpowers/specs/2026-03-30-youtube-saves-design.md`

---

## File Structure

### New files

| File | Responsibility |
|------|---------------|
| `server/migrations/000004_youtube_columns.up.sql` | Add video_duration, video_thumbnail_url, video_channel, transcript_source columns |
| `server/migrations/000004_youtube_columns.down.sql` | Rollback migration |
| `server/internal/services/ytdlp.go` | Wraps yt-dlp binary: metadata, download, caption extraction |
| `server/internal/services/ffmpeg.go` | Wraps ffmpeg binary: frame extraction, audio extraction |
| `server/internal/providers/transcription/interface.go` | TranscriptionProvider interface |
| `server/internal/providers/transcription/groq.go` | Groq Whisper implementation |
| `server/internal/worker/steps/metadata.go` | YouTube metadata extraction step |
| `server/internal/worker/steps/download.go` | Video download step |
| `server/internal/worker/steps/transcribe.go` | Dual-path transcription step |
| `server/internal/worker/steps/extract_frames.go` | Scene detection + frame extraction step |
| `server/internal/worker/processors/youtube.go` | YouTubeProcessor implementing Processor interface |

### Modified files

| File | Change |
|------|--------|
| `server/internal/config/config.go` | Add YouTube config fields |
| `server/internal/worker/processor.go` | Add `LockTTL()` to Processor interface |
| `server/internal/worker/processors/article.go` | Add `LockTTL()` method returning 5m |
| `server/internal/worker/processors/image.go` | Add `LockTTL()` method returning 5m |
| `server/internal/worker/dispatcher.go` | Use `proc.LockTTL()` instead of hardcoded TTL |
| `server/internal/worker/steps/vision.go` | Add `BatchVision()` for multiple frame images |
| `server/internal/worker/steps/store.go` | Handle YouTube metadata result + new columns |
| `server/internal/store/queries/content.sql` | Add `UpdateContentVideoFields` query |
| `server/internal/handler/saves.go` | Add `isYouTubeURL()`, update `createURL()` routing |
| `server/internal/providers/registry.go` | Add transcription chain to Registry |
| `server/internal/queue/producer.go` | No structural changes — SourceURL already carries the URL |
| `server/cmd/api/main.go` | Initialize YouTube services, register processor |
| `apps/mobile/src/components/vault/save-grid.tsx` | Extend `RawSave` type with YouTube fields |
| `apps/mobile/src/components/vault/filter-chips.tsx` | Add "Videos" chip, extend FilterType |
| `apps/mobile/src/components/vault/save-card.tsx` | Add YouTube card rendering branch |
| `apps/mobile/app/(main)/(tabs)/vault.tsx` | Update filter to include "youtube" |
| `apps/mobile/app/(main)/vault/[id].tsx` | Extend `SaveDetail`, add YouTube detail sections |

---

## Task 1: Database Migration

Add YouTube-specific columns to `mindmap_content`.

**Files:**
- Create: `server/migrations/000004_youtube_columns.up.sql`
- Create: `server/migrations/000004_youtube_columns.down.sql`

- [ ] **Step 1: Write up migration**

```sql
-- server/migrations/000004_youtube_columns.up.sql
ALTER TABLE mindmap_content
  ADD COLUMN video_duration INTEGER,
  ADD COLUMN video_thumbnail_url TEXT,
  ADD COLUMN video_channel TEXT,
  ADD COLUMN transcript_source TEXT;

COMMENT ON COLUMN mindmap_content.video_duration IS 'Video duration in seconds, YouTube only';
COMMENT ON COLUMN mindmap_content.video_thumbnail_url IS 'YouTube thumbnail URL from yt-dlp metadata';
COMMENT ON COLUMN mindmap_content.video_channel IS 'YouTube channel name';
COMMENT ON COLUMN mindmap_content.transcript_source IS 'captions or whisper — how the transcript was obtained';
```

- [ ] **Step 2: Write down migration**

```sql
-- server/migrations/000004_youtube_columns.down.sql
ALTER TABLE mindmap_content
  DROP COLUMN IF EXISTS video_duration,
  DROP COLUMN IF EXISTS video_thumbnail_url,
  DROP COLUMN IF EXISTS video_channel,
  DROP COLUMN IF EXISTS transcript_source;
```

- [ ] **Step 3: Run migration**

```bash
cd server && migrate -path migrations -database $DATABASE_URL up
```

Expected: `4/up` applied successfully.

- [ ] **Step 4: Commit**

```bash
git add server/migrations/000004_youtube_columns.up.sql server/migrations/000004_youtube_columns.down.sql
git commit -m "feat(db): add YouTube columns to mindmap_content"
```

---

## Task 2: SQL Queries + sqlc Regeneration

Add query for updating YouTube-specific fields and regenerate Go code.

**Files:**
- Modify: `server/internal/store/queries/content.sql`

- [ ] **Step 1: Add YouTube update query**

Append to `server/internal/store/queries/content.sql`:

```sql
-- name: UpdateContentVideoFields :exec
UPDATE mindmap_content
SET video_duration = $2,
    video_thumbnail_url = $3,
    video_channel = $4,
    transcript_source = $5,
    updated_at = NOW()
WHERE id = $1;
```

- [ ] **Step 2: Add YouTube fields to ListContent and GetContentByID**

Update `ListContent` query to include the 4 new columns in the SELECT:

```sql
-- name: ListContent :many
SELECT id, user_id, source_url, source_type, source_title, source_thumbnail_url,
       summary, tags, key_topics, media_key, processing_status, processing_error,
       video_duration, video_thumbnail_url, video_channel,
       created_at, updated_at
FROM mindmap_content
WHERE user_id = $1 AND deleted_at IS NULL
ORDER BY created_at DESC
LIMIT $2 OFFSET $3;
```

Update `GetContentByID` query to include the 4 new columns:

```sql
-- name: GetContentByID :one
SELECT id, user_id, source_url, source_type, source_title, source_thumbnail_url,
       extracted_text, visual_description, summary, tags, key_topics,
       media_key, processing_status, processing_error,
       video_duration, video_thumbnail_url, video_channel, transcript_source,
       created_at, updated_at
FROM mindmap_content
WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL;
```

- [ ] **Step 3: Regenerate sqlc**

```bash
cd server && sqlc generate
```

Expected: No errors. New Go code generated in `internal/store/`.

- [ ] **Step 4: Update handler response structs**

Update `contentJSON` and `contentListJSON` in `server/internal/handler/saves.go` to include YouTube fields:

Add to `contentJSON` struct (after `MediaKey`):

```go
VideoDuration    *int32  `json:"video_duration"`
VideoThumbnailURL *string `json:"video_thumbnail_url"`
VideoChannel     *string `json:"video_channel"`
TranscriptSource *string `json:"transcript_source"`
```

Add to `contentListJSON` struct (after `MediaKey`):

```go
VideoDuration    *int32  `json:"video_duration"`
VideoThumbnailURL *string `json:"video_thumbnail_url"`
VideoChannel     *string `json:"video_channel"`
```

Update the `List()` and `Get()` handler methods to populate these fields from the sqlc-generated row structs. The exact field names depend on what sqlc generates — match them accordingly.

- [ ] **Step 5: Verify build**

```bash
cd server && go build ./cmd/api
```

Expected: Clean build.

- [ ] **Step 6: Commit**

```bash
git add server/internal/store/ server/internal/handler/saves.go server/internal/store/queries/content.sql
git commit -m "feat(db): add YouTube queries and handler response fields"
```

---

## Task 3: Configuration

Add YouTube-specific config fields.

**Files:**
- Modify: `server/internal/config/config.go`

- [ ] **Step 1: Add config fields**

Add these fields to the `Config` struct after the existing saves fields:

```go
// YouTube (Phase 2)
GroqAPIKey          string
YTDLPPath           string
FFmpegPath          string
YoutubeTempPath     string
YoutubeMaxDuration  int
YoutubeVideoQuality int
YoutubeFramesCap    int
```

- [ ] **Step 2: Add loading logic**

Add to the `Load()` function, after the existing saves config loading:

```go
// YouTube
cfg.GroqAPIKey = os.Getenv("GROQ_API_KEY")
cfg.YTDLPPath = os.Getenv("YTDLP_PATH")
if cfg.YTDLPPath == "" {
    cfg.YTDLPPath = "yt-dlp"
}
cfg.FFmpegPath = os.Getenv("FFMPEG_PATH")
if cfg.FFmpegPath == "" {
    cfg.FFmpegPath = "ffmpeg"
}
cfg.YoutubeTempPath = os.Getenv("YOUTUBE_TEMP_PATH")
if cfg.YoutubeTempPath == "" {
    cfg.YoutubeTempPath = "/tmp/mindtab/youtube"
}
if v := os.Getenv("YOUTUBE_MAX_DURATION_SEC"); v != "" {
    cfg.YoutubeMaxDuration, _ = strconv.Atoi(v)
}
if cfg.YoutubeMaxDuration == 0 {
    cfg.YoutubeMaxDuration = 7200
}
if v := os.Getenv("YOUTUBE_VIDEO_QUALITY"); v != "" {
    cfg.YoutubeVideoQuality, _ = strconv.Atoi(v)
}
if cfg.YoutubeVideoQuality == 0 {
    cfg.YoutubeVideoQuality = 360
}
if v := os.Getenv("YOUTUBE_FRAMES_PER_MIN_CAP"); v != "" {
    cfg.YoutubeFramesCap, _ = strconv.Atoi(v)
}
if cfg.YoutubeFramesCap == 0 {
    cfg.YoutubeFramesCap = 5
}
```

- [ ] **Step 3: Verify build**

```bash
cd server && go build ./cmd/api
```

- [ ] **Step 4: Commit**

```bash
git add server/internal/config/config.go
git commit -m "feat(config): add YouTube configuration fields"
```

---

## Task 4: Processor Interface — Add LockTTL

Add `LockTTL()` to the `Processor` interface and update existing processors and dispatcher.

**Files:**
- Modify: `server/internal/worker/processor.go`
- Modify: `server/internal/worker/processors/article.go`
- Modify: `server/internal/worker/processors/image.go`
- Modify: `server/internal/worker/dispatcher.go`

- [ ] **Step 1: Add LockTTL to Processor interface**

In `server/internal/worker/processor.go`, add `time` import and update the interface:

```go
import "time"
```

```go
type Processor interface {
	ContentType() string
	Steps() []string
	LockTTL() time.Duration
	Execute(ctx context.Context, step string, job *Job, prevResults StepResults) (*StepResult, error)
}
```

- [ ] **Step 2: Add LockTTL to ArticleProcessor**

In `server/internal/worker/processors/article.go`, add after the `Steps()` method:

```go
func (p *ArticleProcessor) LockTTL() time.Duration {
	return 5 * time.Minute
}
```

Add `"time"` to the import block.

- [ ] **Step 3: Add LockTTL to ImageProcessor**

In `server/internal/worker/processors/image.go`, add after the `Steps()` method:

```go
func (p *ImageProcessor) LockTTL() time.Duration {
	return 5 * time.Minute
}
```

Add `"time"` to the import block.

- [ ] **Step 4: Update dispatcher to use proc.LockTTL()**

In `server/internal/worker/dispatcher.go`, find the `processJob` method where `AcquireLock` is called. The current call looks like:

```go
locked := d.consumer.AcquireLock(ctx, payload.JobID, 5*time.Minute)
```

Change it to:

```go
proc, ok := d.processors[payload.ContentType]
if !ok {
    d.logger.Error("no processor registered", "content_type", payload.ContentType)
    return
}
locked := d.consumer.AcquireLock(ctx, payload.JobID, proc.LockTTL())
```

Note: If the processor lookup already happens before the lock (check exact line), just use the existing `proc` variable. The key change is replacing the hardcoded `5*time.Minute` with `proc.LockTTL()`.

- [ ] **Step 5: Verify build**

```bash
cd server && go build ./cmd/api
```

- [ ] **Step 6: Commit**

```bash
git add server/internal/worker/processor.go server/internal/worker/processors/article.go server/internal/worker/processors/image.go server/internal/worker/dispatcher.go
git commit -m "feat(worker): add LockTTL to Processor interface"
```

---

## Task 5: YTDLPService

Wrap the yt-dlp binary for metadata extraction, video download, and caption retrieval.

**Files:**
- Create: `server/internal/services/ytdlp.go`

- [ ] **Step 1: Define the service**

```go
package services

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

type VideoMetadata struct {
	ID           string `json:"id"`
	Title        string `json:"title"`
	Duration     int    `json:"duration"`
	ThumbnailURL string `json:"thumbnail"`
	Channel      string `json:"channel"`
	HasCaptions  bool
}

type YTDLP struct {
	binPath string
	logger  *slog.Logger
}

func NewYTDLP(binPath string, logger *slog.Logger) *YTDLP {
	return &YTDLP{binPath: binPath, logger: logger}
}

// GetMetadata extracts video metadata without downloading.
func (y *YTDLP) GetMetadata(ctx context.Context, url string) (*VideoMetadata, error) {
	cmd := exec.CommandContext(ctx, y.binPath, "--dump-json", "--no-download", url)
	out, err := cmd.Output()
	if err != nil {
		return nil, fmt.Errorf("yt-dlp metadata failed: %w", err)
	}

	var raw struct {
		ID              string `json:"id"`
		Title           string `json:"title"`
		Duration        int    `json:"duration"`
		Thumbnail       string `json:"thumbnail"`
		Channel         string `json:"channel"`
		Subtitles       map[string]any `json:"subtitles"`
		AutomaticCaptions map[string]any `json:"automatic_captions"`
	}
	if err := json.Unmarshal(out, &raw); err != nil {
		return nil, fmt.Errorf("yt-dlp metadata parse failed: %w", err)
	}

	hasCaptions := len(raw.Subtitles) > 0 || len(raw.AutomaticCaptions) > 0

	return &VideoMetadata{
		ID:           raw.ID,
		Title:        raw.Title,
		Duration:     raw.Duration,
		ThumbnailURL: raw.Thumbnail,
		Channel:      raw.Channel,
		HasCaptions:  hasCaptions,
	}, nil
}

// Download downloads the video at the specified max quality.
func (y *YTDLP) Download(ctx context.Context, url string, outputDir string, maxHeight int) (string, error) {
	if err := os.MkdirAll(outputDir, 0755); err != nil {
		return "", fmt.Errorf("create output dir: %w", err)
	}

	outputTemplate := filepath.Join(outputDir, "video.%(ext)s")
	formatStr := fmt.Sprintf("bestvideo[height<=%d]+bestaudio/best[height<=%d]", maxHeight, maxHeight)

	cmd := exec.CommandContext(ctx, y.binPath,
		"-f", formatStr,
		"--merge-output-format", "mp4",
		"-o", outputTemplate,
		"--no-playlist",
		url,
	)
	if out, err := cmd.CombinedOutput(); err != nil {
		return "", fmt.Errorf("yt-dlp download failed: %w\noutput: %s", err, string(out))
	}

	// Find the downloaded file (yt-dlp may merge to mp4)
	matches, err := filepath.Glob(filepath.Join(outputDir, "video.*"))
	if err != nil || len(matches) == 0 {
		return "", fmt.Errorf("downloaded video file not found in %s", outputDir)
	}
	return matches[0], nil
}

// GetCaptions extracts captions/subtitles for the given language.
// Returns the caption text, or empty string if no captions available.
func (y *YTDLP) GetCaptions(ctx context.Context, url string, lang string, outputDir string) (string, error) {
	if err := os.MkdirAll(outputDir, 0755); err != nil {
		return "", fmt.Errorf("create output dir: %w", err)
	}

	outputTemplate := filepath.Join(outputDir, "subs")
	cmd := exec.CommandContext(ctx, y.binPath,
		"--write-auto-sub",
		"--write-sub",
		"--sub-lang", lang,
		"--sub-format", "vtt",
		"--skip-download",
		"-o", outputTemplate,
		url,
	)
	if out, err := cmd.CombinedOutput(); err != nil {
		y.logger.Warn("yt-dlp caption extraction failed", "error", err, "output", string(out))
		return "", nil // Not an error — fallback to Whisper
	}

	// Find the subtitle file
	matches, err := filepath.Glob(filepath.Join(outputDir, "subs*.vtt"))
	if err != nil || len(matches) == 0 {
		return "", nil // No captions found
	}

	data, err := os.ReadFile(matches[0])
	if err != nil {
		return "", fmt.Errorf("read caption file: %w", err)
	}

	return cleanVTT(string(data)), nil
}

// cleanVTT strips VTT headers and timestamps, returning plain text.
func cleanVTT(vtt string) string {
	lines := strings.Split(vtt, "\n")
	var text []string
	seen := make(map[string]bool)

	for _, line := range lines {
		line = strings.TrimSpace(line)
		// Skip VTT headers, timestamps, and empty lines
		if line == "" || line == "WEBVTT" || strings.Contains(line, "-->") ||
			strings.HasPrefix(line, "Kind:") || strings.HasPrefix(line, "Language:") ||
			strings.HasPrefix(line, "NOTE") {
			continue
		}
		// Skip numeric cue identifiers
		if _, err := fmt.Sscanf(line, "%d", new(int)); err == nil && !strings.Contains(line, " ") {
			continue
		}
		// Strip HTML tags from captions
		cleaned := stripHTMLTags(line)
		if cleaned != "" && !seen[cleaned] {
			seen[cleaned] = true
			text = append(text, cleaned)
		}
	}
	return strings.Join(text, " ")
}

// stripHTMLTags removes HTML tags from a string.
func stripHTMLTags(s string) string {
	var result strings.Builder
	inTag := false
	for _, r := range s {
		if r == '<' {
			inTag = true
			continue
		}
		if r == '>' {
			inTag = false
			continue
		}
		if !inTag {
			result.WriteRune(r)
		}
	}
	return strings.TrimSpace(result.String())
}
```

- [ ] **Step 2: Verify build**

```bash
cd server && go build ./cmd/api
```

- [ ] **Step 3: Commit**

```bash
git add server/internal/services/ytdlp.go
git commit -m "feat(services): add YTDLPService for metadata, download, and captions"
```

---

## Task 6: FFmpegService

Wrap the ffmpeg binary for scene-based frame extraction and audio extraction.

**Files:**
- Create: `server/internal/services/ffmpeg.go`

- [ ] **Step 1: Define the service**

```go
package services

import (
	"context"
	"fmt"
	"math"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"log/slog"
)

type FFmpeg struct {
	binPath string
	logger  *slog.Logger
}

func NewFFmpeg(binPath string, logger *slog.Logger) *FFmpeg {
	return &FFmpeg{binPath: binPath, logger: logger}
}

// ExtractFrames runs scene detection and extracts keyframes.
// sceneThreshold is typically 0.3 (0.0–1.0, lower = more sensitive).
// framesPerMinCap limits frames to cap * video_duration_minutes.
// durationSec is the video duration used to calculate the cap.
func (f *FFmpeg) ExtractFrames(ctx context.Context, videoPath string, outputDir string, sceneThreshold float64, framesPerMinCap int, durationSec int) ([]string, error) {
	if err := os.MkdirAll(outputDir, 0755); err != nil {
		return nil, fmt.Errorf("create frames dir: %w", err)
	}

	outputPattern := filepath.Join(outputDir, "frame_%04d.jpg")
	filter := fmt.Sprintf("select='gt(scene,%f)',scale=-1:360", sceneThreshold)

	cmd := exec.CommandContext(ctx, f.binPath,
		"-i", videoPath,
		"-vf", filter,
		"-vsync", "vfn",
		"-q:v", "5", // JPEG quality (2=best, 31=worst), 5 is good enough
		outputPattern,
	)
	if out, err := cmd.CombinedOutput(); err != nil {
		return nil, fmt.Errorf("ffmpeg frame extraction failed: %w\noutput: %s", err, string(out))
	}

	// Collect extracted frames
	matches, err := filepath.Glob(filepath.Join(outputDir, "frame_*.jpg"))
	if err != nil {
		return nil, fmt.Errorf("glob frames: %w", err)
	}
	sort.Strings(matches)

	// Apply frame cap: max framesPerMinCap * duration_in_minutes
	durationMin := float64(durationSec) / 60.0
	if durationMin < 1 {
		durationMin = 1
	}
	maxFrames := int(math.Ceil(durationMin * float64(framesPerMinCap)))

	if len(matches) > maxFrames {
		matches = uniformDownsample(matches, maxFrames)
	}

	f.logger.Info("frames extracted",
		"total_detected", len(matches),
		"cap", maxFrames,
		"kept", len(matches),
	)

	return matches, nil
}

// uniformDownsample selects n items uniformly from the slice.
func uniformDownsample(items []string, n int) []string {
	if n >= len(items) {
		return items
	}
	result := make([]string, 0, n)
	step := float64(len(items)) / float64(n)
	for i := 0; i < n; i++ {
		idx := int(math.Round(float64(i) * step))
		if idx >= len(items) {
			idx = len(items) - 1
		}
		result = append(result, items[idx])
	}
	return result
}

// ExtractAudio extracts the audio track from a video file.
func (f *FFmpeg) ExtractAudio(ctx context.Context, videoPath string, outputPath string) error {
	dir := filepath.Dir(outputPath)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return fmt.Errorf("create audio dir: %w", err)
	}

	cmd := exec.CommandContext(ctx, f.binPath,
		"-i", videoPath,
		"-vn",           // No video
		"-acodec", "libopus",
		"-b:a", "48k",   // Low bitrate — sufficient for speech
		"-y",            // Overwrite
		outputPath,
	)
	if out, err := cmd.CombinedOutput(); err != nil {
		return fmt.Errorf("ffmpeg audio extraction failed: %w\noutput: %s", err, string(out))
	}
	return nil
}
```

- [ ] **Step 2: Verify build**

```bash
cd server && go build ./cmd/api
```

- [ ] **Step 3: Commit**

```bash
git add server/internal/services/ffmpeg.go
git commit -m "feat(services): add FFmpegService for frame and audio extraction"
```

---

## Task 7: TranscriptionProvider + Groq Whisper

Define the transcription provider interface and implement the Groq Whisper provider.

**Files:**
- Create: `server/internal/providers/transcription/interface.go`
- Create: `server/internal/providers/transcription/groq.go`

- [ ] **Step 1: Define the interface**

```go
// server/internal/providers/transcription/interface.go
package transcription

import "context"

type TranscriptionResult struct {
	Text string
}

type TranscriptionProvider interface {
	Transcribe(ctx context.Context, audioPath string) (*TranscriptionResult, error)
	Name() string
}
```

- [ ] **Step 2: Implement Groq provider**

```go
// server/internal/providers/transcription/groq.go
package transcription

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"os"
	"path/filepath"
	"time"

	"github.com/ksushant6566/mindtab-v2/server/internal/providers"
)

type GroqProvider struct {
	apiKey     string
	httpClient *http.Client
}

func NewGroqProvider(apiKey string) *GroqProvider {
	return &GroqProvider{
		apiKey: apiKey,
		httpClient: &http.Client{
			Timeout: 10 * time.Minute, // Long videos can take a while
		},
	}
}

func (g *GroqProvider) Name() string {
	return "groq-whisper"
}

func (g *GroqProvider) Transcribe(ctx context.Context, audioPath string) (*TranscriptionResult, error) {
	file, err := os.Open(audioPath)
	if err != nil {
		return nil, providers.NewPermanentError(g.Name(), fmt.Errorf("open audio file: %w", err))
	}
	defer file.Close()

	var body bytes.Buffer
	writer := multipart.NewWriter(&body)

	part, err := writer.CreateFormFile("file", filepath.Base(audioPath))
	if err != nil {
		return nil, providers.NewPermanentError(g.Name(), fmt.Errorf("create form file: %w", err))
	}
	if _, err := io.Copy(part, file); err != nil {
		return nil, providers.NewPermanentError(g.Name(), fmt.Errorf("copy audio data: %w", err))
	}

	_ = writer.WriteField("model", "whisper-large-v3")
	_ = writer.WriteField("response_format", "text")
	writer.Close()

	req, err := http.NewRequestWithContext(ctx, "POST", "https://api.groq.com/openai/v1/audio/transcriptions", &body)
	if err != nil {
		return nil, providers.NewPermanentError(g.Name(), fmt.Errorf("create request: %w", err))
	}
	req.Header.Set("Authorization", "Bearer "+g.apiKey)
	req.Header.Set("Content-Type", writer.FormDataContentType())

	resp, err := g.httpClient.Do(req)
	if err != nil {
		return nil, providers.NewRetriableError(g.Name(), fmt.Errorf("groq request failed: %w", err))
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, providers.NewRetriableError(g.Name(), fmt.Errorf("read response: %w", err))
	}

	if resp.StatusCode == 401 || resp.StatusCode == 403 {
		return nil, providers.NewPermanentError(g.Name(), fmt.Errorf("auth error: %s", string(respBody)))
	}
	if resp.StatusCode == 429 || resp.StatusCode >= 500 {
		return nil, providers.NewRetriableError(g.Name(), fmt.Errorf("groq error %d: %s", resp.StatusCode, string(respBody)))
	}
	if resp.StatusCode != 200 {
		return nil, providers.NewPermanentError(g.Name(), fmt.Errorf("groq error %d: %s", resp.StatusCode, string(respBody)))
	}

	// response_format=text returns plain text, but check for JSON wrapper
	text := string(respBody)
	var jsonResp struct {
		Text string `json:"text"`
	}
	if json.Unmarshal(respBody, &jsonResp) == nil && jsonResp.Text != "" {
		text = jsonResp.Text
	}

	return &TranscriptionResult{Text: text}, nil
}
```

- [ ] **Step 3: Verify build**

```bash
cd server && go build ./cmd/api
```

- [ ] **Step 4: Commit**

```bash
git add server/internal/providers/transcription/
git commit -m "feat(providers): add TranscriptionProvider interface and Groq Whisper implementation"
```

---

## Task 8: YouTube Step Functions — metadata, download, transcribe, extract_frames

The 4 new step functions for the YouTube pipeline.

**Files:**
- Create: `server/internal/worker/steps/metadata.go`
- Create: `server/internal/worker/steps/download.go`
- Create: `server/internal/worker/steps/transcribe.go`
- Create: `server/internal/worker/steps/extract_frames.go`

- [ ] **Step 1: metadata step**

```go
// server/internal/worker/steps/metadata.go
package steps

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/ksushant6566/mindtab-v2/server/internal/services"
	"github.com/ksushant6566/mindtab-v2/server/internal/worker"
)

type MetadataResult struct {
	VideoID      string `json:"video_id"`
	Title        string `json:"title"`
	Duration     int    `json:"duration"`
	ThumbnailURL string `json:"thumbnail_url"`
	Channel      string `json:"channel"`
	HasCaptions  bool   `json:"has_captions"`
}

// Metadata extracts YouTube video metadata via yt-dlp.
// Returns a permanent error if the video exceeds maxDuration.
func Metadata(ctx context.Context, ytdlp *services.YTDLP, sourceURL string, maxDuration int) (*worker.StepResult, error) {
	meta, err := ytdlp.GetMetadata(ctx, sourceURL)
	if err != nil {
		return nil, fmt.Errorf("get metadata: %w", err)
	}

	if meta.Duration > maxDuration {
		return nil, fmt.Errorf("video duration %ds exceeds maximum %ds", meta.Duration, maxDuration)
	}

	result := MetadataResult{
		VideoID:      meta.ID,
		Title:        meta.Title,
		Duration:     meta.Duration,
		ThumbnailURL: meta.ThumbnailURL,
		Channel:      meta.Channel,
		HasCaptions:  meta.HasCaptions,
	}

	data, err := json.Marshal(result)
	if err != nil {
		return nil, fmt.Errorf("marshal metadata result: %w", err)
	}
	return &worker.StepResult{Data: data}, nil
}
```

- [ ] **Step 2: download step**

```go
// server/internal/worker/steps/download.go
package steps

import (
	"context"
	"encoding/json"
	"fmt"
	"path/filepath"

	"github.com/google/uuid"
	"github.com/ksushant6566/mindtab-v2/server/internal/services"
	"github.com/ksushant6566/mindtab-v2/server/internal/worker"
)

type DownloadResult struct {
	VideoFilePath string `json:"video_file_path"`
}

// Download downloads the YouTube video at the specified quality.
func Download(ctx context.Context, ytdlp *services.YTDLP, sourceURL string, tempBasePath string, jobID uuid.UUID, maxHeight int) (*worker.StepResult, error) {
	outputDir := filepath.Join(tempBasePath, jobID.String())

	videoPath, err := ytdlp.Download(ctx, sourceURL, outputDir, maxHeight)
	if err != nil {
		return nil, fmt.Errorf("download video: %w", err)
	}

	result := DownloadResult{VideoFilePath: videoPath}
	data, err := json.Marshal(result)
	if err != nil {
		return nil, fmt.Errorf("marshal download result: %w", err)
	}
	return &worker.StepResult{Data: data}, nil
}
```

- [ ] **Step 3: transcribe step**

```go
// server/internal/worker/steps/transcribe.go
package steps

import (
	"context"
	"encoding/json"
	"fmt"
	"path/filepath"

	"github.com/ksushant6566/mindtab-v2/server/internal/providers"
	"github.com/ksushant6566/mindtab-v2/server/internal/providers/transcription"
	"github.com/ksushant6566/mindtab-v2/server/internal/services"
	"github.com/ksushant6566/mindtab-v2/server/internal/worker"
)

type TranscribeResult struct {
	Transcript       string `json:"transcript"`
	TranscriptSource string `json:"transcript_source"` // "captions" or "whisper"
}

// Transcribe gets the video transcript. Tries YouTube captions first, falls back to Groq Whisper.
func Transcribe(
	ctx context.Context,
	ytdlp *services.YTDLP,
	ffmpeg *services.FFmpeg,
	transcriptionChain *providers.Chain[transcription.TranscriptionProvider],
	sourceURL string,
	videoFilePath string,
	hasCaptions bool,
) (*worker.StepResult, error) {
	var transcript string
	var source string

	// Primary path: YouTube captions
	if hasCaptions {
		captionDir := filepath.Dir(videoFilePath)
		text, err := ytdlp.GetCaptions(ctx, sourceURL, "en", captionDir)
		if err == nil && text != "" {
			transcript = text
			source = "captions"
		}
	}

	// Fallback path: extract audio → Groq Whisper
	if transcript == "" {
		audioPath := filepath.Join(filepath.Dir(videoFilePath), "audio.opus")
		if err := ffmpeg.ExtractAudio(ctx, videoFilePath, audioPath); err != nil {
			return nil, fmt.Errorf("extract audio: %w", err)
		}

		var transcribeErr error
		err := transcriptionChain.Execute(func(name string, provider transcription.TranscriptionProvider) error {
			result, err := provider.Transcribe(ctx, audioPath)
			if err != nil {
				return err
			}
			transcript = result.Text
			source = "whisper"
			return nil
		})
		if err != nil {
			transcribeErr = err
		}
		if transcript == "" && transcribeErr != nil {
			return nil, fmt.Errorf("transcription failed: %w", transcribeErr)
		}
	}

	if transcript == "" {
		return nil, fmt.Errorf("no transcript obtained: no captions and transcription failed")
	}

	result := TranscribeResult{
		Transcript:       transcript,
		TranscriptSource: source,
	}
	data, err := json.Marshal(result)
	if err != nil {
		return nil, fmt.Errorf("marshal transcribe result: %w", err)
	}
	return &worker.StepResult{Data: data}, nil
}
```

- [ ] **Step 4: extract_frames step**

```go
// server/internal/worker/steps/extract_frames.go
package steps

import (
	"context"
	"encoding/json"
	"fmt"
	"path/filepath"

	"github.com/ksushant6566/mindtab-v2/server/internal/services"
	"github.com/ksushant6566/mindtab-v2/server/internal/worker"
)

type ExtractFramesResult struct {
	FramePaths []string `json:"frame_paths"`
	FrameCount int      `json:"frame_count"`
}

// ExtractFrames runs ffmpeg scene detection on the video and extracts keyframes.
func ExtractFrames(
	ctx context.Context,
	ffmpeg *services.FFmpeg,
	videoFilePath string,
	durationSec int,
	sceneThreshold float64,
	framesPerMinCap int,
) (*worker.StepResult, error) {
	framesDir := filepath.Join(filepath.Dir(videoFilePath), "frames")

	frames, err := ffmpeg.ExtractFrames(ctx, videoFilePath, framesDir, sceneThreshold, framesPerMinCap, durationSec)
	if err != nil {
		return nil, fmt.Errorf("extract frames: %w", err)
	}

	result := ExtractFramesResult{
		FramePaths: frames,
		FrameCount: len(frames),
	}
	data, err := json.Marshal(result)
	if err != nil {
		return nil, fmt.Errorf("marshal extract_frames result: %w", err)
	}
	return &worker.StepResult{Data: data}, nil
}
```

- [ ] **Step 5: Verify build**

```bash
cd server && go build ./cmd/api
```

- [ ] **Step 6: Commit**

```bash
git add server/internal/worker/steps/metadata.go server/internal/worker/steps/download.go server/internal/worker/steps/transcribe.go server/internal/worker/steps/extract_frames.go
git commit -m "feat(worker): add YouTube step functions — metadata, download, transcribe, extract_frames"
```

---

## Task 9: BatchVision Step

Add a `BatchVision` function to the vision step that processes multiple frame images.

**Files:**
- Modify: `server/internal/worker/steps/vision.go`

- [ ] **Step 1: Add BatchVision function**

Add this function to `server/internal/worker/steps/vision.go`, below the existing `Vision()` function:

```go
// BatchVisionResult holds combined visual descriptions from multiple frames.
type BatchVisionResult struct {
	VisualDescription string `json:"visual_description"`
	FrameCount        int    `json:"frame_count"`
}

// BatchVision sends multiple frame images to the LLM for visual description.
// Frames are sent in a single multimodal call with all images attached.
// For large frame counts (>20), frames are batched into groups and descriptions concatenated.
func BatchVision(ctx context.Context, llmChain *providers.Chain[llm.LLMProvider], framePaths []string) (*worker.StepResult, error) {
	if len(framePaths) == 0 {
		result := BatchVisionResult{VisualDescription: "", FrameCount: 0}
		data, _ := json.Marshal(result)
		return &worker.StepResult{Data: data}, nil
	}

	const batchSize = 20
	var allDescriptions []string

	for i := 0; i < len(framePaths); i += batchSize {
		end := i + batchSize
		if end > len(framePaths) {
			end = len(framePaths)
		}
		batch := framePaths[i:end]

		var images []llm.ImageInput
		for _, path := range batch {
			imgData, err := os.ReadFile(path)
			if err != nil {
				continue // Skip unreadable frames
			}
			images = append(images, llm.ImageInput{
				Data:      imgData,
				MediaType: "image/jpeg",
			})
		}

		if len(images) == 0 {
			continue
		}

		batchPrompt := fmt.Sprintf("Describe what is shown in these %d video frames. For each frame, identify: slides, code, diagrams, UI elements, text, people, or scenes. Be concise — one sentence per frame.", len(images))

		var description string
		err := llmChain.Execute(func(name string, provider llm.LLMProvider) error {
			resp, err := provider.Complete(ctx, llm.LLMRequest{
				SystemPrompt: "You are a video frame analyzer. Describe the visual content of video frames concisely.",
				UserPrompt:   batchPrompt,
				Images:       images,
				MaxTokens:    2000,
			})
			if err != nil {
				return err
			}
			description = resp.Text
			return nil
		})
		if err != nil {
			return nil, fmt.Errorf("batch vision failed: %w", err)
		}

		allDescriptions = append(allDescriptions, description)
	}

	combined := strings.Join(allDescriptions, "\n\n")
	result := BatchVisionResult{
		VisualDescription: combined,
		FrameCount:        len(framePaths),
	}
	data, err := json.Marshal(result)
	if err != nil {
		return nil, fmt.Errorf("marshal batch vision result: %w", err)
	}
	return &worker.StepResult{Data: data}, nil
}
```

Add the necessary imports to the file: `"fmt"`, `"os"`, `"strings"` and the providers/llm import paths (check existing imports in the file and add any missing ones).

- [ ] **Step 2: Verify build**

```bash
cd server && go build ./cmd/api
```

- [ ] **Step 3: Commit**

```bash
git add server/internal/worker/steps/vision.go
git commit -m "feat(worker): add BatchVision for multi-frame YouTube processing"
```

---

## Task 10: Update Store Step for YouTube Fields

Update the store step to handle YouTube-specific metadata and persist the new columns.

**Files:**
- Modify: `server/internal/worker/steps/store.go`

- [ ] **Step 1: Add YouTube metadata handling to Store()**

In the `Store()` function, add unmarshaling of the metadata result and the call to `UpdateContentVideoFields`. Add this after the existing step result unmarshaling and before the `UpdateContentResults` call:

```go
// Unmarshal YouTube metadata if present
var metadataResult MetadataResult
if raw, ok := prevResults["metadata"]; ok && raw != nil {
	json.Unmarshal(raw.Data, &metadataResult)
}

// Unmarshal transcribe result for transcript_source
var transcribeResult TranscribeResult
if raw, ok := prevResults["transcribe"]; ok && raw != nil {
	json.Unmarshal(raw.Data, &transcribeResult)
}
```

After the existing `UpdateContentResults` and `UpdateContentEmbedding` calls, add:

```go
// Persist YouTube-specific fields if this is a YouTube save
if metadataResult.VideoID != "" {
	videoDuration := int32(metadataResult.Duration)
	err := queries.UpdateContentVideoFields(ctx, store.UpdateContentVideoFieldsParams{
		ID:                contentID,
		VideoDuration:     &videoDuration,
		VideoThumbnailUrl: pgtextFrom(metadataResult.ThumbnailURL),
		VideoChannel:      pgtextFrom(metadataResult.Channel),
		TranscriptSource:  pgtextFrom(transcribeResult.TranscriptSource),
	})
	if err != nil {
		return nil, fmt.Errorf("update youtube fields: %w", err)
	}
}
```

Note: The exact param struct name (`UpdateContentVideoFieldsParams`) depends on what sqlc generated in Task 2. Match it to the generated code.

- [ ] **Step 2: Handle YouTube transcript as extracted_text**

In the store step, the `extracted_text` field is populated from the extract step result for articles. For YouTube, it comes from the transcribe step. Add logic to use the transcribe result's transcript as `extracted_text` when no extract result exists:

```go
// For YouTube: use transcript as extracted_text
if extractResult.Text == "" && transcribeResult.Transcript != "" {
	extractResult.Text = transcribeResult.Transcript
}
```

Similarly, for the `visual_description`, check for the batch vision result:

```go
// For YouTube: use batch vision result as visual_description
var batchVisionResult BatchVisionResult
if raw, ok := prevResults["vision"]; ok && raw != nil {
	// Try batch vision result first (YouTube), fall back to single vision result (images)
	if err := json.Unmarshal(raw.Data, &batchVisionResult); err == nil && batchVisionResult.VisualDescription != "" {
		visionResult.VisualDescription = batchVisionResult.VisualDescription
	}
}
```

- [ ] **Step 3: Verify build**

```bash
cd server && go build ./cmd/api
```

- [ ] **Step 4: Commit**

```bash
git add server/internal/worker/steps/store.go
git commit -m "feat(worker): update store step to persist YouTube metadata"
```

---

## Task 11: YouTubeProcessor

The main processor that wires all steps together.

**Files:**
- Create: `server/internal/worker/processors/youtube.go`

- [ ] **Step 1: Implement the processor**

```go
package processors

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/ksushant6566/mindtab-v2/server/internal/config"
	"github.com/ksushant6566/mindtab-v2/server/internal/providers"
	"github.com/ksushant6566/mindtab-v2/server/internal/providers/embedding"
	"github.com/ksushant6566/mindtab-v2/server/internal/providers/llm"
	"github.com/ksushant6566/mindtab-v2/server/internal/providers/transcription"
	"github.com/ksushant6566/mindtab-v2/server/internal/services"
	"github.com/ksushant6566/mindtab-v2/server/internal/store"
	"github.com/ksushant6566/mindtab-v2/server/internal/worker"
	"github.com/ksushant6566/mindtab-v2/server/internal/worker/steps"

	"github.com/jackc/pgx/v5/pgxpool"
)

type YoutubeProcessor struct {
	ytdlp              *services.YTDLP
	ffmpeg             *services.FFmpeg
	transcriptionChain *providers.Chain[transcription.TranscriptionProvider]
	llmChain           *providers.Chain[llm.LLMProvider]
	embeddingChain     *providers.Chain[embedding.EmbeddingProvider]
	queries            *store.Queries
	pool               *pgxpool.Pool
	cfg                *config.Config
}

func NewYoutubeProcessor(
	ytdlp *services.YTDLP,
	ffmpeg *services.FFmpeg,
	transcriptionChain *providers.Chain[transcription.TranscriptionProvider],
	llmChain *providers.Chain[llm.LLMProvider],
	embeddingChain *providers.Chain[embedding.EmbeddingProvider],
	queries *store.Queries,
	pool *pgxpool.Pool,
	cfg *config.Config,
) *YoutubeProcessor {
	return &YoutubeProcessor{
		ytdlp:              ytdlp,
		ffmpeg:             ffmpeg,
		transcriptionChain: transcriptionChain,
		llmChain:           llmChain,
		embeddingChain:     embeddingChain,
		queries:            queries,
		pool:               pool,
		cfg:                cfg,
	}
}

func (p *YoutubeProcessor) ContentType() string {
	return "youtube"
}

func (p *YoutubeProcessor) Steps() []string {
	return []string{"metadata", "download", "transcribe", "extract_frames", "vision", "summarize", "embed", "store"}
}

func (p *YoutubeProcessor) LockTTL() time.Duration {
	return 15 * time.Minute
}

func (p *YoutubeProcessor) Execute(ctx context.Context, step string, job *worker.Job, prevResults worker.StepResults) (*worker.StepResult, error) {
	switch step {
	case "metadata":
		return p.metadata(ctx, job)
	case "download":
		return p.download(ctx, job)
	case "transcribe":
		return p.transcribe(ctx, job, prevResults)
	case "extract_frames":
		return p.extractFrames(ctx, job, prevResults)
	case "vision":
		return p.vision(ctx, prevResults)
	case "summarize":
		return p.summarize(ctx, prevResults)
	case "embed":
		return p.embed(ctx, prevResults)
	case "store":
		return steps.Store(ctx, p.queries, p.pool, job.ContentID, job.UserID, prevResults)
	default:
		return nil, fmt.Errorf("unknown step: %s", step)
	}
}

func (p *YoutubeProcessor) metadata(ctx context.Context, job *worker.Job) (*worker.StepResult, error) {
	return steps.Metadata(ctx, p.ytdlp, job.SourceURL, p.cfg.YoutubeMaxDuration)
}

func (p *YoutubeProcessor) download(ctx context.Context, job *worker.Job) (*worker.StepResult, error) {
	return steps.Download(ctx, p.ytdlp, job.SourceURL, p.cfg.YoutubeTempPath, job.ID, p.cfg.YoutubeVideoQuality)
}

func (p *YoutubeProcessor) transcribe(ctx context.Context, job *worker.Job, prevResults worker.StepResults) (*worker.StepResult, error) {
	// Get metadata to check for captions
	var metaResult steps.MetadataResult
	if raw, ok := prevResults["metadata"]; ok {
		json.Unmarshal(raw.Data, &metaResult)
	}

	// Get download result for video path
	var dlResult steps.DownloadResult
	if raw, ok := prevResults["download"]; ok {
		json.Unmarshal(raw.Data, &dlResult)
	}

	return steps.Transcribe(ctx, p.ytdlp, p.ffmpeg, p.transcriptionChain, job.SourceURL, dlResult.VideoFilePath, metaResult.HasCaptions)
}

func (p *YoutubeProcessor) extractFrames(ctx context.Context, job *worker.Job, prevResults worker.StepResults) (*worker.StepResult, error) {
	var dlResult steps.DownloadResult
	if raw, ok := prevResults["download"]; ok {
		json.Unmarshal(raw.Data, &dlResult)
	}

	var metaResult steps.MetadataResult
	if raw, ok := prevResults["metadata"]; ok {
		json.Unmarshal(raw.Data, &metaResult)
	}

	return steps.ExtractFrames(ctx, p.ffmpeg, dlResult.VideoFilePath, metaResult.Duration, 0.3, p.cfg.YoutubeFramesCap)
}

func (p *YoutubeProcessor) vision(ctx context.Context, prevResults worker.StepResults) (*worker.StepResult, error) {
	var framesResult steps.ExtractFramesResult
	if raw, ok := prevResults["extract_frames"]; ok {
		json.Unmarshal(raw.Data, &framesResult)
	}

	return steps.BatchVision(ctx, p.llmChain, framesResult.FramePaths)
}

func (p *YoutubeProcessor) summarize(ctx context.Context, prevResults worker.StepResults) (*worker.StepResult, error) {
	// Build input text from transcript + visual descriptions
	var transcribeResult steps.TranscribeResult
	if raw, ok := prevResults["transcribe"]; ok {
		json.Unmarshal(raw.Data, &transcribeResult)
	}

	var visionResult steps.BatchVisionResult
	if raw, ok := prevResults["vision"]; ok {
		json.Unmarshal(raw.Data, &visionResult)
	}

	input := transcribeResult.Transcript
	if visionResult.VisualDescription != "" {
		input += "\n\n[Visual content from video frames]\n" + visionResult.VisualDescription
	}

	return steps.Summarize(ctx, p.llmChain, input)
}

func (p *YoutubeProcessor) embed(ctx context.Context, prevResults worker.StepResults) (*worker.StepResult, error) {
	var summarizeResult steps.SummarizeResult
	if raw, ok := prevResults["summarize"]; ok {
		json.Unmarshal(raw.Data, &summarizeResult)
	}

	var transcribeResult steps.TranscribeResult
	if raw, ok := prevResults["transcribe"]; ok {
		json.Unmarshal(raw.Data, &transcribeResult)
	}

	// Embed: summary + first 2000 chars of transcript
	text := summarizeResult.Summary
	if len(transcribeResult.Transcript) > 2000 {
		text += "\n" + transcribeResult.Transcript[:2000]
	} else if transcribeResult.Transcript != "" {
		text += "\n" + transcribeResult.Transcript
	}

	return steps.Embed(ctx, p.embeddingChain, text)
}
```

- [ ] **Step 2: Verify build**

```bash
cd server && go build ./cmd/api
```

- [ ] **Step 3: Commit**

```bash
git add server/internal/worker/processors/youtube.go
git commit -m "feat(worker): add YouTubeProcessor with 8-step pipeline"
```

---

## Task 12: Handler — YouTube URL Detection

Add YouTube URL detection to the saves handler so YouTube URLs route to the youtube processor.

**Files:**
- Modify: `server/internal/handler/saves.go`

- [ ] **Step 1: Add isYouTubeURL function**

Add this function to `server/internal/handler/saves.go`:

```go
// isYouTubeURL checks if a URL is a YouTube video or short.
func isYouTubeURL(rawURL string) bool {
	u, err := url.Parse(rawURL)
	if err != nil {
		return false
	}
	host := strings.ToLower(u.Hostname())
	youtubeHosts := map[string]bool{
		"youtube.com":         true,
		"www.youtube.com":     true,
		"m.youtube.com":       true,
		"youtu.be":            true,
		"youtube-nocookie.com": true,
		"www.youtube-nocookie.com": true,
	}
	if !youtubeHosts[host] {
		return false
	}
	// Validate it's a video/shorts URL (not channel, playlist-only, etc.)
	path := u.Path
	if host == "youtu.be" {
		return len(path) > 1 // youtu.be/{id}
	}
	return strings.HasPrefix(path, "/watch") ||
		strings.HasPrefix(path, "/shorts/") ||
		strings.HasPrefix(path, "/embed/") ||
		strings.HasPrefix(path, "/v/")
}
```

Add `"net/url"` to the import block if not already present.

- [ ] **Step 2: Update createURL to route YouTube URLs**

In the `createURL()` method, find where `source_type` / `content_type` is set (currently hardcoded to `"article"`). Change it to:

```go
contentType := "article"
if isYouTubeURL(req.URL) {
	contentType = "youtube"
}
```

Then use `contentType` variable in both the `CreateContent` call (for `source_type`) and the `Enqueue` call (for `ContentType`).

- [ ] **Step 3: Verify build**

```bash
cd server && go build ./cmd/api
```

- [ ] **Step 4: Commit**

```bash
git add server/internal/handler/saves.go
git commit -m "feat(handler): detect YouTube URLs and route to youtube processor"
```

---

## Task 13: Provider Registry + main.go Wiring

Add transcription chain to the registry and wire the YouTube processor in main.go.

**Files:**
- Modify: `server/internal/providers/registry.go`
- Modify: `server/cmd/api/main.go`

- [ ] **Step 1: Add transcription chain to Registry**

In `server/internal/providers/registry.go`, add a `Transcription` field to the `Registry` struct:

```go
type Registry struct {
	LLM           *Chain[llm.LLMProvider]
	Embedding     *Chain[embedding.EmbeddingProvider]
	Transcription *Chain[transcription.TranscriptionProvider]
}
```

Add the transcription import and `GroqAPIKey` to `RegistryConfig`:

```go
type RegistryConfig struct {
	GeminiAPIKey         string
	GeminiModel          string
	OpenAIAPIKey         string
	OpenAIEmbeddingModel string
	EmbeddingDimensions  int
	GroqAPIKey           string
}
```

In `NewRegistry()`, after the embedding chain setup, add:

```go
// Transcription chain (optional — only needed if YouTube is enabled)
registry.Transcription = NewChain[transcription.TranscriptionProvider](logger)
if cfg.GroqAPIKey != "" {
	registry.Transcription.Add("groq-whisper", transcription.NewGroqProvider(cfg.GroqAPIKey))
}
```

Don't validate that transcription has providers — it's optional (YouTube feature is opt-in via GROQ_API_KEY).

- [ ] **Step 2: Wire YouTube processor in main.go**

In `server/cmd/api/main.go`, in the saves feature setup block (after the existing `dispatcher.Register` calls), add:

```go
// YouTube processor (requires yt-dlp, ffmpeg, and Groq API key)
if cfg.GroqAPIKey != "" {
	ytdlp := services.NewYTDLP(cfg.YTDLPPath, logger)
	ffmpeg := services.NewFFmpeg(cfg.FFmpegPath, logger)

	dispatcher.Register(processors.NewYoutubeProcessor(
		ytdlp,
		ffmpeg,
		registry.Transcription,
		registry.LLM,
		registry.Embedding,
		queries,
		pool,
		cfg,
	))
	logger.Info("youtube processor registered")
}
```

Pass `cfg.GroqAPIKey` to the `RegistryConfig` when creating the registry:

```go
registry, err := providers.NewRegistry(logger, providers.RegistryConfig{
	// ... existing fields ...
	GroqAPIKey: cfg.GroqAPIKey,
})
```

- [ ] **Step 3: Add temp directory cleanup on startup**

In the saves feature setup block, after the dispatcher starts, add YouTube temp dir cleanup:

```go
// Clean up orphaned YouTube temp files on startup
if cfg.GroqAPIKey != "" {
	go func() {
		entries, err := os.ReadDir(cfg.YoutubeTempPath)
		if err != nil {
			return // Dir doesn't exist yet, nothing to clean
		}
		cutoff := time.Now().Add(-1 * time.Hour)
		for _, entry := range entries {
			if !entry.IsDir() {
				continue
			}
			info, err := entry.Info()
			if err != nil {
				continue
			}
			if info.ModTime().Before(cutoff) {
				os.RemoveAll(filepath.Join(cfg.YoutubeTempPath, entry.Name()))
				logger.Info("cleaned orphaned youtube temp dir", "dir", entry.Name())
			}
		}
	}()
}
```

Add `"os"`, `"path/filepath"`, and `"time"` to imports if not already present.

- [ ] **Step 4: Verify build**

```bash
cd server && go build ./cmd/api
```

- [ ] **Step 5: Commit**

```bash
git add server/internal/providers/registry.go server/cmd/api/main.go
git commit -m "feat: wire YouTube processor with transcription chain and temp cleanup"
```

---

## Task 14: Mobile — Types and Filter Chips

Extend mobile types for YouTube and add the "Videos" filter chip.

**Files:**
- Modify: `apps/mobile/src/components/vault/save-grid.tsx`
- Modify: `apps/mobile/src/components/vault/filter-chips.tsx`
- Modify: `apps/mobile/app/(main)/(tabs)/vault.tsx`

- [ ] **Step 1: Extend RawSave type**

In `apps/mobile/src/components/vault/save-grid.tsx`, update the `RawSave` type:

```typescript
type RawSave = {
  id: string;
  source_type: "article" | "image" | "youtube";
  source_title?: string | null;
  source_url?: string | null;
  source_thumbnail_url?: string | null;
  summary?: string | null;
  tags?: string[] | null;
  media_key?: string | null;
  processing_status: string;
  created_at: string;
  // YouTube fields
  video_duration?: number | null;
  video_thumbnail_url?: string | null;
  video_channel?: string | null;
};
```

- [ ] **Step 2: Update SaveGrid to pass YouTube props**

In the same file, update the `renderItem` callback to pass YouTube fields to `SaveCard`:

```typescript
videoDuration={item.video_duration ?? undefined}
videoThumbnailUrl={item.video_thumbnail_url ?? undefined}
videoChannel={item.video_channel ?? undefined}
```

- [ ] **Step 3: Update FilterChips**

In `apps/mobile/src/components/vault/filter-chips.tsx`, update the type and chips array:

```typescript
export type FilterType = "all" | "article" | "image" | "youtube";

const CHIPS: { label: string; value: FilterType }[] = [
  { label: "All", value: "all" },
  { label: "Articles", value: "article" },
  { label: "Images", value: "image" },
  { label: "Videos", value: "youtube" },
];
```

- [ ] **Step 4: Update vault.tsx filter logic**

In `apps/mobile/app/(main)/(tabs)/vault.tsx`, the filter state type and filtering logic should already work since `FilterType` is imported from `filter-chips.tsx`. Verify that the filter comparison works:

```typescript
const filteredSaves = allSaves.filter(
  (s) => filter === "all" || s.source_type === filter,
);
```

This already handles `"youtube"` correctly since it compares against `source_type`.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/components/vault/save-grid.tsx apps/mobile/src/components/vault/filter-chips.tsx apps/mobile/app/\(main\)/\(tabs\)/vault.tsx
git commit -m "feat(mobile): extend types for YouTube and add Videos filter chip"
```

---

## Task 15: Mobile — YouTube Save Card

Add the YouTube card rendering variant to SaveCard.

**Files:**
- Modify: `apps/mobile/src/components/vault/save-card.tsx`

- [ ] **Step 1: Add YouTube props**

Extend `SaveCardProps` with YouTube fields:

```typescript
videoDuration?: number;
videoThumbnailUrl?: string;
videoChannel?: string;
```

- [ ] **Step 2: Add duration formatter helper**

Add inside the component file:

```typescript
function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  return `${m}:${s.toString().padStart(2, "0")}`;
}
```

- [ ] **Step 3: Add YouTube card rendering branch**

In the `SaveCard` component, add a YouTube rendering branch. Add it alongside the existing `sourceType === "image"` and article branches. The YouTube card should render:

```tsx
{sourceType === "youtube" && (
  <>
    {/* Thumbnail with play button + duration */}
    <View style={{ position: "relative", borderRadius: 8, overflow: "hidden", marginBottom: 8 }}>
      {videoThumbnailUrl ? (
        <Image
          source={{ uri: videoThumbnailUrl }}
          style={{ width: "100%", aspectRatio: 16 / 9, backgroundColor: colors.bg.elevated }}
        />
      ) : (
        <View style={{ width: "100%", aspectRatio: 16 / 9, backgroundColor: colors.bg.elevated, justifyContent: "center", alignItems: "center" }}>
          <Ionicons name="play-circle" size={32} color={colors.text.muted} />
        </View>
      )}
      {/* Play badge */}
      <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, justifyContent: "center", alignItems: "center" }}>
        <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "center", alignItems: "center" }}>
          <Ionicons name="play" size={18} color="#fff" style={{ marginLeft: 2 }} />
        </View>
      </View>
      {/* Duration badge */}
      {videoDuration != null && (
        <View style={{ position: "absolute", bottom: 4, right: 4, backgroundColor: "rgba(0,0,0,0.8)", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
          <Text style={{ color: "#fff", fontSize: 10, fontWeight: "600" }}>{formatDuration(videoDuration)}</Text>
        </View>
      )}
      {/* YT indicator */}
      <View style={{ position: "absolute", top: 4, left: 4, backgroundColor: "#ff0000", paddingHorizontal: 5, paddingVertical: 1, borderRadius: 3 }}>
        <Text style={{ color: "#fff", fontSize: 9, fontWeight: "700" }}>YT</Text>
      </View>
    </View>

    {/* Title */}
    {sourceTitle && (
      <Text style={{ color: colors.text.primary, fontSize: 12, fontWeight: "500", lineHeight: 16, marginBottom: 2 }} numberOfLines={2}>
        {sourceTitle}
      </Text>
    )}

    {/* Channel */}
    {videoChannel && (
      <Text style={{ color: colors.text.muted, fontSize: 10, marginBottom: 4 }} numberOfLines={1}>
        {videoChannel}
      </Text>
    )}
  </>
)}
```

The summary and tags rendering below should be shared across all card types (it likely already is — just make sure it's not gated by `sourceType`).

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/src/components/vault/save-card.tsx
git commit -m "feat(mobile): add YouTube card variant with thumbnail, duration, and play badge"
```

---

## Task 16: Mobile — YouTube Detail Screen

Extend the detail screen to display YouTube-specific information.

**Files:**
- Modify: `apps/mobile/app/(main)/vault/[id].tsx`

- [ ] **Step 1: Extend SaveDetail type**

Add YouTube fields to the `SaveDetail` type:

```typescript
type SaveDetail = {
  // ... existing fields ...
  source_type: "article" | "image" | "youtube";
  // YouTube fields
  video_duration?: number | null;
  video_thumbnail_url?: string | null;
  video_channel?: string | null;
  transcript_source?: string | null;
};
```

- [ ] **Step 2: Add duration formatter**

Add the same `formatDuration` helper (or extract to a shared util if preferred):

```typescript
function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  return `${m}:${s.toString().padStart(2, "0")}`;
}
```

- [ ] **Step 3: Add YouTube detail sections**

Add a YouTube-specific header section. This goes where the existing image/article cover sections are rendered:

```tsx
{save.source_type === "youtube" && (
  <>
    {/* Thumbnail with play overlay */}
    <View style={{ position: "relative", marginHorizontal: -20, marginTop: -20, marginBottom: 16 }}>
      {save.video_thumbnail_url ? (
        <Image
          source={{ uri: save.video_thumbnail_url }}
          style={{ width: "100%", aspectRatio: 16 / 9 }}
        />
      ) : (
        <View style={{ width: "100%", aspectRatio: 16 / 9, backgroundColor: colors.bg.elevated, justifyContent: "center", alignItems: "center" }}>
          <Ionicons name="play-circle" size={48} color={colors.text.muted} />
        </View>
      )}
      <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, justifyContent: "center", alignItems: "center" }}>
        <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "center", alignItems: "center" }}>
          <Ionicons name="play" size={28} color="#fff" style={{ marginLeft: 3 }} />
        </View>
      </View>
      {save.video_duration != null && (
        <View style={{ position: "absolute", bottom: 8, right: 8, backgroundColor: "rgba(0,0,0,0.8)", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4 }}>
          <Text style={{ color: "#fff", fontSize: 12, fontWeight: "600" }}>{formatDuration(save.video_duration)}</Text>
        </View>
      )}
    </View>

    {/* Channel name */}
    {save.video_channel && (
      <Text style={{ color: colors.text.muted, fontSize: 13, marginBottom: 12 }}>
        {save.video_channel}
      </Text>
    )}
  </>
)}
```

- [ ] **Step 4: Update "Open" action for YouTube**

The share/open action should open the YouTube URL. Find the existing action that opens `source_url` via `Linking.openURL()`. It should already work for YouTube since `source_url` contains the YouTube URL. Update the button text:

```tsx
<Text>
  {save.source_type === "youtube" ? "Watch on YouTube" : "Open Original Article"}
</Text>
```

- [ ] **Step 5: Add transcript source footer**

At the bottom of the detail view, add:

```tsx
{save.source_type === "youtube" && save.transcript_source && (
  <Text style={{ color: colors.text.dim, fontSize: 11, marginTop: 16 }}>
    Transcript: {save.transcript_source === "captions" ? "YouTube captions" : "Whisper transcription"}
  </Text>
)}
```

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/app/\(main\)/vault/\[id\].tsx
git commit -m "feat(mobile): add YouTube detail screen with thumbnail, channel, and transcript source"
```

---

## Task 17: End-to-End Verification

Verify the full stack builds and the feature works end-to-end.

**Files:** None (verification only)

- [ ] **Step 1: Verify server build**

```bash
cd server && go build ./cmd/api
```

Expected: Clean build with no errors.

- [ ] **Step 2: Verify mobile TypeScript**

```bash
cd apps/mobile && npx tsc --noEmit
```

Expected: No type errors.

- [ ] **Step 3: Verify sqlc generation is clean**

```bash
cd server && sqlc generate
```

Expected: No errors or warnings.

- [ ] **Step 4: Manual test checklist**

With the server running (with `GROQ_API_KEY`, `yt-dlp`, and `ffmpeg` available):

1. Save a YouTube video URL → verify `source_type = "youtube"` in response
2. Save a regular article URL → verify still routes to `source_type = "article"`
3. Save `youtu.be` short URL → verify detected as YouTube
4. Save a YouTube Shorts URL (`/shorts/...`) → verify detected as YouTube
5. Check vault grid → YouTube card shows thumbnail, play badge, duration
6. Open YouTube save detail → shows channel, summary, key topics, tags
7. Filter by "Videos" → only YouTube saves shown
8. Delete a YouTube save during processing → verify cleanup

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "feat: YouTube saves (Phase 2) complete"
```
