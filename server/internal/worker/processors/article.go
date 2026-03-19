package processors

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/ksushant6566/mindtab/server/internal/providers"
	"github.com/ksushant6566/mindtab/server/internal/providers/embedding"
	"github.com/ksushant6566/mindtab/server/internal/providers/llm"
	"github.com/ksushant6566/mindtab/server/internal/services"
	"github.com/ksushant6566/mindtab/server/internal/store"
	"github.com/ksushant6566/mindtab/server/internal/worker"
	"github.com/ksushant6566/mindtab/server/internal/worker/steps"
)

// ArticleProcessor handles the processing pipeline for article/URL content.
// Pipeline: extract → summarize → embed → store
type ArticleProcessor struct {
	jina           *services.JinaReader
	llmChain       *providers.Chain[llm.LLMProvider]
	embeddingChain *providers.Chain[embedding.EmbeddingProvider]
	queries        store.Querier
	pool           *pgxpool.Pool
}

// NewArticleProcessor constructs an ArticleProcessor with all required dependencies.
func NewArticleProcessor(
	jina *services.JinaReader,
	llmChain *providers.Chain[llm.LLMProvider],
	embeddingChain *providers.Chain[embedding.EmbeddingProvider],
	queries store.Querier,
	pool *pgxpool.Pool,
) *ArticleProcessor {
	return &ArticleProcessor{
		jina:           jina,
		llmChain:       llmChain,
		embeddingChain: embeddingChain,
		queries:        queries,
		pool:           pool,
	}
}

// ContentType returns the content type this processor handles.
func (p *ArticleProcessor) ContentType() string {
	return "article"
}

// Steps returns the ordered list of step names for this pipeline.
func (p *ArticleProcessor) Steps() []string {
	return []string{"extract", "summarize", "embed", "store"}
}

// Execute runs the named step and returns its result.
func (p *ArticleProcessor) Execute(ctx context.Context, step string, job *worker.Job, prevResults worker.StepResults) (*worker.StepResult, error) {
	switch step {
	case "extract":
		return p.extract(ctx, job)
	case "summarize":
		return p.summarize(ctx, prevResults)
	case "embed":
		return p.embed(ctx, prevResults)
	case "store":
		return steps.Store(ctx, p.queries, job, prevResults)
	default:
		return nil, fmt.Errorf("article processor: unknown step %q", step)
	}
}

func (p *ArticleProcessor) extract(ctx context.Context, job *worker.Job) (*worker.StepResult, error) {
	return steps.Extract(ctx, p.jina, job)
}

func (p *ArticleProcessor) summarize(ctx context.Context, prevResults worker.StepResults) (*worker.StepResult, error) {
	extractRaw, ok := prevResults["extract"]
	if !ok || extractRaw == nil {
		return nil, fmt.Errorf("summarize: missing extract result")
	}

	var extractResult steps.ExtractResult
	if err := json.Unmarshal(extractRaw.Data, &extractResult); err != nil {
		return nil, fmt.Errorf("summarize: parse extract result: %w", err)
	}

	if extractResult.Text == "" {
		return nil, fmt.Errorf("summarize: extracted text is empty")
	}

	return steps.Summarize(ctx, p.llmChain, extractResult.Text)
}

func (p *ArticleProcessor) embed(ctx context.Context, prevResults worker.StepResults) (*worker.StepResult, error) {
	summarizeRaw, ok := prevResults["summarize"]
	if !ok || summarizeRaw == nil {
		return nil, fmt.Errorf("embed: missing summarize result")
	}

	var summarizeResult steps.SummarizeResult
	if err := json.Unmarshal(summarizeRaw.Data, &summarizeResult); err != nil {
		return nil, fmt.Errorf("embed: parse summarize result: %w", err)
	}

	var extractResult steps.ExtractResult
	if extractRaw, ok := prevResults["extract"]; ok && extractRaw != nil {
		json.Unmarshal(extractRaw.Data, &extractResult) //nolint:errcheck
	}

	// Combine summary with first 2000 chars of extracted text for embedding.
	var buf bytes.Buffer
	buf.WriteString(summarizeResult.Summary)
	if extractResult.Text != "" {
		buf.WriteString("\n\n")
		text := extractResult.Text
		if len(text) > 2000 {
			text = text[:2000]
		}
		buf.WriteString(text)
	}

	return steps.Embed(ctx, p.embeddingChain, buf.String())
}
