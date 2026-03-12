package processors

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/ksushant6566/mindtab/server/internal/providers"
	"github.com/ksushant6566/mindtab/server/internal/providers/embedding"
	"github.com/ksushant6566/mindtab/server/internal/providers/llm"
	"github.com/ksushant6566/mindtab/server/internal/services"
	"github.com/ksushant6566/mindtab/server/internal/store"
	"github.com/ksushant6566/mindtab/server/internal/worker"
	"github.com/ksushant6566/mindtab/server/internal/worker/steps"
)

// ImageProcessor handles the processing pipeline for image content.
// Pipeline: save → vision → summarize → embed → store
type ImageProcessor struct {
	storage        services.StorageProvider
	llmChain       *providers.Chain[llm.LLMProvider]
	embeddingChain *providers.Chain[embedding.EmbeddingProvider]
	queries        store.Querier
	pool           *pgxpool.Pool
}

// NewImageProcessor constructs an ImageProcessor with all required dependencies.
func NewImageProcessor(
	storage services.StorageProvider,
	llmChain *providers.Chain[llm.LLMProvider],
	embeddingChain *providers.Chain[embedding.EmbeddingProvider],
	queries store.Querier,
	pool *pgxpool.Pool,
) *ImageProcessor {
	return &ImageProcessor{
		storage:        storage,
		llmChain:       llmChain,
		embeddingChain: embeddingChain,
		queries:        queries,
		pool:           pool,
	}
}

// ContentType returns the content type this processor handles.
func (p *ImageProcessor) ContentType() string {
	return "image"
}

// Steps returns the ordered list of step names for this pipeline.
func (p *ImageProcessor) Steps() []string {
	return []string{"save", "vision", "summarize", "embed", "store"}
}

// Execute runs the named step and returns its result.
func (p *ImageProcessor) Execute(ctx context.Context, step string, job *worker.Job, prevResults worker.StepResults) (*worker.StepResult, error) {
	switch step {
	case "save":
		return p.save(ctx, job)
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

func (p *ImageProcessor) save(ctx context.Context, job *worker.Job) (*worker.StepResult, error) {
	if len(job.ImageData) == 0 {
		return nil, fmt.Errorf("save: no image data")
	}

	// Build a storage key from content ID and image MIME type.
	ext := mimeToExt(job.ImageType)
	mediaKey := fmt.Sprintf("images/%s%s", job.ContentID.String(), ext)

	if err := p.storage.Save(ctx, mediaKey, bytes.NewReader(job.ImageData), job.ImageType); err != nil {
		return nil, fmt.Errorf("save: store image: %w", err)
	}

	// Update content status to "processing".
	contentID := pgtype.UUID{Bytes: job.ContentID, Valid: true}
	if err := p.queries.UpdateContentStatus(ctx, store.UpdateContentStatusParams{
		ID:               contentID,
		ProcessingStatus: "processing",
		ProcessingError:  pgtype.Text{},
	}); err != nil {
		return nil, fmt.Errorf("save: update content status: %w", err)
	}

	result := map[string]string{"media_key": mediaKey}
	data, _ := json.Marshal(result)
	return &worker.StepResult{Data: data}, nil
}

func (p *ImageProcessor) summarize(ctx context.Context, prevResults worker.StepResults) (*worker.StepResult, error) {
	visionRaw, ok := prevResults["vision"]
	if !ok || visionRaw == nil {
		return nil, fmt.Errorf("summarize: missing vision result")
	}

	var visionResult steps.VisionResult
	if err := json.Unmarshal(visionRaw.Data, &visionResult); err != nil {
		return nil, fmt.Errorf("summarize: parse vision result: %w", err)
	}

	// Combine visual description and any extracted OCR text.
	var buf bytes.Buffer
	if visionResult.VisualDescription != "" {
		buf.WriteString(visionResult.VisualDescription)
	}
	if visionResult.ExtractedText != "" {
		if buf.Len() > 0 {
			buf.WriteString("\n\n")
		}
		buf.WriteString(visionResult.ExtractedText)
	}

	if buf.Len() == 0 {
		return nil, fmt.Errorf("summarize: vision produced no usable text")
	}

	return steps.Summarize(ctx, p.llmChain, buf.String())
}

func (p *ImageProcessor) embed(ctx context.Context, prevResults worker.StepResults) (*worker.StepResult, error) {
	summarizeRaw, ok := prevResults["summarize"]
	if !ok || summarizeRaw == nil {
		return nil, fmt.Errorf("embed: missing summarize result")
	}

	var summarizeResult steps.SummarizeResult
	if err := json.Unmarshal(summarizeRaw.Data, &summarizeResult); err != nil {
		return nil, fmt.Errorf("embed: parse summarize result: %w", err)
	}

	var visionResult steps.VisionResult
	if visionRaw, ok := prevResults["vision"]; ok && visionRaw != nil {
		json.Unmarshal(visionRaw.Data, &visionResult) //nolint:errcheck
	}

	// Combine summary with visual description for embedding.
	var buf bytes.Buffer
	buf.WriteString(summarizeResult.Summary)
	if visionResult.VisualDescription != "" {
		buf.WriteString("\n\n")
		buf.WriteString(visionResult.VisualDescription)
	}

	return steps.Embed(ctx, p.embeddingChain, buf.String())
}

// mimeToExt returns a file extension for common image MIME types.
func mimeToExt(mime string) string {
	switch mime {
	case "image/jpeg", "image/jpg":
		return ".jpg"
	case "image/png":
		return ".png"
	case "image/gif":
		return ".gif"
	case "image/webp":
		return ".webp"
	default:
		return ".bin"
	}
}
