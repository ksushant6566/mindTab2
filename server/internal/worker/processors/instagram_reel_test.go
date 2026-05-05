package processors

import (
	"context"
	"encoding/json"
	"log/slog"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/ksushant6566/mindtab/server/internal/config"
	"github.com/ksushant6566/mindtab/server/internal/services"
	"github.com/ksushant6566/mindtab/server/internal/store"
	"github.com/ksushant6566/mindtab/server/internal/testutil"
	"github.com/ksushant6566/mindtab/server/internal/worker"
	"github.com/ksushant6566/mindtab/server/internal/worker/steps"
)

func makeInstagramJob(sourceURL string) *worker.Job {
	return &worker.Job{
		ID:          uuid.New(),
		ContentID:   uuid.New(),
		UserID:      "user-instagram-test",
		ContentType: "instagram_reel",
		SourceURL:   sourceURL,
	}
}

func instagramTestConfig(t *testing.T) *config.Config {
	t.Helper()
	return &config.Config{
		YoutubeMaxDuration:  7200,
		YoutubeTempPath:     t.TempDir(),
		YoutubeVideoQuality: 360,
		YoutubeFramesCap:    5,
	}
}

func TestInstagramReel_ContentType(t *testing.T) {
	p := NewInstagramReelProcessor(nil, nil, nil, nil, nil, nil, nil, nil, nil)
	if p.ContentType() != "instagram_reel" {
		t.Errorf("ContentType() = %q, want %q", p.ContentType(), "instagram_reel")
	}
}

func TestInstagramReel_StepOrder(t *testing.T) {
	p := NewInstagramReelProcessor(nil, nil, nil, nil, nil, nil, nil, nil, nil)
	want := []string{"metadata", "download", "transcribe", "extract_frames", "vision", "evidence", "summarize", "embed", "store"}
	got := p.Steps()
	if !reflect.DeepEqual(got, want) {
		t.Errorf("Steps() = %v, want %v", got, want)
	}
}

func TestInstagramReel_LockTTL(t *testing.T) {
	p := NewInstagramReelProcessor(nil, nil, nil, nil, nil, nil, nil, nil, nil)
	want := 15 * time.Minute
	if p.LockTTL() != want {
		t.Errorf("LockTTL() = %v, want %v", p.LockTTL(), want)
	}
}

func TestInstagramReel_UsesYouTubeQualityConfig(t *testing.T) {
	cfg := &config.Config{YoutubeVideoQuality: 480}
	p := NewInstagramReelProcessor(nil, nil, nil, nil, nil, nil, nil, nil, cfg)
	if p.cfg.YoutubeVideoQuality != 480 {
		t.Errorf("YoutubeVideoQuality = %d, want 480", p.cfg.YoutubeVideoQuality)
	}
	if got := services.DownloadFormat(p.cfg.YoutubeVideoQuality); !strings.Contains(got, "height<=480") {
		t.Errorf("DownloadFormat should use configured quality, got %q", got)
	}
}

func TestInstagramReel_UsesUniversalFramePolicy(t *testing.T) {
	tests := map[string]struct {
		durationSec int
		want        int
	}{
		"short reel gets timeline spread": {durationSec: 9, want: 8},
		"medium clip":                     {durationSec: 60, want: 10},
		"zero duration uses short policy": {durationSec: 0, want: 8},
		"long videos are capped":          {durationSec: 600, want: 12},
	}

	for name, tc := range tests {
		t.Run(name, func(t *testing.T) {
			got := steps.VideoFrameTargetCount(tc.durationSec)
			if got != tc.want {
				t.Errorf("VideoFrameTargetCount(%d) = %d, want %d", tc.durationSec, got, tc.want)
			}
		})
	}
}

func TestInstagramReel_UploadedVideoMetadataAndDownload(t *testing.T) {
	job := makeInstagramJob("https://www.instagram.com/reel/private-or-ephemeral/")
	mediaKey := filepath.Join(job.UserID, job.ContentID.String(), "video.mp4")
	storage := testutil.NewMockStorage()
	if err := storage.Save(context.Background(), mediaKey, strings.NewReader("video-bytes"), "video/mp4"); err != nil {
		t.Fatalf("seed storage: %v", err)
	}
	q := &store.QuerierMock{
		GetContentByIDFunc: func(_ context.Context, arg store.GetContentByIDParams) (store.GetContentByIDRow, error) {
			if arg.ID.Bytes != job.ContentID {
				t.Errorf("GetContentByID content ID mismatch")
			}
			return store.GetContentByIDRow{
				ID:              pgtype.UUID{Bytes: job.ContentID, Valid: true},
				UserID:          job.UserID,
				SourceType:      "instagram_reel",
				SourceTitle:     pgtype.Text{String: "downloaded reel.mp4", Valid: true},
				MediaKey:        pgtype.Text{String: mediaKey, Valid: true},
				DurationSeconds: pgtype.Int4{Int32: 42, Valid: true},
			}, nil
		},
	}
	p := NewInstagramReelProcessor(
		services.NewYTDLP("", slog.Default()),
		services.NewFFmpeg("", slog.Default()),
		nil, nil, nil, storage, q, nil, instagramTestConfig(t),
	)
	ctx := context.Background()

	metadataResult, err := p.Execute(ctx, "metadata", job, worker.StepResults{})
	if err != nil {
		t.Fatalf("metadata: %v", err)
	}
	var mr steps.MetadataResult
	if err := json.Unmarshal(metadataResult.Data, &mr); err != nil {
		t.Fatalf("unmarshal metadata: %v", err)
	}
	if mr.Duration != 42 {
		t.Errorf("metadata duration = %d, want 42", mr.Duration)
	}
	if mr.Title != "downloaded reel.mp4" {
		t.Errorf("metadata title = %q, want downloaded reel.mp4", mr.Title)
	}

	downloadResult, err := p.Execute(ctx, "download", job, worker.StepResults{})
	if err != nil {
		t.Fatalf("download: %v", err)
	}
	var dr steps.DownloadResult
	if err := json.Unmarshal(downloadResult.Data, &dr); err != nil {
		t.Fatalf("unmarshal download: %v", err)
	}
	data, err := os.ReadFile(dr.VideoFilePath)
	if err != nil {
		t.Fatalf("read staged video: %v", err)
	}
	if string(data) != "video-bytes" {
		t.Errorf("staged video = %q, want %q", string(data), "video-bytes")
	}

	transcribeData, _ := json.Marshal(steps.TranscribeResult{
		Transcript:       "uploaded reel transcript",
		TranscriptSource: "whisper",
		Status:           steps.EvidenceStatus{Source: "transcript", Status: steps.EvidenceStatusSuccess},
	})
	prevResults := worker.StepResults{
		"metadata":   metadataResult,
		"download":   downloadResult,
		"transcribe": {Data: transcribeData},
	}
	evidenceResult, err := p.Execute(ctx, "evidence", job, prevResults)
	if err != nil {
		t.Fatalf("evidence: %v", err)
	}
	var evidence steps.VideoEvidence
	if err := json.Unmarshal(evidenceResult.Data, &evidence); err != nil {
		t.Fatalf("unmarshal evidence: %v", err)
	}
	if evidence.Metadata.LocalPath != dr.VideoFilePath {
		t.Errorf("evidence local path = %q, want %q", evidence.Metadata.LocalPath, dr.VideoFilePath)
	}
	if evidence.Transcript != "uploaded reel transcript" {
		t.Errorf("evidence transcript = %q", evidence.Transcript)
	}
}

func TestInstagramReel_SummarizeAndEmbed(t *testing.T) {
	summarizeResp := `{"title":"A Reel About Systems","summary":"A short reel about system design.","tags":["systems"],"key_topics":["design"]}`
	llmMock := &testutil.MockLLMProvider{Response: summarizeResp}
	embMock := &testutil.MockEmbeddingProvider{}
	p := NewInstagramReelProcessor(
		nil, nil, nil,
		makeYouTubeLLMChain(llmMock),
		makeYouTubeEmbeddingChain(embMock),
		nil, nil, nil, instagramTestConfig(t),
	)
	job := makeInstagramJob("https://www.instagram.com/reel/C123abc/")

	evidenceData, _ := json.Marshal(steps.VideoEvidence{
		Metadata: steps.ResolvedVideo{
			SourceType:      "instagram_reel",
			Title:           "System design basics",
			Description:     "A reel about systems.",
			Creator:         "creator",
			DurationSeconds: 12,
		},
		Transcript:       "This reel explains the basics of system design.",
		TranscriptSource: "whisper",
		SelectedFrames: steps.SelectedFramesSummary{
			FrameCount:       2,
			Policy:           "uniform_timeline_v1",
			DurationSeconds:  12,
			TimestampSeconds: []float64{0, 12},
		},
		VisualTimeline: "A presenter points at a whiteboard.",
	})
	prevResults := worker.StepResults{
		"evidence": {Data: evidenceData},
	}

	summarizeResult, err := p.Execute(context.Background(), "summarize", job, prevResults)
	if err != nil {
		t.Fatalf("summarize: %v", err)
	}
	prevResults["summarize"] = summarizeResult

	embedResult, err := p.Execute(context.Background(), "embed", job, prevResults)
	if err != nil {
		t.Fatalf("embed: %v", err)
	}
	var er steps.EmbedResult
	if err := json.Unmarshal(embedResult.Data, &er); err != nil {
		t.Fatalf("unmarshal embed: %v", err)
	}
	if len(er.Embedding) != 1536 {
		t.Errorf("embedding dimensions = %d, want 1536", len(er.Embedding))
	}
	if len(llmMock.Calls) == 0 {
		t.Fatal("expected LLM summarize call")
	}
	if !strings.Contains(llmMock.Calls[0].SystemPrompt, "short-video summariser") {
		t.Errorf("expected video-specific summarize prompt, got %q", llmMock.Calls[0].SystemPrompt)
	}
}
