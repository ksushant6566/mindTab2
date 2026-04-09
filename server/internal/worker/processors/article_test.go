package processors

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"reflect"
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
	"github.com/ksushant6566/mindtab/server/internal/worker/steps"
)

// articleTestHelpers builds the chains needed for article processor tests.

func makeArticleLLMChain(mock *testutil.MockLLMProvider) *providers.Chain[llm.LLMProvider] {
	chain := providers.NewChain[llm.LLMProvider](slog.Default())
	chain.Add("mock-llm", mock)
	return chain
}

func makeArticleEmbeddingChain(mock *testutil.MockEmbeddingProvider) *providers.Chain[embedding.EmbeddingProvider] {
	chain := providers.NewChain[embedding.EmbeddingProvider](slog.Default())
	chain.Add("mock-embedding", mock)
	return chain
}

func makeArticleJob(sourceURL string) *worker.Job {
	return &worker.Job{
		ID:          uuid.New(),
		ContentID:   uuid.New(),
		UserID:      "user-article-test",
		ContentType: "article",
		SourceURL:   sourceURL,
	}
}

// TestArticle_ContentType verifies that ContentType returns "article".
func TestArticle_ContentType(t *testing.T) {
	p := NewArticleProcessor(nil, nil, nil, nil, nil)
	if p.ContentType() != "article" {
		t.Errorf("ContentType() = %q, want %q", p.ContentType(), "article")
	}
}

// TestArticle_StepOrder verifies that Steps returns the expected ordered slice.
func TestArticle_StepOrder(t *testing.T) {
	p := NewArticleProcessor(nil, nil, nil, nil, nil)
	want := []string{"extract", "summarize", "embed", "store"}
	got := p.Steps()
	if !reflect.DeepEqual(got, want) {
		t.Errorf("Steps() = %v, want %v", got, want)
	}
}

// TestArticle_LockTTL verifies that LockTTL returns 5 minutes.
func TestArticle_LockTTL(t *testing.T) {
	p := NewArticleProcessor(nil, nil, nil, nil, nil)
	want := 5 * time.Minute
	if p.LockTTL() != want {
		t.Errorf("LockTTL() = %v, want %v", p.LockTTL(), want)
	}
}

// TestArticle_HappyPath executes all four steps in sequence using mocked
// dependencies and verifies the pipeline produces a non-nil embed result.
func TestArticle_HappyPath(t *testing.T) {
	articleText := "This is a detailed article about Go concurrency patterns."

	// Jina server returns the article text.
	jinaServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(articleText))
	}))
	defer jinaServer.Close()

	jina := services.NewJinaReader("test-key")
	jina.SetBaseURL(jinaServer.URL)

	// LLM returns a valid summarize payload.
	llmResp := `{"title":"Go Concurrency","summary":"An article about concurrency in Go.","tags":["go","concurrency"],"key_topics":["goroutines","channels"]}`
	llmMock := &testutil.MockLLMProvider{Response: llmResp}
	llmChain := makeArticleLLMChain(llmMock)

	// Embedding mock returns a default 1536-dim vector.
	embMock := &testutil.MockEmbeddingProvider{}
	embChain := makeArticleEmbeddingChain(embMock)

	// Queries mock: GetContentByID returns no pre-extracted content so Jina is used.
	mockQ := &store.QuerierMock{
		GetContentByIDFunc: func(ctx context.Context, arg store.GetContentByIDParams) (store.GetContentByIDRow, error) {
			return store.GetContentByIDRow{ExtractedText: pgtype.Text{Valid: false}}, nil
		},
		IsContentDeletedFunc: func(ctx context.Context, id pgtype.UUID) (bool, error) {
			return false, nil
		},
		UpdateContentResultsFunc: func(ctx context.Context, arg store.UpdateContentResultsParams) error {
			return nil
		},
		UpdateContentEmbeddingFunc: func(ctx context.Context, arg store.UpdateContentEmbeddingParams) error {
			return nil
		},
	}

	p := NewArticleProcessor(jina, llmChain, embChain, mockQ, nil)
	job := makeArticleJob("https://example.com/go-concurrency")
	ctx := context.Background()

	prevResults := worker.StepResults{}

	// Step 1: extract.
	extractResult, err := p.Execute(ctx, "extract", job, prevResults)
	if err != nil {
		t.Fatalf("extract step: %v", err)
	}
	if extractResult == nil {
		t.Fatal("extract step: expected non-nil result")
	}
	var er steps.ExtractResult
	if err := json.Unmarshal(extractResult.Data, &er); err != nil {
		t.Fatalf("unmarshal extract result: %v", err)
	}
	if er.Text != articleText {
		t.Errorf("extract text = %q, want %q", er.Text, articleText)
	}
	prevResults["extract"] = extractResult

	// Step 2: summarize.
	summarizeResult, err := p.Execute(ctx, "summarize", job, prevResults)
	if err != nil {
		t.Fatalf("summarize step: %v", err)
	}
	if summarizeResult == nil {
		t.Fatal("summarize step: expected non-nil result")
	}
	var sr steps.SummarizeResult
	if err := json.Unmarshal(summarizeResult.Data, &sr); err != nil {
		t.Fatalf("unmarshal summarize result: %v", err)
	}
	if sr.Summary == "" {
		t.Error("summarize step: expected non-empty summary")
	}
	prevResults["summarize"] = summarizeResult

	// Step 3: embed.
	embedResult, err := p.Execute(ctx, "embed", job, prevResults)
	if err != nil {
		t.Fatalf("embed step: %v", err)
	}
	if embedResult == nil {
		t.Fatal("embed step: expected non-nil result")
	}
	var embR steps.EmbedResult
	if err := json.Unmarshal(embedResult.Data, &embR); err != nil {
		t.Fatalf("unmarshal embed result: %v", err)
	}
	if len(embR.Embedding) != 1536 {
		t.Errorf("embed dims = %d, want 1536", len(embR.Embedding))
	}
	prevResults["embed"] = embedResult

	// Step 4: store (returns nil, nil when not deleted).
	storeResult, err := p.Execute(ctx, "store", job, prevResults)
	if err != nil {
		t.Fatalf("store step: %v", err)
	}
	if storeResult != nil {
		t.Errorf("store step: expected nil result, got %+v", storeResult)
	}
}

// TestArticle_ExtractFails verifies that when Jina returns an error the
// extract step propagates the error and returns a nil result.
func TestArticle_ExtractFails(t *testing.T) {
	// Both Jina endpoints return 500.
	jinaServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
		w.Write([]byte("jina error"))
	}))
	defer jinaServer.Close()

	jina := services.NewJinaReader("test-key")
	jina.SetBaseURL(jinaServer.URL)

	// Queries mock: GetContentByID returns an error so Jina is used.
	mockQ := &store.QuerierMock{
		GetContentByIDFunc: func(ctx context.Context, arg store.GetContentByIDParams) (store.GetContentByIDRow, error) {
			return store.GetContentByIDRow{}, context.DeadlineExceeded
		},
	}

	p := NewArticleProcessor(jina, nil, nil, mockQ, nil)
	job := makeArticleJob(jinaServer.URL + "/article")

	result, err := p.Execute(context.Background(), "extract", job, worker.StepResults{})
	if err == nil {
		t.Fatal("extract step: expected error, got nil")
	}
	if result != nil {
		t.Errorf("extract step: expected nil result on error, got %+v", result)
	}
}
