package processors

import (
	"context"
	"encoding/json"
	"log/slog"
	"reflect"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/ksushant6566/mindtab/server/internal/providers"
	"github.com/ksushant6566/mindtab/server/internal/providers/embedding"
	"github.com/ksushant6566/mindtab/server/internal/providers/llm"
	"github.com/ksushant6566/mindtab/server/internal/services"
	"github.com/ksushant6566/mindtab/server/internal/store"
	"github.com/ksushant6566/mindtab/server/internal/testutil"
	"github.com/ksushant6566/mindtab/server/internal/worker"
)

type fakeXPostFetcher struct {
	post *services.XPost
	err  error
}

func (f fakeXPostFetcher) FetchPost(context.Context, string) (*services.XPost, error) {
	return f.post, f.err
}

type fakeRedditPostFetcher struct {
	post *services.RedditPost
	err  error
}

func (f fakeRedditPostFetcher) FetchPost(context.Context, string) (*services.RedditPost, error) {
	return f.post, f.err
}

func makeSocialLLMChain(response string) *providers.Chain[llm.LLMProvider] {
	chain := providers.NewChain[llm.LLMProvider](slog.Default())
	chain.Add("mock-llm", &testutil.MockLLMProvider{Response: response})
	return chain
}

func makeSocialEmbeddingChain() *providers.Chain[embedding.EmbeddingProvider] {
	chain := providers.NewChain[embedding.EmbeddingProvider](slog.Default())
	chain.Add("mock-embedding", &testutil.MockEmbeddingProvider{})
	return chain
}

func makeSocialJob(contentType string) *worker.Job {
	return &worker.Job{
		ID:          uuid.New(),
		ContentID:   uuid.New(),
		UserID:      "user-social-test",
		ContentType: contentType,
		SourceURL:   "https://example.com/post",
	}
}

func socialStoreMock(t *testing.T, wantText string, metadata *json.RawMessage) *store.QuerierMock {
	t.Helper()
	return &store.QuerierMock{
		IsContentDeletedFunc: func(context.Context, pgtype.UUID) (bool, error) {
			return false, nil
		},
		UpdateContentResultsFunc: func(_ context.Context, arg store.UpdateContentResultsParams) error {
			if !arg.ExtractedText.Valid || !strings.Contains(arg.ExtractedText.String, wantText) {
				t.Fatalf("extracted text = %+v, want text containing %q", arg.ExtractedText, wantText)
			}
			if !arg.Summary.Valid {
				t.Fatal("expected summary to be stored")
			}
			return nil
		},
		UpdateContentEmbeddingFunc: func(context.Context, store.UpdateContentEmbeddingParams) error {
			return nil
		},
		UpdateContentSourceMetadataFunc: func(_ context.Context, arg store.UpdateContentSourceMetadataParams) error {
			raw := json.RawMessage(arg.SourceMetadata)
			*metadata = raw
			return nil
		},
	}
}

func TestXPostProcessor_StepContract(t *testing.T) {
	p := NewXPostProcessor(nil, nil, nil, nil, nil)
	if p.ContentType() != "x_post" {
		t.Errorf("ContentType() = %q, want x_post", p.ContentType())
	}
	want := []string{"fetch", "summarize", "embed", "store"}
	if !reflect.DeepEqual(p.Steps(), want) {
		t.Errorf("Steps() = %v, want %v", p.Steps(), want)
	}
	if p.LockTTL() != 5*time.Minute {
		t.Errorf("LockTTL() = %v, want 5m", p.LockTTL())
	}
}

func TestXPostProcessor_HappyPathStoresMetadata(t *testing.T) {
	post := &services.XPost{
		ID:             "123",
		URL:            "https://x.com/mindtab/status/123",
		Text:           "Official X fetchers are live.",
		AuthorName:     "MindTab",
		AuthorUsername: "mindtab",
		PublicMetrics:  services.XPostMetrics{LikeCount: 42},
		Media: []services.XMedia{
			{Type: "photo", AltText: "Screenshot of a shipped feature"},
		},
	}
	llmResp := `{"title":"X Fetchers Live","summary":"The post says official X fetchers are live.","tags":["x","social"],"key_topics":["official fetchers"]}`
	var metadata json.RawMessage
	q := socialStoreMock(t, "Official X fetchers are live.", &metadata)

	p := NewXPostProcessor(fakeXPostFetcher{post: post}, makeSocialLLMChain(llmResp), makeSocialEmbeddingChain(), q, nil)
	job := makeSocialJob("x_post")
	ctx := context.Background()
	prev := worker.StepResults{}

	for _, stepName := range p.Steps() {
		result, err := p.Execute(ctx, stepName, job, prev)
		if err != nil {
			t.Fatalf("%s step: %v", stepName, err)
		}
		prev[stepName] = result
	}

	var stored xPostSourceMetadata
	if err := json.Unmarshal(metadata, &stored); err != nil {
		t.Fatalf("unmarshal source metadata: %v", err)
	}
	if stored.Fetcher != "x_official_api" || stored.Post.ID != "123" {
		t.Fatalf("stored metadata = %+v", stored)
	}
}

func TestRedditPostProcessor_StepContract(t *testing.T) {
	p := NewRedditPostProcessor(nil, nil, nil, nil, nil)
	if p.ContentType() != "reddit_post" {
		t.Errorf("ContentType() = %q, want reddit_post", p.ContentType())
	}
	want := []string{"fetch", "summarize", "embed", "store"}
	if !reflect.DeepEqual(p.Steps(), want) {
		t.Errorf("Steps() = %v, want %v", p.Steps(), want)
	}
	if p.LockTTL() != 5*time.Minute {
		t.Errorf("LockTTL() = %v, want 5m", p.LockTTL())
	}
}

func TestRedditPostProcessor_HappyPathStoresMetadata(t *testing.T) {
	post := &services.RedditPost{
		ID:            "1abc",
		Name:          "t3_1abc",
		URL:           "https://www.reddit.com/r/mindtab/comments/1abc/post/",
		Permalink:     "https://www.reddit.com/r/mindtab/comments/1abc/post/",
		Title:         "How should social saves work?",
		SelfText:      "They should keep source-specific metadata.",
		Author:        "builder",
		Subreddit:     "mindtab",
		SubredditName: "r/mindtab",
		Comments: []services.RedditComment{
			{ID: "c1", Author: "reader", Body: "Use a JSONB metadata column.", Score: 12},
		},
	}
	llmResp := `{"title":"Social Saves Design","summary":"The thread discusses source-specific social metadata.","tags":["reddit","social"],"key_topics":["metadata"]}`
	var metadata json.RawMessage
	q := socialStoreMock(t, "Use a JSONB metadata column.", &metadata)

	p := NewRedditPostProcessor(fakeRedditPostFetcher{post: post}, makeSocialLLMChain(llmResp), makeSocialEmbeddingChain(), q, nil)
	job := makeSocialJob("reddit_post")
	ctx := context.Background()
	prev := worker.StepResults{}

	for _, stepName := range p.Steps() {
		result, err := p.Execute(ctx, stepName, job, prev)
		if err != nil {
			t.Fatalf("%s step: %v", stepName, err)
		}
		prev[stepName] = result
	}

	var stored redditPostSourceMetadata
	if err := json.Unmarshal(metadata, &stored); err != nil {
		t.Fatalf("unmarshal source metadata: %v", err)
	}
	if stored.Fetcher != "reddit_json_endpoint" || stored.Post.ID != "1abc" {
		t.Fatalf("stored metadata = %+v", stored)
	}
	if len(stored.Post.Comments) != 1 {
		t.Fatalf("stored comments = %d, want 1", len(stored.Post.Comments))
	}
}

func TestSocialStoreRequiresFetchResult(t *testing.T) {
	p := NewXPostProcessor(fakeXPostFetcher{}, nil, nil, nil, nil)
	_, err := p.Execute(context.Background(), "store", makeSocialJob("x_post"), worker.StepResults{})
	if err == nil {
		t.Fatal("expected missing fetch result error")
	}
}
