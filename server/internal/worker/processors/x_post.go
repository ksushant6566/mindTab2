package processors

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

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

type xPostFetcher interface {
	FetchPost(ctx context.Context, rawURL string) (*services.XPost, error)
}

// XPostProcessor handles first-class X/Twitter post saves.
// Pipeline: fetch → summarize → embed → store
type XPostProcessor struct {
	fetcher        xPostFetcher
	llmChain       *providers.Chain[llm.LLMProvider]
	embeddingChain *providers.Chain[embedding.EmbeddingProvider]
	queries        store.Querier
	pool           *pgxpool.Pool
}

type xPostFetchResult struct {
	Post services.XPost `json:"post"`
}

type xPostSourceMetadata struct {
	Version int            `json:"version"`
	Fetcher string         `json:"fetcher"`
	Post    services.XPost `json:"post"`
}

// NewXPostProcessor constructs an XPostProcessor with all required dependencies.
func NewXPostProcessor(
	fetcher xPostFetcher,
	llmChain *providers.Chain[llm.LLMProvider],
	embeddingChain *providers.Chain[embedding.EmbeddingProvider],
	queries store.Querier,
	pool *pgxpool.Pool,
) *XPostProcessor {
	return &XPostProcessor{
		fetcher:        fetcher,
		llmChain:       llmChain,
		embeddingChain: embeddingChain,
		queries:        queries,
		pool:           pool,
	}
}

// ContentType returns the content type this processor handles.
func (p *XPostProcessor) ContentType() string {
	return "x_post"
}

// Steps returns the ordered list of step names for this pipeline.
func (p *XPostProcessor) Steps() []string {
	return []string{"fetch", "summarize", "embed", "store"}
}

// LockTTL returns the distributed lock duration for this processor.
func (p *XPostProcessor) LockTTL() time.Duration {
	return 5 * time.Minute
}

// Execute runs the named step and returns its result.
func (p *XPostProcessor) Execute(ctx context.Context, step string, job *worker.Job, prevResults worker.StepResults) (*worker.StepResult, error) {
	switch step {
	case "fetch":
		return p.fetch(ctx, job)
	case "summarize":
		return p.summarize(ctx, prevResults)
	case "embed":
		return p.embed(ctx, prevResults)
	case "store":
		return p.store(ctx, job, prevResults)
	default:
		return nil, fmt.Errorf("x post processor: unknown step %q", step)
	}
}

func (p *XPostProcessor) fetch(ctx context.Context, job *worker.Job) (*worker.StepResult, error) {
	if job.SourceURL == "" {
		return nil, fmt.Errorf("x post fetch: no source URL")
	}
	if p.fetcher == nil {
		return nil, fmt.Errorf("x post fetch: fetcher is not configured")
	}
	post, err := p.fetcher.FetchPost(ctx, job.SourceURL)
	if err != nil {
		return nil, fmt.Errorf("x post fetch: %w", err)
	}
	if post == nil || strings.TrimSpace(post.Text) == "" {
		return nil, fmt.Errorf("x post fetch: response contained no post text")
	}
	data, err := json.Marshal(xPostFetchResult{Post: *post})
	if err != nil {
		return nil, fmt.Errorf("x post fetch: marshal result: %w", err)
	}
	return &worker.StepResult{Data: data}, nil
}

func (p *XPostProcessor) summarize(ctx context.Context, prevResults worker.StepResults) (*worker.StepResult, error) {
	fetchResult, err := parseXPostFetchResult(prevResults)
	if err != nil {
		return nil, err
	}
	text := formatXPostForSummary(fetchResult.Post)
	if strings.TrimSpace(text) == "" {
		return nil, fmt.Errorf("x post summarize: empty post text")
	}
	return steps.Summarize(ctx, p.llmChain, text)
}

func (p *XPostProcessor) embed(ctx context.Context, prevResults worker.StepResults) (*worker.StepResult, error) {
	fetchResult, err := parseXPostFetchResult(prevResults)
	if err != nil {
		return nil, err
	}
	summarizeRaw, ok := prevResults["summarize"]
	if !ok || summarizeRaw == nil {
		return nil, fmt.Errorf("x post embed: missing summarize result")
	}

	var summarizeResult steps.SummarizeResult
	if err := json.Unmarshal(summarizeRaw.Data, &summarizeResult); err != nil {
		return nil, fmt.Errorf("x post embed: parse summarize result: %w", err)
	}

	var buf bytes.Buffer
	buf.WriteString(summarizeResult.Summary)
	buf.WriteString("\n\n")
	buf.WriteString(formatXPostExtractedText(fetchResult.Post))

	return steps.Embed(ctx, p.embeddingChain, buf.String())
}

func (p *XPostProcessor) store(ctx context.Context, job *worker.Job, prevResults worker.StepResults) (*worker.StepResult, error) {
	fetchResult, err := parseXPostFetchResult(prevResults)
	if err != nil {
		return nil, err
	}

	storeResults, err := withExtractResult(prevResults, steps.ExtractResult{
		Text: formatXPostExtractedText(fetchResult.Post),
	})
	if err != nil {
		return nil, fmt.Errorf("x post store: build extract result: %w", err)
	}

	result, err := steps.Store(ctx, p.queries, job, storeResults)
	if err != nil {
		return nil, err
	}

	metadata, err := json.Marshal(xPostSourceMetadata{
		Version: 1,
		Fetcher: "x_official_api",
		Post:    fetchResult.Post,
	})
	if err != nil {
		return nil, fmt.Errorf("x post store: marshal source metadata: %w", err)
	}

	if err := p.queries.UpdateContentSourceMetadata(ctx, store.UpdateContentSourceMetadataParams{
		ID:             pgtype.UUID{Bytes: job.ContentID, Valid: true},
		SourceMetadata: metadata,
	}); err != nil {
		return nil, fmt.Errorf("x post store: update source metadata: %w", err)
	}

	return result, nil
}

func parseXPostFetchResult(prevResults worker.StepResults) (xPostFetchResult, error) {
	fetchRaw, ok := prevResults["fetch"]
	if !ok || fetchRaw == nil {
		return xPostFetchResult{}, fmt.Errorf("x post: missing fetch result")
	}
	var fetchResult xPostFetchResult
	if err := json.Unmarshal(fetchRaw.Data, &fetchResult); err != nil {
		return xPostFetchResult{}, fmt.Errorf("x post: parse fetch result: %w", err)
	}
	return fetchResult, nil
}

func formatXPostForSummary(post services.XPost) string {
	var b strings.Builder
	writeLine(&b, "Source: X post")
	if post.AuthorUsername != "" {
		writeLine(&b, "Author: @"+post.AuthorUsername)
	} else if post.AuthorName != "" {
		writeLine(&b, "Author: "+post.AuthorName)
	}
	writeLine(&b, "Post:")
	writeLine(&b, post.Text)
	if len(post.ReferencedTweets) > 0 {
		writeLine(&b, "\nReferenced posts:")
		for _, ref := range post.ReferencedTweets {
			author := ref.AuthorUsername
			if author != "" {
				author = "@" + author + ": "
			}
			writeLine(&b, "- "+ref.Type+": "+author+ref.Text)
		}
	}
	if len(post.Media) > 0 {
		// Social v0 is text-only: include media alt text, but defer image/video
		// understanding to a future source-specific media pipeline.
		writeLine(&b, "\nMedia:")
		for _, media := range post.Media {
			if media.AltText != "" {
				writeLine(&b, "- "+media.Type+": "+media.AltText)
			} else {
				writeLine(&b, "- "+media.Type)
			}
		}
	}
	return b.String()
}

func formatXPostExtractedText(post services.XPost) string {
	var b strings.Builder
	if post.AuthorUsername != "" {
		writeLine(&b, "@"+post.AuthorUsername)
	}
	writeLine(&b, post.Text)
	for _, ref := range post.ReferencedTweets {
		if strings.TrimSpace(ref.Text) == "" {
			continue
		}
		writeLine(&b, "\n"+ref.Type+": "+ref.Text)
	}
	for _, media := range post.Media {
		if strings.TrimSpace(media.AltText) == "" {
			continue
		}
		writeLine(&b, "\nMedia alt text: "+media.AltText)
	}
	return strings.TrimSpace(b.String())
}
