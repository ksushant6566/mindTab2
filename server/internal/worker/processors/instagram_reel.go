package processors

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
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

// InstagramReelProcessor handles public Instagram Reel/Post URLs and uploaded
// Instagram video files. URL extraction is best-effort via yt-dlp; uploaded
// media is staged from storage and uses the same downstream video pipeline.
type InstagramReelProcessor struct {
	ytdlp              *services.YTDLP
	ffmpeg             *services.FFmpeg
	transcriptionChain *providers.Chain[transcription.TranscriptionProvider]
	llmChain           *providers.Chain[llm.LLMProvider]
	embeddingChain     *providers.Chain[embedding.EmbeddingProvider]
	storage            services.StorageProvider
	queries            store.Querier
	pool               *pgxpool.Pool
	cfg                *config.Config
	video              *videoUnderstandingPipeline
}

func NewInstagramReelProcessor(
	ytdlp *services.YTDLP,
	ffmpeg *services.FFmpeg,
	transcriptionChain *providers.Chain[transcription.TranscriptionProvider],
	llmChain *providers.Chain[llm.LLMProvider],
	embeddingChain *providers.Chain[embedding.EmbeddingProvider],
	storage services.StorageProvider,
	queries store.Querier,
	pool *pgxpool.Pool,
	cfg *config.Config,
) *InstagramReelProcessor {
	p := &InstagramReelProcessor{
		ytdlp:              ytdlp,
		ffmpeg:             ffmpeg,
		transcriptionChain: transcriptionChain,
		llmChain:           llmChain,
		embeddingChain:     embeddingChain,
		storage:            storage,
		queries:            queries,
		pool:               pool,
		cfg:                cfg,
	}
	p.video = newVideoUnderstandingPipeline("instagram_reel", ytdlp, ffmpeg, transcriptionChain, llmChain, embeddingChain, queries)
	return p
}

func (p *InstagramReelProcessor) ContentType() string { return "instagram_reel" }

func (p *InstagramReelProcessor) Steps() []string {
	return p.video.Steps()
}

func (p *InstagramReelProcessor) LockTTL() time.Duration { return 15 * time.Minute }

func (p *InstagramReelProcessor) Execute(ctx context.Context, step string, job *worker.Job, prevResults worker.StepResults) (*worker.StepResult, error) {
	switch step {
	case "metadata":
		return p.metadata(ctx, job)
	case "download":
		return p.download(ctx, job)
	default:
		return p.video.RunVideoUnderstanding(ctx, step, job, prevResults)
	}
}

func (p *InstagramReelProcessor) metadata(ctx context.Context, job *worker.Job) (*worker.StepResult, error) {
	if job.SourceURL != "" {
		return metadataForVideoURL(ctx, p.ytdlp, job.SourceURL, p.cfg.YoutubeMaxDuration)
	}

	row, err := p.queries.GetContentByID(ctx, store.GetContentByIDParams{
		ID:     pgtype.UUID{Bytes: job.ContentID, Valid: true},
		UserID: job.UserID,
	})
	if err != nil {
		return nil, fmt.Errorf("instagram metadata: load uploaded video row: %w", err)
	}
	if !row.DurationSeconds.Valid {
		return nil, fmt.Errorf("instagram metadata: uploaded video has no duration_seconds")
	}
	result := steps.MetadataResult{
		VideoID:  job.ContentID.String(),
		Duration: int(row.DurationSeconds.Int32),
		Status:   steps.EvidenceStatus{Source: "metadata", Status: steps.EvidenceStatusSuccess},
	}
	if row.SourceTitle.Valid {
		result.Title = row.SourceTitle.String
	}
	data, _ := json.Marshal(result)
	return &worker.StepResult{Data: data}, nil
}

func (p *InstagramReelProcessor) download(ctx context.Context, job *worker.Job) (*worker.StepResult, error) {
	if job.SourceURL != "" {
		return steps.Download(ctx, p.ytdlp, job.SourceURL, p.cfg.YoutubeTempPath, job.ID, p.cfg.YoutubeVideoQuality)
	}

	row, err := p.queries.GetContentByID(ctx, store.GetContentByIDParams{
		ID:     pgtype.UUID{Bytes: job.ContentID, Valid: true},
		UserID: job.UserID,
	})
	if err != nil {
		return nil, fmt.Errorf("instagram download: load uploaded video row: %w", err)
	}
	if !row.MediaKey.Valid || row.MediaKey.String == "" {
		return nil, fmt.Errorf("instagram download: uploaded video has no media_key")
	}

	videoPath, err := stageMediaKeyToTemp(ctx, p.storage, row.MediaKey.String, p.cfg.YoutubeTempPath, job.ID, "uploaded")
	if err != nil {
		return nil, fmt.Errorf("instagram download: %w", err)
	}

	result := steps.DownloadResult{VideoFilePath: videoPath}
	data, _ := json.Marshal(result)
	return &worker.StepResult{Data: data}, nil
}
