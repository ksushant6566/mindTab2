package processors

import (
	"context"
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
	video              *videoUnderstandingPipeline
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
	p := &YoutubeProcessor{
		ytdlp:              ytdlp,
		ffmpeg:             ffmpeg,
		transcriptionChain: transcriptionChain,
		llmChain:           llmChain,
		embeddingChain:     embeddingChain,
		queries:            queries,
		pool:               pool,
		cfg:                cfg,
	}
	p.video = newVideoUnderstandingPipeline("youtube", ytdlp, ffmpeg, transcriptionChain, llmChain, embeddingChain, queries)
	return p
}

// ContentType returns the content type this processor handles.
func (p *YoutubeProcessor) ContentType() string {
	return "youtube"
}

// Steps returns the ordered list of step names for this pipeline.
func (p *YoutubeProcessor) Steps() []string {
	return p.video.Steps()
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
	default:
		return p.video.RunVideoUnderstanding(ctx, step, job, prevResults)
	}
}

func (p *YoutubeProcessor) metadata(ctx context.Context, job *worker.Job) (*worker.StepResult, error) {
	return metadataForVideoURL(ctx, p.ytdlp, job.SourceURL, p.cfg.YoutubeMaxDuration)
}

func (p *YoutubeProcessor) download(ctx context.Context, job *worker.Job) (*worker.StepResult, error) {
	return steps.Download(ctx, p.ytdlp, job.SourceURL, p.cfg.YoutubeTempPath, job.ID, p.cfg.YoutubeVideoQuality)
}
