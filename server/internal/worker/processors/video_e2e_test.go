package processors

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/ksushant6566/mindtab/server/internal/config"
	"github.com/ksushant6566/mindtab/server/internal/providers"
	"github.com/ksushant6566/mindtab/server/internal/providers/embedding"
	"github.com/ksushant6566/mindtab/server/internal/providers/llm"
	"github.com/ksushant6566/mindtab/server/internal/providers/transcription"
	"github.com/ksushant6566/mindtab/server/internal/services"
	"github.com/ksushant6566/mindtab/server/internal/store"
	"github.com/ksushant6566/mindtab/server/internal/testutil"
	"github.com/ksushant6566/mindtab/server/internal/worker"
	"github.com/ksushant6566/mindtab/server/internal/worker/steps"
)

type sequentialLLMProvider struct {
	responses []string
	calls     []llm.LLMRequest
	mu        sync.Mutex
}

func (p *sequentialLLMProvider) Complete(ctx context.Context, req llm.LLMRequest) (*llm.LLMResponse, error) {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.calls = append(p.calls, req)
	if len(p.calls) > len(p.responses) {
		return nil, fmt.Errorf("unexpected LLM call %d", len(p.calls))
	}
	return &llm.LLMResponse{Text: p.responses[len(p.calls)-1], Provider: p.Name()}, nil
}

func (p *sequentialLLMProvider) StreamComplete(ctx context.Context, req llm.LLMRequest, tools []llm.ToolDefinition, callback llm.StreamCallback) error {
	return fmt.Errorf("StreamComplete not implemented in sequential test provider")
}

func (p *sequentialLLMProvider) Name() string { return "sequential-llm" }

func (p *sequentialLLMProvider) Calls() []llm.LLMRequest {
	p.mu.Lock()
	defer p.mu.Unlock()
	return append([]llm.LLMRequest(nil), p.calls...)
}

type capturedVideoStore struct {
	results         store.UpdateContentResultsParams
	videoFields     store.UpdateContentYoutubeFieldsParams
	finalMediaKey   string
	embeddingCalled bool
	videoFieldsSeen bool
}

func TestVideoProcessorE2E_YouTubeVideo(t *testing.T) {
	runVideoProcessorE2E(t, videoE2ECase{
		name:                     "youtube video",
		sourceURL:                "https://www.youtube.com/watch?v=video123",
		contentType:              "youtube",
		wantSourceType:           "youtube",
		wantTitle:                "Hermetic YouTube Video",
		wantDescription:          "Description for a normal YouTube video.",
		wantCreator:              "E2E Channel",
		wantTranscript:           "Caption transcript for video123.",
		wantTranscriptSource:     "captions",
		wantTranscriptionCalls:   0,
		wantUploadedDurableMedia: false,
	})
}

func TestVideoProcessorE2E_YouTubeShorts(t *testing.T) {
	runVideoProcessorE2E(t, videoE2ECase{
		name:                     "youtube shorts",
		sourceURL:                "https://www.youtube.com/shorts/short123",
		contentType:              "youtube",
		wantSourceType:           "youtube",
		wantTitle:                "Hermetic YouTube Short",
		wantDescription:          "Description for a short-form YouTube clip.",
		wantCreator:              "Shorts Channel",
		wantTranscript:           "mock transcript for youtube shorts",
		wantTranscriptSource:     "whisper",
		wantTranscriptionCalls:   1,
		wantUploadedDurableMedia: false,
	})
}

func TestVideoProcessorE2E_InstagramReel(t *testing.T) {
	runVideoProcessorE2E(t, videoE2ECase{
		name:                     "instagram reel",
		sourceURL:                "https://www.instagram.com/reels/reel123/",
		contentType:              "instagram_reel",
		wantSourceType:           "instagram_reel",
		wantTitle:                "Hermetic Instagram Reel",
		wantDescription:          "Caption for a public Instagram Reel.",
		wantCreator:              "reel_creator",
		wantTranscript:           "mock transcript for instagram reel",
		wantTranscriptSource:     "whisper",
		wantTranscriptionCalls:   1,
		wantUploadedDurableMedia: false,
	})
}

func TestVideoProcessorE2E_UserUploadedVideo(t *testing.T) {
	runVideoProcessorE2E(t, videoE2ECase{
		name:                     "user uploaded video",
		contentType:              "instagram_reel",
		wantSourceType:           "instagram_reel",
		wantTitle:                "uploaded-video.mp4",
		wantTranscript:           "mock transcript for user upload",
		wantTranscriptSource:     "whisper",
		wantTranscriptionCalls:   1,
		wantUploadedDurableMedia: true,
		uploaded:                 true,
	})
}

type videoE2ECase struct {
	name                     string
	sourceURL                string
	contentType              string
	wantSourceType           string
	wantTitle                string
	wantDescription          string
	wantCreator              string
	wantTranscript           string
	wantTranscriptSource     string
	wantTranscriptionCalls   int
	wantUploadedDurableMedia bool
	uploaded                 bool
}

func runVideoProcessorE2E(t *testing.T, tc videoE2ECase) {
	t.Helper()

	ctx := context.Background()
	ffmpegPath := requireBinary(t, "ffmpeg")
	videoPath := createSyntheticVideo(t, ffmpegPath)
	fakeYTDLP := createFakeYTDLP(t, videoPath)

	cfg := &config.Config{
		YoutubeMaxDuration:  7200,
		YoutubeTempPath:     t.TempDir(),
		YoutubeVideoQuality: 360,
		YoutubeFramesCap:    5,
	}

	job := &worker.Job{
		ID:          uuid.New(),
		ContentID:   uuid.New(),
		UserID:      "user-video-e2e",
		ContentType: tc.contentType,
		SourceURL:   tc.sourceURL,
	}

	storage := testutil.NewMockStorage()
	mediaKey := ""
	if tc.uploaded {
		mediaKey = filepath.Join(job.UserID, job.ContentID.String(), "video.mp4")
		videoBytes, err := os.ReadFile(videoPath)
		if err != nil {
			t.Fatalf("read synthetic video: %v", err)
		}
		if err := storage.Save(ctx, mediaKey, bytes.NewReader(videoBytes), "video/mp4"); err != nil {
			t.Fatalf("seed uploaded video storage: %v", err)
		}
	}

	captured := &capturedVideoStore{}
	queries := videoE2EQuerier(t, job, mediaKey, tc.wantTitle, captured)
	transcriptionMock := &testutil.MockTranscriptionProvider{Transcript: tc.wantTranscript}
	transcriptionChain := makeE2ETranscriptionChain(transcriptionMock)
	llmProvider := &sequentialLLMProvider{responses: []string{
		`{"ocr_text":"overlay words","visual_timeline":"sampled frames show a person presenting an idea over time","frame_observations":[{"frame_index":0,"timestamp_seconds":0,"observation":"a presenter appears","ocr_text":"overlay words"}],"uncertainty_notes":[]}`,
		`{"title":"E2E Video Summary","summary":"The video is understood using transcript, OCR, source metadata, and sampled visual frames.","tags":["video","e2e"],"key_topics":["video understanding","pipeline"]}`,
	}}
	llmChain := makeE2ELLMChain(llmProvider)
	embeddingMock := &testutil.MockEmbeddingProvider{}
	embeddingChain := makeE2EEmbeddingChain(embeddingMock)

	ytdlp := services.NewYTDLP(fakeYTDLP, slog.Default())
	ffmpeg := services.NewFFmpeg(ffmpegPath, slog.Default())

	var processor worker.Processor
	switch tc.contentType {
	case "youtube":
		processor = NewYoutubeProcessor(ytdlp, ffmpeg, transcriptionChain, llmChain, embeddingChain, queries, nil, cfg)
	case "instagram_reel":
		processor = NewInstagramReelProcessor(ytdlp, ffmpeg, transcriptionChain, llmChain, embeddingChain, storage, queries, nil, cfg)
	default:
		t.Fatalf("unsupported e2e content type %q", tc.contentType)
	}

	results := runAllProcessorSteps(t, ctx, processor, job)

	var evidence steps.VideoEvidence
	mustUnmarshalStep(t, results, "evidence", &evidence)
	if evidence.Metadata.SourceType != tc.wantSourceType {
		t.Errorf("%s source type = %q, want %q", tc.name, evidence.Metadata.SourceType, tc.wantSourceType)
	}
	if evidence.Metadata.Title != tc.wantTitle {
		t.Errorf("%s title = %q, want %q", tc.name, evidence.Metadata.Title, tc.wantTitle)
	}
	if evidence.Metadata.Description != tc.wantDescription {
		t.Errorf("%s description = %q, want %q", tc.name, evidence.Metadata.Description, tc.wantDescription)
	}
	if evidence.Metadata.Creator != tc.wantCreator {
		t.Errorf("%s creator = %q, want %q", tc.name, evidence.Metadata.Creator, tc.wantCreator)
	}
	if evidence.Transcript != tc.wantTranscript {
		t.Errorf("%s transcript = %q, want %q", tc.name, evidence.Transcript, tc.wantTranscript)
	}
	if evidence.TranscriptSource != tc.wantTranscriptSource {
		t.Errorf("%s transcript source = %q, want %q", tc.name, evidence.TranscriptSource, tc.wantTranscriptSource)
	}
	if evidence.SelectedFrames.FrameCount <= 1 {
		t.Errorf("%s selected frame count = %d, want > 1", tc.name, evidence.SelectedFrames.FrameCount)
	}
	if evidence.OCRText != "overlay words" {
		t.Errorf("%s OCR text = %q, want overlay words", tc.name, evidence.OCRText)
	}
	if !strings.Contains(evidence.VisualTimeline, "sampled frames") {
		t.Errorf("%s visual timeline = %q, want sampled frame timeline", tc.name, evidence.VisualTimeline)
	}
	if len(evidence.EvidenceStatus) == 0 {
		t.Errorf("%s evidence statuses should be recorded", tc.name)
	}

	if transcriptionMock.CallCount != tc.wantTranscriptionCalls {
		t.Errorf("%s transcription calls = %d, want %d", tc.name, transcriptionMock.CallCount, tc.wantTranscriptionCalls)
	}

	llmCalls := llmProvider.Calls()
	if len(llmCalls) != 2 {
		t.Fatalf("%s LLM calls = %d, want 2", tc.name, len(llmCalls))
	}
	if len(llmCalls[0].Images) <= 1 {
		t.Errorf("%s frame understanding image count = %d, want > 1", tc.name, len(llmCalls[0].Images))
	}
	if !strings.Contains(llmCalls[1].UserPrompt, tc.wantTranscript) {
		t.Errorf("%s summarize prompt missing transcript: %q", tc.name, llmCalls[1].UserPrompt)
	}
	if tc.wantDescription != "" && !strings.Contains(llmCalls[1].UserPrompt, tc.wantDescription) {
		t.Errorf("%s summarize prompt missing source description: %q", tc.name, llmCalls[1].UserPrompt)
	}
	if !strings.Contains(llmCalls[1].UserPrompt, "overlay words") {
		t.Errorf("%s summarize prompt missing OCR evidence: %q", tc.name, llmCalls[1].UserPrompt)
	}

	if !captured.videoFieldsSeen {
		t.Fatalf("%s store did not update video fields", tc.name)
	}
	if captured.videoFields.TranscriptSource.String != tc.wantTranscriptSource {
		t.Errorf("%s stored transcript source = %q, want %q", tc.name, captured.videoFields.TranscriptSource.String, tc.wantTranscriptSource)
	}
	if captured.videoFields.DurationSeconds.Int32 <= 0 {
		t.Errorf("%s stored duration = %d, want > 0", tc.name, captured.videoFields.DurationSeconds.Int32)
	}
	if captured.results.ExtractedText.String != tc.wantTranscript {
		t.Errorf("%s stored extracted text = %q, want %q", tc.name, captured.results.ExtractedText.String, tc.wantTranscript)
	}
	if !strings.Contains(captured.results.VisualDescription.String, "sampled frames") {
		t.Errorf("%s stored visual description = %q", tc.name, captured.results.VisualDescription.String)
	}
	if captured.results.Summary.String == "" {
		t.Errorf("%s stored summary should not be empty", tc.name)
	}
	if captured.embeddingCalled != true {
		t.Errorf("%s embedding update was not called", tc.name)
	}
	if (captured.finalMediaKey != "") != tc.wantUploadedDurableMedia {
		t.Errorf("%s final media_key present = %v, want %v", tc.name, captured.finalMediaKey != "", tc.wantUploadedDurableMedia)
	}
}

func runAllProcessorSteps(t *testing.T, ctx context.Context, processor worker.Processor, job *worker.Job) worker.StepResults {
	t.Helper()
	results := worker.StepResults{}
	for _, step := range processor.Steps() {
		result, err := processor.Execute(ctx, step, job, results)
		if err != nil {
			t.Fatalf("%s step %q failed: %v", job.ContentType, step, err)
		}
		if step != "store" {
			if result == nil {
				t.Fatalf("%s step %q returned nil result", job.ContentType, step)
			}
			results[step] = result
		}
	}
	return results
}

func videoE2EQuerier(t *testing.T, job *worker.Job, mediaKey string, sourceTitle string, captured *capturedVideoStore) *store.QuerierMock {
	t.Helper()
	return &store.QuerierMock{
		GetContentByIDFunc: func(ctx context.Context, arg store.GetContentByIDParams) (store.GetContentByIDRow, error) {
			if arg.ID.Bytes != job.ContentID {
				t.Errorf("GetContentByID content ID mismatch")
			}
			return store.GetContentByIDRow{
				ID:              pgtype.UUID{Bytes: job.ContentID, Valid: true},
				UserID:          job.UserID,
				SourceType:      job.ContentType,
				SourceTitle:     pgtype.Text{String: sourceTitle, Valid: sourceTitle != ""},
				MediaKey:        pgtype.Text{String: mediaKey, Valid: mediaKey != ""},
				DurationSeconds: pgtype.Int4{Int32: 3, Valid: true},
			}, nil
		},
		IsContentDeletedFunc: func(ctx context.Context, id pgtype.UUID) (bool, error) {
			return false, nil
		},
		UpdateContentResultsFunc: func(ctx context.Context, arg store.UpdateContentResultsParams) error {
			captured.results = arg
			captured.finalMediaKey = mediaKey
			if arg.MediaKey.Valid {
				captured.finalMediaKey = arg.MediaKey.String
			}
			return nil
		},
		UpdateContentEmbeddingFunc: func(ctx context.Context, arg store.UpdateContentEmbeddingParams) error {
			captured.embeddingCalled = true
			return nil
		},
		UpdateContentYoutubeFieldsFunc: func(ctx context.Context, arg store.UpdateContentYoutubeFieldsParams) error {
			captured.videoFields = arg
			captured.videoFieldsSeen = true
			return nil
		},
	}
}

func createSyntheticVideo(t *testing.T, ffmpegPath string) string {
	t.Helper()
	videoPath := filepath.Join(t.TempDir(), "synthetic.mp4")
	cmd := exec.Command(
		ffmpegPath,
		"-y",
		"-hide_banner",
		"-loglevel", "error",
		"-f", "lavfi",
		"-i", "testsrc=size=160x120:rate=10",
		"-f", "lavfi",
		"-i", "sine=frequency=1000:sample_rate=44100",
		"-t", "3",
		"-shortest",
		"-c:v", "mpeg4",
		"-pix_fmt", "yuv420p",
		"-c:a", "aac",
		videoPath,
	)
	if out, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("create synthetic video: %v\n%s", err, string(out))
	}
	return videoPath
}

func createFakeYTDLP(t *testing.T, videoPath string) string {
	t.Helper()
	dir := t.TempDir()
	scriptPath := filepath.Join(dir, "fake-yt-dlp")
	script := `#!/bin/sh
set -eu
args=" $* "
id="video123"
title="Hermetic YouTube Video"
description="Description for a normal YouTube video."
channel="E2E Channel"
subtitles='{"en":[{"ext":"vtt"}]}'
case "$args" in
  *shorts*)
    id="short123"
    title="Hermetic YouTube Short"
    description="Description for a short-form YouTube clip."
    channel="Shorts Channel"
    subtitles='{}'
    ;;
  *instagram.com*)
    id="reel123"
    title="Hermetic Instagram Reel"
    description="Caption for a public Instagram Reel."
    channel="reel_creator"
    subtitles='{}'
    ;;
esac

if printf '%s' "$args" | grep -q -- '--dump-json'; then
  printf '{"id":"%s","title":"%s","description":"%s","duration":3,"thumbnail":"https://example.com/%s.jpg","channel":"%s","uploader":"%s","subtitles":%s,"automatic_captions":{}}\n' "$id" "$title" "$description" "$id" "$channel" "$channel" "$subtitles"
  exit 0
fi

outtmpl=""
prev=""
for arg in "$@"; do
  if [ "$prev" = "-o" ]; then
    outtmpl="$arg"
  fi
  prev="$arg"
done
if [ -z "$outtmpl" ]; then
  echo "missing output template" >&2
  exit 1
fi
outdir=$(dirname "$outtmpl")
mkdir -p "$outdir"

if printf '%s' "$args" | grep -q -- '--write-sub'; then
  cat > "$outdir/$id.vtt" <<VTT
WEBVTT

1
00:00:00.000 --> 00:00:01.000
Caption transcript for $id.
VTT
  exit 0
fi

outfile=$(printf '%s' "$outtmpl" | sed "s/%(id)s/$id/g" | sed "s/%(ext)s/mp4/g")
cp "$FAKE_VIDEO_PATH" "$outfile"
`
	if err := os.WriteFile(scriptPath, []byte(script), 0o755); err != nil {
		t.Fatalf("write fake yt-dlp: %v", err)
	}
	t.Setenv("FAKE_VIDEO_PATH", videoPath)
	return scriptPath
}

func makeE2ELLMChain(provider llm.LLMProvider) *providers.Chain[llm.LLMProvider] {
	chain := providers.NewChain[llm.LLMProvider](slog.Default())
	chain.Add(provider.Name(), provider)
	return chain
}

func makeE2EEmbeddingChain(provider embedding.EmbeddingProvider) *providers.Chain[embedding.EmbeddingProvider] {
	chain := providers.NewChain[embedding.EmbeddingProvider](slog.Default())
	chain.Add(provider.Name(), provider)
	return chain
}

func makeE2ETranscriptionChain(provider transcription.TranscriptionProvider) *providers.Chain[transcription.TranscriptionProvider] {
	chain := providers.NewChain[transcription.TranscriptionProvider](slog.Default())
	chain.Add(provider.Name(), provider)
	return chain
}

func mustUnmarshalStep(t *testing.T, results worker.StepResults, step string, out any) {
	t.Helper()
	result, ok := results[step]
	if !ok || result == nil {
		t.Fatalf("missing %s result", step)
	}
	if err := json.Unmarshal(result.Data, out); err != nil {
		t.Fatalf("unmarshal %s result: %v", step, err)
	}
}

func requireBinary(t *testing.T, name string) string {
	t.Helper()
	path, err := exec.LookPath(name)
	if err != nil {
		t.Skipf("%s not available; skipping processor E2E test", name)
	}
	return path
}
