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

type redditPostFetcher interface {
	FetchPost(ctx context.Context, rawURL string) (*services.RedditPost, error)
}

// RedditPostProcessor handles first-class Reddit post saves.
// Pipeline: fetch → summarize → embed → store
type RedditPostProcessor struct {
	fetcher        redditPostFetcher
	llmChain       *providers.Chain[llm.LLMProvider]
	embeddingChain *providers.Chain[embedding.EmbeddingProvider]
	queries        store.Querier
	pool           *pgxpool.Pool
}

type redditPostFetchResult struct {
	Post services.RedditPost `json:"post"`
}

type redditPostSourceMetadata struct {
	Version int                 `json:"version"`
	Fetcher string              `json:"fetcher"`
	Post    services.RedditPost `json:"post"`
}

// NewRedditPostProcessor constructs a RedditPostProcessor with all required dependencies.
func NewRedditPostProcessor(
	fetcher redditPostFetcher,
	llmChain *providers.Chain[llm.LLMProvider],
	embeddingChain *providers.Chain[embedding.EmbeddingProvider],
	queries store.Querier,
	pool *pgxpool.Pool,
) *RedditPostProcessor {
	return &RedditPostProcessor{
		fetcher:        fetcher,
		llmChain:       llmChain,
		embeddingChain: embeddingChain,
		queries:        queries,
		pool:           pool,
	}
}

// ContentType returns the content type this processor handles.
func (p *RedditPostProcessor) ContentType() string {
	return "reddit_post"
}

// Steps returns the ordered list of step names for this pipeline.
func (p *RedditPostProcessor) Steps() []string {
	return []string{"fetch", "summarize", "embed", "store"}
}

// LockTTL returns the distributed lock duration for this processor.
func (p *RedditPostProcessor) LockTTL() time.Duration {
	return 5 * time.Minute
}

// Execute runs the named step and returns its result.
func (p *RedditPostProcessor) Execute(ctx context.Context, step string, job *worker.Job, prevResults worker.StepResults) (*worker.StepResult, error) {
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
		return nil, fmt.Errorf("reddit post processor: unknown step %q", step)
	}
}

func (p *RedditPostProcessor) fetch(ctx context.Context, job *worker.Job) (*worker.StepResult, error) {
	if job.SourceURL == "" {
		return nil, fmt.Errorf("reddit post fetch: no source URL")
	}
	if p.fetcher == nil {
		return nil, fmt.Errorf("reddit post fetch: fetcher is not configured")
	}
	post, err := p.fetcher.FetchPost(ctx, job.SourceURL)
	if err != nil {
		return nil, fmt.Errorf("reddit post fetch: %w", err)
	}
	if post == nil || strings.TrimSpace(post.Title) == "" {
		return nil, fmt.Errorf("reddit post fetch: response contained no post title")
	}
	data, err := json.Marshal(redditPostFetchResult{Post: *post})
	if err != nil {
		return nil, fmt.Errorf("reddit post fetch: marshal result: %w", err)
	}
	return &worker.StepResult{Data: data}, nil
}

func (p *RedditPostProcessor) summarize(ctx context.Context, prevResults worker.StepResults) (*worker.StepResult, error) {
	fetchResult, err := parseRedditPostFetchResult(prevResults)
	if err != nil {
		return nil, err
	}
	text := formatRedditPostForSummary(fetchResult.Post)
	if strings.TrimSpace(text) == "" {
		return nil, fmt.Errorf("reddit post summarize: empty post text")
	}
	return steps.Summarize(ctx, p.llmChain, text)
}

func (p *RedditPostProcessor) embed(ctx context.Context, prevResults worker.StepResults) (*worker.StepResult, error) {
	fetchResult, err := parseRedditPostFetchResult(prevResults)
	if err != nil {
		return nil, err
	}
	summarizeRaw, ok := prevResults["summarize"]
	if !ok || summarizeRaw == nil {
		return nil, fmt.Errorf("reddit post embed: missing summarize result")
	}

	var summarizeResult steps.SummarizeResult
	if err := json.Unmarshal(summarizeRaw.Data, &summarizeResult); err != nil {
		return nil, fmt.Errorf("reddit post embed: parse summarize result: %w", err)
	}

	var buf bytes.Buffer
	buf.WriteString(summarizeResult.Summary)
	buf.WriteString("\n\n")
	buf.WriteString(formatRedditPostExtractedText(fetchResult.Post))

	return steps.Embed(ctx, p.embeddingChain, buf.String())
}

func (p *RedditPostProcessor) store(ctx context.Context, job *worker.Job, prevResults worker.StepResults) (*worker.StepResult, error) {
	fetchResult, err := parseRedditPostFetchResult(prevResults)
	if err != nil {
		return nil, err
	}

	storeResults, err := withExtractResult(prevResults, steps.ExtractResult{
		Title: fetchResult.Post.Title,
		Text:  formatRedditPostExtractedText(fetchResult.Post),
	})
	if err != nil {
		return nil, fmt.Errorf("reddit post store: build extract result: %w", err)
	}

	result, err := steps.Store(ctx, p.queries, job, storeResults)
	if err != nil {
		return nil, err
	}

	metadata, err := json.Marshal(redditPostSourceMetadata{
		Version: 1,
		Fetcher: "reddit_json_endpoint",
		Post:    fetchResult.Post,
	})
	if err != nil {
		return nil, fmt.Errorf("reddit post store: marshal source metadata: %w", err)
	}

	if err := p.queries.UpdateContentSourceMetadata(ctx, store.UpdateContentSourceMetadataParams{
		ID:             pgtype.UUID{Bytes: job.ContentID, Valid: true},
		SourceMetadata: metadata,
	}); err != nil {
		return nil, fmt.Errorf("reddit post store: update source metadata: %w", err)
	}

	return result, nil
}

func parseRedditPostFetchResult(prevResults worker.StepResults) (redditPostFetchResult, error) {
	fetchRaw, ok := prevResults["fetch"]
	if !ok || fetchRaw == nil {
		return redditPostFetchResult{}, fmt.Errorf("reddit post: missing fetch result")
	}
	var fetchResult redditPostFetchResult
	if err := json.Unmarshal(fetchRaw.Data, &fetchResult); err != nil {
		return redditPostFetchResult{}, fmt.Errorf("reddit post: parse fetch result: %w", err)
	}
	return fetchResult, nil
}

func formatRedditPostForSummary(post services.RedditPost) string {
	var b strings.Builder
	writeLine(&b, "Source: Reddit post")
	if post.SubredditName != "" {
		writeLine(&b, "Subreddit: "+post.SubredditName)
	}
	if post.Author != "" {
		writeLine(&b, "Author: u/"+post.Author)
	}
	writeLine(&b, "Title: "+post.Title)
	if post.LinkFlairText != "" {
		writeLine(&b, "Flair: "+post.LinkFlairText)
	}
	if post.SelfText != "" {
		writeLine(&b, "\nPost body:")
		writeLine(&b, post.SelfText)
	} else if post.URL != "" && post.URL != post.Permalink {
		writeLine(&b, "\nLinked URL: "+post.URL)
	}
	if len(post.Comments) > 0 {
		// Social v0 is text-only: summarize post text and comments. Rich Reddit
		// media such as galleries/videos/embeds should be added as a later,
		// source-specific pipeline instead of forced into this text path.
		writeLine(&b, "\nTop comments:")
		for i, comment := range post.Comments {
			if i >= 25 {
				break
			}
			body := strings.TrimSpace(comment.Body)
			if body == "" {
				continue
			}
			prefix := fmt.Sprintf("- u/%s (%d): ", comment.Author, comment.Score)
			writeLine(&b, prefix+body)
		}
	}
	return b.String()
}

func formatRedditPostExtractedText(post services.RedditPost) string {
	var b strings.Builder
	writeLine(&b, post.Title)
	if post.SubredditName != "" && post.Author != "" {
		writeLine(&b, fmt.Sprintf("%s by u/%s", post.SubredditName, post.Author))
	} else if post.SubredditName != "" {
		writeLine(&b, post.SubredditName)
	} else if post.Author != "" {
		writeLine(&b, "u/"+post.Author)
	}
	writeLine(&b, post.SelfText)
	if len(post.Comments) > 0 {
		writeLine(&b, "\nComments:")
		for _, comment := range post.Comments {
			body := strings.TrimSpace(comment.Body)
			if body == "" {
				continue
			}
			writeLine(&b, fmt.Sprintf("u/%s: %s", comment.Author, body))
		}
	}
	return strings.TrimSpace(b.String())
}
