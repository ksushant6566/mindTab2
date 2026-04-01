package testutil

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"sync"

	"github.com/ksushant6566/mindtab/server/internal/providers/llm"
	"github.com/ksushant6566/mindtab/server/internal/providers/transcription"
	"github.com/ksushant6566/mindtab/server/internal/queue"
	"github.com/ksushant6566/mindtab/server/internal/search"
)

// --- LLM Provider Mock ---

type MockLLMProvider struct {
	Response string
	Err      error
	Calls    []llm.LLMRequest
	mu       sync.Mutex
}

func (m *MockLLMProvider) Complete(ctx context.Context, req llm.LLMRequest) (*llm.LLMResponse, error) {
	m.mu.Lock()
	m.Calls = append(m.Calls, req)
	m.mu.Unlock()
	if m.Err != nil {
		return nil, m.Err
	}
	return &llm.LLMResponse{Text: m.Response, Provider: "mock-llm"}, nil
}

func (m *MockLLMProvider) StreamComplete(ctx context.Context, req llm.LLMRequest, tools []llm.ToolDefinition, callback llm.StreamCallback) error {
	return fmt.Errorf("StreamComplete not implemented in mock")
}

func (m *MockLLMProvider) Name() string { return "mock-llm" }

// --- Embedding Provider Mock ---

type MockEmbeddingProvider struct {
	Embedding []float32
	Err       error
	CallCount int
	LastTexts []string
	mu        sync.Mutex
}

func (m *MockEmbeddingProvider) Embed(ctx context.Context, texts []string) ([][]float32, error) {
	m.mu.Lock()
	m.CallCount++
	m.LastTexts = texts
	m.mu.Unlock()
	if m.Err != nil {
		return nil, m.Err
	}
	emb := m.Embedding
	if emb == nil {
		emb = make([]float32, 1536)
		for i := range emb {
			emb[i] = 0.01 * float32(i)
		}
	}
	results := make([][]float32, len(texts))
	for i := range texts {
		results[i] = emb
	}
	return results, nil
}

func (m *MockEmbeddingProvider) Dimensions() int { return 1536 }
func (m *MockEmbeddingProvider) Name() string    { return "mock-embedding" }

// --- Transcription Provider Mock ---

type MockTranscriptionProvider struct {
	Transcript string
	Err        error
	CallCount  int
}

func (m *MockTranscriptionProvider) Transcribe(ctx context.Context, audioPath string) (*transcription.TranscriptionResult, error) {
	m.CallCount++
	if m.Err != nil {
		return nil, m.Err
	}
	return &transcription.TranscriptionResult{Text: m.Transcript}, nil
}

func (m *MockTranscriptionProvider) Name() string { return "mock-transcription" }

// --- Storage Provider Mock ---

type MockStorageProvider struct {
	Files map[string][]byte
	mu    sync.Mutex
}

func NewMockStorage() *MockStorageProvider {
	return &MockStorageProvider{Files: make(map[string][]byte)}
}

func (m *MockStorageProvider) Save(ctx context.Context, key string, data io.Reader, contentType string) error {
	b, err := io.ReadAll(data)
	if err != nil {
		return err
	}
	m.mu.Lock()
	m.Files[key] = b
	m.mu.Unlock()
	return nil
}

func (m *MockStorageProvider) Get(ctx context.Context, key string) (io.ReadCloser, error) {
	m.mu.Lock()
	data, ok := m.Files[key]
	m.mu.Unlock()
	if !ok {
		return nil, fmt.Errorf("key not found: %s", key)
	}
	return io.NopCloser(bytes.NewReader(data)), nil
}

func (m *MockStorageProvider) Delete(ctx context.Context, key string) error {
	m.mu.Lock()
	delete(m.Files, key)
	m.mu.Unlock()
	return nil
}

func (m *MockStorageProvider) URL(key string) string {
	return "/media/" + key
}

// --- Producer Mock ---

type MockProducer struct {
	Enqueued []queue.JobPayload
	Err      error
	mu       sync.Mutex
}

func (m *MockProducer) Enqueue(ctx context.Context, payload queue.JobPayload) error {
	if m.Err != nil {
		return m.Err
	}
	m.mu.Lock()
	m.Enqueued = append(m.Enqueued, payload)
	m.mu.Unlock()
	return nil
}

// --- Semantic Search Mock ---

type MockSemanticSearch struct {
	Results []search.SearchResult
	Err     error
}

func (m *MockSemanticSearch) Search(ctx context.Context, userID string, query string, limit int) ([]search.SearchResult, error) {
	if m.Err != nil {
		return nil, m.Err
	}
	return m.Results, nil
}
