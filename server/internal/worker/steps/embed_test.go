package steps

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"testing"

	"github.com/ksushant6566/mindtab/server/internal/providers"
	"github.com/ksushant6566/mindtab/server/internal/providers/embedding"
	"github.com/ksushant6566/mindtab/server/internal/testutil"
)

func makeEmbeddingChain(mock *testutil.MockEmbeddingProvider) *providers.Chain[embedding.EmbeddingProvider] {
	chain := providers.NewChain[embedding.EmbeddingProvider](slog.Default())
	chain.Add("mock-embedding", mock)
	return chain
}

func TestEmbed_Success(t *testing.T) {
	wantDims := 1536
	emb := make([]float32, wantDims)
	for i := range emb {
		emb[i] = float32(i) * 0.001
	}

	mock := &testutil.MockEmbeddingProvider{Embedding: emb}
	chain := makeEmbeddingChain(mock)

	result, err := Embed(context.Background(), chain, "Some text to embed.")
	if err != nil {
		t.Fatalf("Embed: unexpected error: %v", err)
	}
	if result == nil {
		t.Fatal("Embed: expected non-nil result")
	}

	var er EmbedResult
	if err := json.Unmarshal(result.Data, &er); err != nil {
		t.Fatalf("unmarshal EmbedResult: %v", err)
	}

	if len(er.Embedding) != wantDims {
		t.Errorf("embedding dimensions: got %d, want %d", len(er.Embedding), wantDims)
	}
	if er.Provider != "mock-embedding" {
		t.Errorf("provider: got %q, want %q", er.Provider, "mock-embedding")
	}
	// Verify embedding values
	for i, v := range er.Embedding {
		want := float32(i) * 0.001
		if v != want {
			t.Errorf("embedding[%d]: got %f, want %f", i, v, want)
			break
		}
	}
}

func TestEmbed_DefaultEmbedding(t *testing.T) {
	// When MockEmbeddingProvider.Embedding is nil, it generates a default 1536-dim vector.
	mock := &testutil.MockEmbeddingProvider{}
	chain := makeEmbeddingChain(mock)

	result, err := Embed(context.Background(), chain, "Text to embed.")
	if err != nil {
		t.Fatalf("Embed: unexpected error: %v", err)
	}

	var er EmbedResult
	if err := json.Unmarshal(result.Data, &er); err != nil {
		t.Fatalf("unmarshal EmbedResult: %v", err)
	}
	if len(er.Embedding) != 1536 {
		t.Errorf("expected 1536-dim embedding, got %d", len(er.Embedding))
	}
}

func TestEmbed_Error(t *testing.T) {
	mock := &testutil.MockEmbeddingProvider{
		Err: providers.NewPermanentError("mock-embedding", errTest("embedding provider failure")),
	}
	chain := makeEmbeddingChain(mock)

	result, err := Embed(context.Background(), chain, "Some text.")
	if err == nil {
		t.Fatal("Embed: expected error when provider fails")
	}
	if result != nil {
		t.Errorf("Embed: expected nil result on error, got %+v", result)
	}
}

func TestEmbed_EmptyText(t *testing.T) {
	mock := &testutil.MockEmbeddingProvider{}
	chain := makeEmbeddingChain(mock)

	_, err := Embed(context.Background(), chain, "")
	if err == nil {
		t.Fatal("Embed: expected error for empty input text")
	}
}

func TestEmbed_CallsProviderWithText(t *testing.T) {
	mock := &testutil.MockEmbeddingProvider{}
	chain := makeEmbeddingChain(mock)

	inputText := "The specific text to embed."
	_, err := Embed(context.Background(), chain, inputText)
	if err != nil {
		t.Fatalf("Embed: unexpected error: %v", err)
	}

	if mock.CallCount != 1 {
		t.Errorf("expected 1 embed call, got %d", mock.CallCount)
	}
	if len(mock.LastTexts) != 1 || mock.LastTexts[0] != inputText {
		t.Errorf("expected provider to be called with %q, got %v", inputText, mock.LastTexts)
	}
}

func TestEmbed_RetriableErrorFallsThrough(t *testing.T) {
	// With only one provider in the chain and a retriable error, all providers
	// should be exhausted and an AllProvidersExhaustedError returned.
	mock := &testutil.MockEmbeddingProvider{
		Err: providers.NewRetriableError("mock-embedding", errTest("temporary failure")),
	}
	chain := makeEmbeddingChain(mock)

	_, err := Embed(context.Background(), chain, "Some text.")
	if err == nil {
		t.Fatal("Embed: expected error when all providers exhausted")
	}
	var exhausted *providers.AllProvidersExhaustedError
	if !errors.As(err, &exhausted) {
		t.Fatalf("expected AllProvidersExhaustedError, got %T: %v", err, err)
	}
}
