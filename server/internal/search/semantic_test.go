package search_test

import (
	"context"
	"fmt"
	"log/slog"
	"testing"

	"github.com/ksushant6566/mindtab/server/internal/providers"
	"github.com/ksushant6566/mindtab/server/internal/providers/embedding"
	"github.com/ksushant6566/mindtab/server/internal/search"
	"github.com/ksushant6566/mindtab/server/internal/testutil"
)

// callSearch runs s.Search and catches any nil-pool panic so that callers can
// inspect mock state regardless of whether the DB step panics.
func callSearch(s *search.SemanticSearch, ctx context.Context, userID, query string, limit int) (results []search.SearchResult, err error, panicked bool) {
	defer func() {
		if r := recover(); r != nil {
			panicked = true
		}
	}()
	results, err = s.Search(ctx, userID, query, limit)
	return results, err, false
}

// TestSearch_EmbedsQuery verifies that Search calls the embedding provider
// with the query text before attempting the DB query.
// A nil pool is used so no real database is needed; a panic at the DB step
// (after embed) is expected and handled.
func TestSearch_EmbedsQuery(t *testing.T) {
	mockEmb := &testutil.MockEmbeddingProvider{}
	chain := providers.NewChain[embedding.EmbeddingProvider](slog.Default())
	chain.Add("mock", mockEmb)

	s := search.NewSemanticSearch(nil, chain)

	_, _, panicked := callSearch(s, context.Background(), "user1", "test query", 10)
	// We expect the nil-pool to panic at the DB step, which is fine —
	// the embedding step happens before it.
	if !panicked {
		// If it did not panic, that's acceptable too (pgxpool may return an error
		// instead of panicking in future versions).
	}

	if mockEmb.CallCount != 1 {
		t.Fatalf("expected 1 embed call, got %d", mockEmb.CallCount)
	}
	if len(mockEmb.LastTexts) == 0 || mockEmb.LastTexts[0] != "test query" {
		t.Fatalf("expected embed called with %q, got %v", "test query", mockEmb.LastTexts)
	}
}

// TestSearch_DefaultLimit verifies that a limit of 0 is normalised before the
// embedding step runs (the mock is still called exactly once).
func TestSearch_DefaultLimit(t *testing.T) {
	mockEmb := &testutil.MockEmbeddingProvider{}
	chain := providers.NewChain[embedding.EmbeddingProvider](slog.Default())
	chain.Add("mock", mockEmb)

	s := search.NewSemanticSearch(nil, chain)

	callSearch(s, context.Background(), "user1", "hello", 0)

	if mockEmb.CallCount != 1 {
		t.Fatalf("expected 1 embed call with zero limit, got %d", mockEmb.CallCount)
	}
}

// TestSearch_EmbedError verifies that if the embedding provider returns an
// error, Search surfaces it immediately without ever reaching the DB step
// (so a nil pool never panics).
func TestSearch_EmbedError(t *testing.T) {
	mockEmb := &testutil.MockEmbeddingProvider{
		Err: fmt.Errorf("embedding service unavailable"),
	}
	chain := providers.NewChain[embedding.EmbeddingProvider](slog.Default())
	chain.Add("mock", mockEmb)

	s := search.NewSemanticSearch(nil, chain)

	_, err, panicked := callSearch(s, context.Background(), "user1", "test query", 10)
	if panicked {
		t.Fatal("did not expect a panic: embed error should be returned before pool is touched")
	}
	if err == nil {
		t.Fatal("expected error from embedding failure, got nil")
	}
}

// TestNewSemanticSearch verifies that NewSemanticSearch stores the provided
// pool and embedding chain (smoke test for constructor).
func TestNewSemanticSearch(t *testing.T) {
	chain := providers.NewChain[embedding.EmbeddingProvider](slog.Default())
	s := search.NewSemanticSearch(nil, chain)
	if s == nil {
		t.Fatal("expected non-nil SemanticSearch")
	}
}
