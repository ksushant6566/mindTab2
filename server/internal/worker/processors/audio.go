package processors

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/ksushant6566/mindtab/server/internal/providers"
	"github.com/ksushant6566/mindtab/server/internal/providers/embedding"
	"github.com/ksushant6566/mindtab/server/internal/providers/llm"
	"github.com/ksushant6566/mindtab/server/internal/providers/transcription"
	"github.com/ksushant6566/mindtab/server/internal/services"
	"github.com/ksushant6566/mindtab/server/internal/store"
	"github.com/ksushant6566/mindtab/server/internal/worker"
	"github.com/ksushant6566/mindtab/server/internal/worker/steps"
)

// AudioProcessor handles the processing pipeline for uploaded audio content.
// Pipeline: transcribe → summarize → embed → store
type AudioProcessor struct {
	transcriptionChain *providers.Chain[transcription.TranscriptionProvider]
	llmChain           *providers.Chain[llm.LLMProvider]
	embeddingChain     *providers.Chain[embedding.EmbeddingProvider]
	storage            services.StorageProvider
	queries            store.Querier
	pool               *pgxpool.Pool
	ffmpeg             *services.FFmpeg
}

// NewAudioProcessor constructs an AudioProcessor with all required dependencies.
func NewAudioProcessor(
	transcriptionChain *providers.Chain[transcription.TranscriptionProvider],
	llmChain *providers.Chain[llm.LLMProvider],
	embeddingChain *providers.Chain[embedding.EmbeddingProvider],
	storage services.StorageProvider,
	queries store.Querier,
	pool *pgxpool.Pool,
	ffmpeg *services.FFmpeg,
) *AudioProcessor {
	return &AudioProcessor{
		transcriptionChain: transcriptionChain,
		llmChain:           llmChain,
		embeddingChain:     embeddingChain,
		storage:            storage,
		queries:            queries,
		pool:               pool,
		ffmpeg:             ffmpeg,
	}
}

// ContentType returns the content type this processor handles.
func (p *AudioProcessor) ContentType() string { return "audio" }

// LockTTL returns the distributed lock duration for this processor.
func (p *AudioProcessor) LockTTL() time.Duration { return 30 * time.Minute }

// Steps returns the ordered list of step names for this pipeline.
func (p *AudioProcessor) Steps() []string {
	return []string{"transcribe", "summarize", "embed", "store"}
}

// Execute runs the named step and returns its result.
func (p *AudioProcessor) Execute(ctx context.Context, step string, job *worker.Job, prevResults worker.StepResults) (*worker.StepResult, error) {
	switch step {
	case "transcribe":
		return steps.TranscribeAudio(ctx, p.transcriptionChain, p.storage, p.queries, job, p.ffmpeg)
	case "summarize":
		return p.summarize(ctx, prevResults)
	case "embed":
		return p.embed(ctx, prevResults)
	case "store":
		return steps.Store(ctx, p.queries, job, prevResults)
	default:
		return nil, fmt.Errorf("audio processor: unknown step %q", step)
	}
}

// summarize wraps the existing summarize step using the transcript as the body.
// Audio uses the same prompt as articles for now; a dedicated audio summarizer
// can be introduced later.
func (p *AudioProcessor) summarize(ctx context.Context, prevResults worker.StepResults) (*worker.StepResult, error) {
	transcribeRaw, ok := prevResults["transcribe"]
	if !ok || transcribeRaw == nil {
		return nil, fmt.Errorf("audio processor: missing transcribe result")
	}
	var t steps.TranscribeAudioResult
	if err := json.Unmarshal(transcribeRaw.Data, &t); err != nil {
		return nil, fmt.Errorf("audio processor: parse transcribe result: %w", err)
	}
	if t.ExtractedText == "" {
		return nil, fmt.Errorf("audio processor: transcribe produced no text")
	}
	return steps.Summarize(ctx, p.llmChain, t.ExtractedText)
}

func (p *AudioProcessor) embed(ctx context.Context, prevResults worker.StepResults) (*worker.StepResult, error) {
	summarizeRaw, ok := prevResults["summarize"]
	if !ok || summarizeRaw == nil {
		return nil, fmt.Errorf("audio processor: missing summarize result")
	}
	var summarizeResult steps.SummarizeResult
	if err := json.Unmarshal(summarizeRaw.Data, &summarizeResult); err != nil {
		return nil, fmt.Errorf("audio processor: parse summarize result: %w", err)
	}

	var transcribeResult steps.TranscribeAudioResult
	if transcribeRaw, ok := prevResults["transcribe"]; ok && transcribeRaw != nil {
		json.Unmarshal(transcribeRaw.Data, &transcribeResult) //nolint:errcheck
	}

	// Combine summary with first 2000 chars of transcript for richer embedding.
	var buf bytes.Buffer
	buf.WriteString(summarizeResult.Summary)
	if transcribeResult.ExtractedText != "" {
		buf.WriteString("\n\n")
		text := transcribeResult.ExtractedText
		if len(text) > 2000 {
			text = text[:2000]
		}
		buf.WriteString(text)
	}

	return steps.Embed(ctx, p.embeddingChain, buf.String())
}
