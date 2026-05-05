package processors

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"

	"github.com/google/uuid"
	"github.com/ksushant6566/mindtab/server/internal/providers"
	"github.com/ksushant6566/mindtab/server/internal/providers/embedding"
	"github.com/ksushant6566/mindtab/server/internal/providers/llm"
	"github.com/ksushant6566/mindtab/server/internal/providers/transcription"
	"github.com/ksushant6566/mindtab/server/internal/services"
	"github.com/ksushant6566/mindtab/server/internal/store"
	"github.com/ksushant6566/mindtab/server/internal/worker"
	"github.com/ksushant6566/mindtab/server/internal/worker/steps"
)

type videoUnderstandingPipeline struct {
	sourceType         string
	ytdlp              *services.YTDLP
	ffmpeg             *services.FFmpeg
	transcriptionChain *providers.Chain[transcription.TranscriptionProvider]
	llmChain           *providers.Chain[llm.LLMProvider]
	embeddingChain     *providers.Chain[embedding.EmbeddingProvider]
	queries            store.Querier
	frameSelector      steps.FrameSelector
	frameUnderstanding steps.FrameUnderstandingProvider
}

func newVideoUnderstandingPipeline(
	sourceType string,
	ytdlp *services.YTDLP,
	ffmpeg *services.FFmpeg,
	transcriptionChain *providers.Chain[transcription.TranscriptionProvider],
	llmChain *providers.Chain[llm.LLMProvider],
	embeddingChain *providers.Chain[embedding.EmbeddingProvider],
	queries store.Querier,
) *videoUnderstandingPipeline {
	return &videoUnderstandingPipeline{
		sourceType:         sourceType,
		ytdlp:              ytdlp,
		ffmpeg:             ffmpeg,
		transcriptionChain: transcriptionChain,
		llmChain:           llmChain,
		embeddingChain:     embeddingChain,
		queries:            queries,
		frameSelector:      steps.NewFFmpegFrameSelector(ffmpeg),
		frameUnderstanding: steps.NewLLMFrameUnderstandingProvider(llmChain),
	}
}

func (p *videoUnderstandingPipeline) Steps() []string {
	return []string{"metadata", "download", "transcribe", "extract_frames", "vision", "evidence", "summarize", "embed", "store"}
}

func (p *videoUnderstandingPipeline) RunVideoUnderstanding(ctx context.Context, step string, job *worker.Job, prevResults worker.StepResults) (*worker.StepResult, error) {
	switch step {
	case "transcribe":
		return p.transcribe(ctx, job, prevResults)
	case "extract_frames":
		return p.extractFrames(ctx, job, prevResults)
	case "vision":
		return p.understandFrames(ctx, prevResults)
	case "evidence":
		return steps.BuildVideoEvidenceStep(p.sourceType, job.SourceURL, prevResults)
	case "summarize":
		return p.summarize(ctx, prevResults)
	case "embed":
		return p.embed(ctx, prevResults)
	case "store":
		return steps.Store(ctx, p.queries, job, prevResults)
	default:
		return nil, fmt.Errorf("video pipeline: unknown step %q", step)
	}
}

func (p *videoUnderstandingPipeline) transcribe(ctx context.Context, job *worker.Job, prevResults worker.StepResults) (*worker.StepResult, error) {
	resolved, err := resolvedVideoFromResults(p.sourceType, job.SourceURL, prevResults)
	if err != nil {
		return nil, fmt.Errorf("transcribe: %w", err)
	}
	return steps.TranscribeVideo(ctx, p.ytdlp, p.ffmpeg, p.transcriptionChain, resolved)
}

func (p *videoUnderstandingPipeline) extractFrames(ctx context.Context, job *worker.Job, prevResults worker.StepResults) (*worker.StepResult, error) {
	resolved, err := resolvedVideoFromResults(p.sourceType, job.SourceURL, prevResults)
	if err != nil {
		return nil, fmt.Errorf("extract_frames: %w", err)
	}
	return steps.SelectVideoFrames(ctx, p.frameSelector, steps.VideoFrameSelectionInput{
		LocalPath:       resolved.LocalPath,
		DurationSeconds: resolved.DurationSeconds,
		OutputDir:       filepath.Join(filepath.Dir(resolved.LocalPath), "frames"),
	})
}

func (p *videoUnderstandingPipeline) understandFrames(ctx context.Context, prevResults worker.StepResults) (*worker.StepResult, error) {
	var frames steps.SelectedFrames
	if err := parseStep(prevResults, "extract_frames", &frames); err != nil {
		return nil, fmt.Errorf("vision: %w", err)
	}
	return steps.UnderstandVideoFrames(ctx, p.frameUnderstanding, frames)
}

func (p *videoUnderstandingPipeline) summarize(ctx context.Context, prevResults worker.StepResults) (*worker.StepResult, error) {
	var evidence steps.VideoEvidence
	if err := parseStep(prevResults, "evidence", &evidence); err != nil {
		return nil, fmt.Errorf("summarize: %w", err)
	}
	return steps.SummarizeVideoEvidence(ctx, p.llmChain, evidence)
}

func (p *videoUnderstandingPipeline) embed(ctx context.Context, prevResults worker.StepResults) (*worker.StepResult, error) {
	var summarizeResult steps.SummarizeResult
	if err := parseStep(prevResults, "summarize", &summarizeResult); err != nil {
		return nil, fmt.Errorf("embed: %w", err)
	}
	var evidence steps.VideoEvidence
	if err := parseStep(prevResults, "evidence", &evidence); err != nil {
		return nil, fmt.Errorf("embed: %w", err)
	}
	return steps.Embed(ctx, p.embeddingChain, steps.VideoEmbeddingText(evidence, summarizeResult))
}

func metadataForVideoURL(ctx context.Context, ytdlp *services.YTDLP, sourceURL string, maxDuration int) (*worker.StepResult, error) {
	if ytdlp == nil {
		return steps.DegradedMetadataResult(fmt.Errorf("yt-dlp is not configured"))
	}
	result, err := steps.Metadata(ctx, ytdlp, sourceURL, maxDuration)
	if err == nil {
		return result, nil
	}
	if errors.Is(err, steps.ErrVideoDurationExceeded) || sourceURL == "" {
		return nil, err
	}
	return steps.DegradedMetadataResult(err)
}

func resolvedVideoFromResults(sourceType, sourceURL string, prevResults worker.StepResults) (steps.ResolvedVideo, error) {
	var metadata steps.MetadataResult
	if err := parseStep(prevResults, "metadata", &metadata); err != nil {
		return steps.ResolvedVideo{}, err
	}
	var download steps.DownloadResult
	if err := parseStep(prevResults, "download", &download); err != nil {
		return steps.ResolvedVideo{}, err
	}
	if download.VideoFilePath == "" {
		return steps.ResolvedVideo{}, fmt.Errorf("download result has no video file path")
	}
	info, err := os.Stat(download.VideoFilePath)
	if err != nil {
		return steps.ResolvedVideo{}, fmt.Errorf("local video is not readable: %w", err)
	}
	if info.IsDir() {
		return steps.ResolvedVideo{}, fmt.Errorf("local video path is a directory: %s", download.VideoFilePath)
	}
	return steps.ResolvedVideo{
		LocalPath:       download.VideoFilePath,
		SourceURL:       sourceURL,
		SourceType:      sourceType,
		Title:           metadata.Title,
		Description:     metadata.Description,
		Creator:         metadata.Channel,
		DurationSeconds: metadata.Duration,
		ThumbnailURL:    metadata.ThumbnailURL,
		HasCaptions:     metadata.HasCaptions,
	}, nil
}

func stageMediaKeyToTemp(ctx context.Context, storage services.StorageProvider, mediaKey string, tempBasePath string, jobID uuid.UUID, filename string) (string, error) {
	if storage == nil {
		return "", fmt.Errorf("stage media: storage is not configured")
	}
	if mediaKey == "" {
		return "", fmt.Errorf("stage media: empty media key")
	}
	outputDir := filepath.Join(tempBasePath, jobID.String())
	if err := os.MkdirAll(outputDir, 0o755); err != nil {
		return "", fmt.Errorf("stage media: create output dir: %w", err)
	}
	ext := filepath.Ext(mediaKey)
	if ext == "" {
		ext = ".mp4"
	}
	if filename == "" {
		filename = "uploaded"
	}
	videoPath := filepath.Join(outputDir, filename+ext)

	rc, err := storage.Get(ctx, mediaKey)
	if err != nil {
		return "", fmt.Errorf("stage media: storage get: %w", err)
	}
	defer rc.Close()

	f, err := os.Create(videoPath)
	if err != nil {
		return "", fmt.Errorf("stage media: create file: %w", err)
	}
	if _, err := io.Copy(f, rc); err != nil {
		_ = f.Close()
		return "", fmt.Errorf("stage media: copy file: %w", err)
	}
	if err := f.Close(); err != nil {
		return "", fmt.Errorf("stage media: close file: %w", err)
	}
	return videoPath, nil
}

func parseStep(prevResults worker.StepResults, step string, out any) error {
	raw, ok := prevResults[step]
	if !ok || raw == nil {
		return fmt.Errorf("missing %s result", step)
	}
	if err := json.Unmarshal(raw.Data, out); err != nil {
		return fmt.Errorf("parse %s result: %w", step, err)
	}
	return nil
}
