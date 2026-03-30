package processors

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/ksushant6566/mindtab/server/internal/config"
	"github.com/ksushant6566/mindtab/server/internal/providers"
	"github.com/ksushant6566/mindtab/server/internal/providers/embedding"
	"github.com/ksushant6566/mindtab/server/internal/providers/llm"
	"github.com/ksushant6566/mindtab/server/internal/providers/transcription"
	"github.com/ksushant6566/mindtab/server/internal/services"
	"github.com/ksushant6566/mindtab/server/internal/store"
	"github.com/ksushant6566/mindtab/server/internal/worker"
	"github.com/ksushant6566/mindtab/server/internal/worker/steps"
)

// YoutubeProcessor handles the processing pipeline for YouTube video content.
// Pipeline: metadata → download → transcribe → extract_frames → vision → summarize → embed → store
type YoutubeProcessor struct {
	ytdlp              *services.YTDLP
	ffmpeg             *services.FFmpeg
	transcriptionChain *providers.Chain[transcription.TranscriptionProvider]
	llmChain           *providers.Chain[llm.LLMProvider]
	embeddingChain     *providers.Chain[embedding.EmbeddingProvider]
	queries            store.Querier
	pool               *pgxpool.Pool
	cfg                *config.Config
}

// NewYoutubeProcessor constructs a YoutubeProcessor with all required dependencies.
func NewYoutubeProcessor(
	ytdlp *services.YTDLP,
	ffmpeg *services.FFmpeg,
	transcriptionChain *providers.Chain[transcription.TranscriptionProvider],
	llmChain *providers.Chain[llm.LLMProvider],
	embeddingChain *providers.Chain[embedding.EmbeddingProvider],
	queries store.Querier,
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

// ContentType returns the content type this processor handles.
func (p *YoutubeProcessor) ContentType() string {
	return "youtube"
}

// Steps returns the ordered list of step names for this pipeline.
func (p *YoutubeProcessor) Steps() []string {
	return []string{"metadata", "download", "transcribe", "extract_frames", "vision", "summarize", "embed", "store"}
}

// LockTTL returns the distributed lock duration for this processor.
func (p *YoutubeProcessor) LockTTL() time.Duration {
	return 15 * time.Minute
}

// Execute runs the named step and returns its result.
func (p *YoutubeProcessor) Execute(ctx context.Context, step string, job *worker.Job, prevResults worker.StepResults) (*worker.StepResult, error) {
	switch step {
	case "metadata":
		return p.metadata(ctx, job)
	case "download":
		return p.download(ctx, job)
	case "transcribe":
		return p.transcribe(ctx, job, prevResults)
	case "extract_frames":
		return p.extractFrames(ctx, prevResults)
	case "vision":
		return p.vision(ctx, prevResults)
	case "summarize":
		return p.summarize(ctx, prevResults)
	case "embed":
		return p.embed(ctx, prevResults)
	case "store":
		return steps.Store(ctx, p.queries, job, prevResults)
	default:
		return nil, fmt.Errorf("youtube processor: unknown step %q", step)
	}
}

func (p *YoutubeProcessor) metadata(ctx context.Context, job *worker.Job) (*worker.StepResult, error) {
	return steps.Metadata(ctx, p.ytdlp, job.SourceURL, p.cfg.YoutubeMaxDuration)
}

func (p *YoutubeProcessor) download(ctx context.Context, job *worker.Job) (*worker.StepResult, error) {
	return steps.Download(ctx, p.ytdlp, job.SourceURL, p.cfg.YoutubeTempPath, job.ID, p.cfg.YoutubeVideoQuality)
}

func (p *YoutubeProcessor) transcribe(ctx context.Context, job *worker.Job, prevResults worker.StepResults) (*worker.StepResult, error) {
	metadataRaw, ok := prevResults["metadata"]
	if !ok || metadataRaw == nil {
		return nil, fmt.Errorf("transcribe: missing metadata result")
	}
	var metadataResult steps.MetadataResult
	if err := json.Unmarshal(metadataRaw.Data, &metadataResult); err != nil {
		return nil, fmt.Errorf("transcribe: parse metadata result: %w", err)
	}

	downloadRaw, ok := prevResults["download"]
	if !ok || downloadRaw == nil {
		return nil, fmt.Errorf("transcribe: missing download result")
	}
	var downloadResult steps.DownloadResult
	if err := json.Unmarshal(downloadRaw.Data, &downloadResult); err != nil {
		return nil, fmt.Errorf("transcribe: parse download result: %w", err)
	}

	return steps.Transcribe(
		ctx,
		p.ytdlp,
		p.ffmpeg,
		p.transcriptionChain,
		job.SourceURL,
		downloadResult.VideoFilePath,
		metadataResult.HasCaptions,
	)
}

func (p *YoutubeProcessor) extractFrames(ctx context.Context, prevResults worker.StepResults) (*worker.StepResult, error) {
	downloadRaw, ok := prevResults["download"]
	if !ok || downloadRaw == nil {
		return nil, fmt.Errorf("extract_frames: missing download result")
	}
	var downloadResult steps.DownloadResult
	if err := json.Unmarshal(downloadRaw.Data, &downloadResult); err != nil {
		return nil, fmt.Errorf("extract_frames: parse download result: %w", err)
	}

	metadataRaw, ok := prevResults["metadata"]
	if !ok || metadataRaw == nil {
		return nil, fmt.Errorf("extract_frames: missing metadata result")
	}
	var metadataResult steps.MetadataResult
	if err := json.Unmarshal(metadataRaw.Data, &metadataResult); err != nil {
		return nil, fmt.Errorf("extract_frames: parse metadata result: %w", err)
	}

	return steps.ExtractFrames(
		ctx,
		p.ffmpeg,
		downloadResult.VideoFilePath,
		metadataResult.Duration,
		0.3,
		p.cfg.YoutubeFramesCap,
	)
}

func (p *YoutubeProcessor) vision(ctx context.Context, prevResults worker.StepResults) (*worker.StepResult, error) {
	framesRaw, ok := prevResults["extract_frames"]
	if !ok || framesRaw == nil {
		return nil, fmt.Errorf("vision: missing extract_frames result")
	}
	var framesResult steps.ExtractFramesResult
	if err := json.Unmarshal(framesRaw.Data, &framesResult); err != nil {
		return nil, fmt.Errorf("vision: parse extract_frames result: %w", err)
	}

	return steps.BatchVision(ctx, p.llmChain, framesResult.FramePaths)
}

func (p *YoutubeProcessor) summarize(ctx context.Context, prevResults worker.StepResults) (*worker.StepResult, error) {
	var transcribeResult steps.TranscribeResult
	if transcribeRaw, ok := prevResults["transcribe"]; ok && transcribeRaw != nil {
		json.Unmarshal(transcribeRaw.Data, &transcribeResult) //nolint:errcheck
	}

	var visionResult steps.BatchVisionResult
	if visionRaw, ok := prevResults["vision"]; ok && visionRaw != nil {
		json.Unmarshal(visionRaw.Data, &visionResult) //nolint:errcheck
	}

	// Build input text from transcript and visual description.
	var buf bytes.Buffer
	if transcribeResult.Transcript != "" {
		buf.WriteString(transcribeResult.Transcript)
	}
	if visionResult.VisualDescription != "" {
		if buf.Len() > 0 {
			buf.WriteString("\n\n")
		}
		buf.WriteString(visionResult.VisualDescription)
	}

	if buf.Len() == 0 {
		return nil, fmt.Errorf("summarize: no usable text from transcript or vision")
	}

	return steps.Summarize(ctx, p.llmChain, buf.String())
}

func (p *YoutubeProcessor) embed(ctx context.Context, prevResults worker.StepResults) (*worker.StepResult, error) {
	summarizeRaw, ok := prevResults["summarize"]
	if !ok || summarizeRaw == nil {
		return nil, fmt.Errorf("embed: missing summarize result")
	}
	var summarizeResult steps.SummarizeResult
	if err := json.Unmarshal(summarizeRaw.Data, &summarizeResult); err != nil {
		return nil, fmt.Errorf("embed: parse summarize result: %w", err)
	}

	var transcribeResult steps.TranscribeResult
	if transcribeRaw, ok := prevResults["transcribe"]; ok && transcribeRaw != nil {
		json.Unmarshal(transcribeRaw.Data, &transcribeResult) //nolint:errcheck
	}

	// Combine summary with first 2000 chars of transcript for embedding.
	var buf bytes.Buffer
	buf.WriteString(summarizeResult.Summary)
	if transcribeResult.Transcript != "" {
		buf.WriteString("\n\n")
		text := transcribeResult.Transcript
		if len(text) > 2000 {
			text = text[:2000]
		}
		buf.WriteString(text)
	}

	return steps.Embed(ctx, p.embeddingChain, buf.String())
}
