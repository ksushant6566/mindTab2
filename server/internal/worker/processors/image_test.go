package processors

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"reflect"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/ksushant6566/mindtab/server/internal/providers"
	"github.com/ksushant6566/mindtab/server/internal/providers/embedding"
	"github.com/ksushant6566/mindtab/server/internal/providers/llm"
	"github.com/ksushant6566/mindtab/server/internal/store"
	"github.com/ksushant6566/mindtab/server/internal/testutil"
	"github.com/ksushant6566/mindtab/server/internal/worker"
	"github.com/ksushant6566/mindtab/server/internal/worker/steps"
)

func makeImageLLMChain(mock *testutil.MockLLMProvider) *providers.Chain[llm.LLMProvider] {
	chain := providers.NewChain[llm.LLMProvider](slog.Default())
	chain.Add("mock-llm", mock)
	return chain
}

func makeImageEmbeddingChain(mock *testutil.MockEmbeddingProvider) *providers.Chain[embedding.EmbeddingProvider] {
	chain := providers.NewChain[embedding.EmbeddingProvider](slog.Default())
	chain.Add("mock-embedding", mock)
	return chain
}

func makeImageJob() *worker.Job {
	return &worker.Job{
		ID:          uuid.New(),
		ContentID:   uuid.New(),
		UserID:      "user-image-test",
		ContentType: "image",
	}
}

// TestImage_ContentType verifies that ContentType returns "image".
func TestImage_ContentType(t *testing.T) {
	p := NewImageProcessor(nil, nil, nil, nil, nil)
	if p.ContentType() != "image" {
		t.Errorf("ContentType() = %q, want %q", p.ContentType(), "image")
	}
}

// TestImage_StepOrder verifies that Steps returns the expected ordered slice.
func TestImage_StepOrder(t *testing.T) {
	p := NewImageProcessor(nil, nil, nil, nil, nil)
	want := []string{"vision", "summarize", "embed", "store"}
	got := p.Steps()
	if !reflect.DeepEqual(got, want) {
		t.Errorf("Steps() = %v, want %v", got, want)
	}
}

// TestImage_LockTTL verifies that LockTTL returns 5 minutes.
func TestImage_LockTTL(t *testing.T) {
	p := NewImageProcessor(nil, nil, nil, nil, nil)
	want := 5 * time.Minute
	if p.LockTTL() != want {
		t.Errorf("LockTTL() = %v, want %v", p.LockTTL(), want)
	}
}

// TestImage_HappyPath runs the full image pipeline using mock dependencies.
// It exercises vision, summarize, embed, and store steps in sequence.
// The image bytes are pre-seeded into MockStorage keyed by {user}/{content_id}/image.png.
func TestImage_HappyPath(t *testing.T) {
	// Minimal 1x1 PNG bytes — not a valid PNG but sufficient for unit testing
	// since the mocked LLM won't decode the image bytes.
	fakeImageData := []byte{0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a}
	mimeType := "image/png"

	job := makeImageJob()
	mediaKey := fmt.Sprintf("%s/%s/image.png", job.UserID, job.ContentID.String())

	storage := testutil.NewMockStorage()
	// Pre-seed storage so the vision step can fetch the image.
	storage.Files[mediaKey] = fakeImageData

	// LLM returns a valid vision payload then a valid summarize payload.
	visionResp := `{"extracted_text":"Hello world","visual_description":"A simple test image."}`
	summarizeResp := `{"title":"Test Image","summary":"A simple test image with text.","tags":["test","image"],"key_topics":["image","text"]}`

	callCount := 0
	responses := []string{visionResp, summarizeResp}
	var calls []llm.LLMRequest
	customLLM := &mockSequentialLLM{responses: responses, calls: &calls, count: &callCount}
	llmChain := providers.NewChain[llm.LLMProvider](slog.Default())
	llmChain.Add("mock-llm", customLLM)

	embMock := &testutil.MockEmbeddingProvider{}
	embChain := makeImageEmbeddingChain(embMock)

	contentID := pgtype.UUID{Bytes: job.ContentID, Valid: true}
	mockQ := &store.QuerierMock{
		GetContentByIDFunc: func(ctx context.Context, arg store.GetContentByIDParams) (store.GetContentByIDRow, error) {
			return store.GetContentByIDRow{
				ID:               contentID,
				UserID:           job.UserID,
				SourceType:       "image",
				MediaKey:         pgtype.Text{String: mediaKey, Valid: true},
				ProcessingStatus: "processing",
			}, nil
		},
		UpdateContentStatusFunc: func(ctx context.Context, arg store.UpdateContentStatusParams) error {
			return nil
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

	p := NewImageProcessor(storage, llmChain, embChain, mockQ, nil)
	ctx := context.Background()
	prevResults := worker.StepResults{}

	// Step 1: vision — fetches image from storage, calls LLM.
	visionResult, err := p.Execute(ctx, "vision", job, prevResults)
	if err != nil {
		t.Fatalf("vision step: %v", err)
	}
	if visionResult == nil {
		t.Fatal("vision step: expected non-nil result")
	}
	var vr steps.VisionResult
	if err := json.Unmarshal(visionResult.Data, &vr); err != nil {
		t.Fatalf("unmarshal vision result: %v", err)
	}
	if vr.VisualDescription == "" {
		t.Error("vision step: expected non-empty visual_description")
	}
	// Verify the LLM call received the correct image data and MIME type.
	if len(calls) != 1 {
		t.Fatalf("expected 1 LLM call after vision, got %d", len(calls))
	}
	if len(calls[0].Images) != 1 {
		t.Errorf("expected 1 image in LLM request, got %d", len(calls[0].Images))
	}
	if calls[0].Images[0].MediaType != mimeType {
		t.Errorf("LLM image media type = %q, want %q", calls[0].Images[0].MediaType, mimeType)
	}
	prevResults["vision"] = visionResult

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

	// Step 4: store.
	storeResult, err := p.Execute(ctx, "store", job, prevResults)
	if err != nil {
		t.Fatalf("store step: %v", err)
	}
	if storeResult != nil {
		t.Errorf("store step: expected nil result, got %+v", storeResult)
	}
}

// mockSequentialLLM returns successive responses from a slice on each Complete call.
type mockSequentialLLM struct {
	responses []string
	calls     *[]llm.LLMRequest
	count     *int
}

func (m *mockSequentialLLM) Complete(ctx context.Context, req llm.LLMRequest) (*llm.LLMResponse, error) {
	*m.calls = append(*m.calls, req)
	idx := *m.count
	if idx >= len(m.responses) {
		idx = len(m.responses) - 1
	}
	resp := m.responses[idx]
	*m.count++
	return &llm.LLMResponse{Text: resp, Provider: "mock-llm"}, nil
}

func (m *mockSequentialLLM) StreamComplete(ctx context.Context, req llm.LLMRequest, tools []llm.ToolDefinition, callback llm.StreamCallback) error {
	return nil
}

func (m *mockSequentialLLM) Name() string { return "mock-llm" }
