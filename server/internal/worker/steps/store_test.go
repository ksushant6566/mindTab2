package steps

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/ksushant6566/mindtab/server/internal/store"
	"github.com/ksushant6566/mindtab/server/internal/worker"
)

func makeStoreJob() *worker.Job {
	return &worker.Job{
		ID:          uuid.New(),
		ContentID:   uuid.New(),
		UserID:      "user-test",
		ContentType: "article",
		SourceURL:   "https://example.com/article",
	}
}

func mustMarshal(t *testing.T, v any) []byte {
	t.Helper()
	b, err := json.Marshal(v)
	if err != nil {
		t.Fatalf("json.Marshal: %v", err)
	}
	return b
}

func makePrevResults(t *testing.T) worker.StepResults {
	t.Helper()

	summarize := SummarizeResult{
		Title:     "Test Article Title",
		Summary:   "A concise summary of the test article.",
		Tags:      []string{"go", "testing"},
		KeyTopics: []string{"unit tests", "mocks"},
		Provider:  "mock-llm",
	}

	embed := EmbedResult{
		Embedding: []float32{0.1, 0.2, 0.3},
		Provider:  "mock-embedding",
		Model:     "text-embedding-3-small",
	}

	return worker.StepResults{
		"summarize": {Data: mustMarshal(t, summarize)},
		"embed":     {Data: mustMarshal(t, embed)},
	}
}

func TestStore_ContentNotDeleted(t *testing.T) {
	job := makeStoreJob()
	prevResults := makePrevResults(t)

	var updateResultsCalled bool
	var updateEmbeddingCalled bool

	mockQ := &store.QuerierMock{
		IsContentDeletedFunc: func(ctx context.Context, id pgtype.UUID) (bool, error) {
			return false, nil
		},
		UpdateContentResultsFunc: func(ctx context.Context, arg store.UpdateContentResultsParams) error {
			updateResultsCalled = true

			// Summary should be set from the summarize step result.
			if !arg.Summary.Valid || arg.Summary.String != "A concise summary of the test article." {
				t.Errorf("Summary: got %q (valid=%v), want %q", arg.Summary.String, arg.Summary.Valid, "A concise summary of the test article.")
			}
			// Title should come from summarize when extract and metadata are absent.
			if !arg.SourceTitle.Valid || arg.SourceTitle.String != "Test Article Title" {
				t.Errorf("SourceTitle: got %q (valid=%v), want %q", arg.SourceTitle.String, arg.SourceTitle.Valid, "Test Article Title")
			}
			// Provider fields.
			if !arg.SummaryProvider.Valid || arg.SummaryProvider.String != "mock-llm" {
				t.Errorf("SummaryProvider: got %q", arg.SummaryProvider.String)
			}
			if !arg.EmbeddingProvider.Valid || arg.EmbeddingProvider.String != "mock-embedding" {
				t.Errorf("EmbeddingProvider: got %q", arg.EmbeddingProvider.String)
			}
			if !arg.EmbeddingModel.Valid || arg.EmbeddingModel.String != "text-embedding-3-small" {
				t.Errorf("EmbeddingModel: got %q", arg.EmbeddingModel.String)
			}
			// Content ID must match the job.
			if arg.ID.Bytes != job.ContentID {
				t.Errorf("content ID mismatch")
			}
			return nil
		},
		UpdateContentEmbeddingFunc: func(ctx context.Context, arg store.UpdateContentEmbeddingParams) error {
			updateEmbeddingCalled = true
			if arg.ID.Bytes != job.ContentID {
				t.Errorf("embedding content ID mismatch")
			}
			return nil
		},
	}

	result, err := Store(context.Background(), mockQ, job, prevResults)
	if err != nil {
		t.Fatalf("Store: unexpected error: %v", err)
	}
	// Store returns nil result on success.
	if result != nil {
		t.Errorf("Store: expected nil result, got %+v", result)
	}

	if !updateResultsCalled {
		t.Error("Store: UpdateContentResults was not called")
	}
	if !updateEmbeddingCalled {
		t.Error("Store: UpdateContentEmbedding was not called (embedding was present)")
	}
}

func TestStore_ContentSoftDeleted(t *testing.T) {
	job := makeStoreJob()
	prevResults := makePrevResults(t)

	updateResultsCalled := false
	updateEmbeddingCalled := false

	mockQ := &store.QuerierMock{
		IsContentDeletedFunc: func(ctx context.Context, id pgtype.UUID) (bool, error) {
			return true, nil
		},
		UpdateContentResultsFunc: func(ctx context.Context, arg store.UpdateContentResultsParams) error {
			updateResultsCalled = true
			return nil
		},
		UpdateContentEmbeddingFunc: func(ctx context.Context, arg store.UpdateContentEmbeddingParams) error {
			updateEmbeddingCalled = true
			return nil
		},
	}

	result, err := Store(context.Background(), mockQ, job, prevResults)
	if err != nil {
		t.Fatalf("Store: unexpected error for soft-deleted content: %v", err)
	}
	// When content is deleted Store returns nil, nil — job is effectively cancelled.
	if result != nil {
		t.Errorf("Store: expected nil result for deleted content, got %+v", result)
	}

	if updateResultsCalled {
		t.Error("Store: UpdateContentResults must NOT be called when content is soft-deleted")
	}
	if updateEmbeddingCalled {
		t.Error("Store: UpdateContentEmbedding must NOT be called when content is soft-deleted")
	}
}

func TestStore_MissingStepResults(t *testing.T) {
	// Missing summarize/embed results should not cause a panic or error;
	// Store handles absent step results gracefully via zero-value fallbacks.
	job := makeStoreJob()
	emptyResults := worker.StepResults{}

	var updateResultsCalled bool

	mockQ := &store.QuerierMock{
		IsContentDeletedFunc: func(ctx context.Context, id pgtype.UUID) (bool, error) {
			return false, nil
		},
		UpdateContentResultsFunc: func(ctx context.Context, arg store.UpdateContentResultsParams) error {
			updateResultsCalled = true
			// With no step results all text fields should be empty (invalid pgtype.Text).
			if arg.Summary.Valid {
				t.Errorf("Summary should be empty when summarize result is absent, got %q", arg.Summary.String)
			}
			if arg.SourceTitle.Valid {
				t.Errorf("SourceTitle should be empty when all title sources are absent, got %q", arg.SourceTitle.String)
			}
			return nil
		},
		// UpdateContentEmbeddingFunc is intentionally NOT set.
		// With no embed result (empty embedding slice) it should not be called.
	}

	result, err := Store(context.Background(), mockQ, job, emptyResults)
	if err != nil {
		t.Fatalf("Store: unexpected error with missing step results: %v", err)
	}
	if result != nil {
		t.Errorf("Store: expected nil result, got %+v", result)
	}
	if !updateResultsCalled {
		t.Error("Store: UpdateContentResults should still be called even with missing step results")
	}
}

func TestStore_IsContentDeletedError(t *testing.T) {
	job := makeStoreJob()
	prevResults := worker.StepResults{}

	mockQ := &store.QuerierMock{
		IsContentDeletedFunc: func(ctx context.Context, id pgtype.UUID) (bool, error) {
			return false, errTest("db connection failed")
		},
	}

	_, err := Store(context.Background(), mockQ, job, prevResults)
	if err == nil {
		t.Fatal("Store: expected error when IsContentDeleted fails")
	}
}

func TestStore_UpdateContentResultsError(t *testing.T) {
	job := makeStoreJob()
	prevResults := worker.StepResults{}

	mockQ := &store.QuerierMock{
		IsContentDeletedFunc: func(ctx context.Context, id pgtype.UUID) (bool, error) {
			return false, nil
		},
		UpdateContentResultsFunc: func(ctx context.Context, arg store.UpdateContentResultsParams) error {
			return errTest("db write failed")
		},
	}

	_, err := Store(context.Background(), mockQ, job, prevResults)
	if err == nil {
		t.Fatal("Store: expected error when UpdateContentResults fails")
	}
}

func TestStore_ExtractedTextFallbackOrder(t *testing.T) {
	// Verify the fallback order: extract.Text > transcribe.Transcript > vision.ExtractedText
	job := makeStoreJob()

	vision := VisionResult{
		ExtractedText:     "OCR text from image",
		VisualDescription: "A photo",
	}
	embed := EmbedResult{Provider: "mock", Embedding: []float32{}}

	prevResults := worker.StepResults{
		"vision": {Data: mustMarshal(t, vision)},
		"embed":  {Data: mustMarshal(t, embed)},
	}

	var gotExtractedText string

	mockQ := &store.QuerierMock{
		IsContentDeletedFunc: func(ctx context.Context, id pgtype.UUID) (bool, error) {
			return false, nil
		},
		UpdateContentResultsFunc: func(ctx context.Context, arg store.UpdateContentResultsParams) error {
			gotExtractedText = arg.ExtractedText.String
			return nil
		},
	}

	_, err := Store(context.Background(), mockQ, job, prevResults)
	if err != nil {
		t.Fatalf("Store: unexpected error: %v", err)
	}

	if gotExtractedText != "OCR text from image" {
		t.Errorf("extracted_text fallback: got %q, want %q", gotExtractedText, "OCR text from image")
	}
}

func TestStore_InstagramReelVideoFields(t *testing.T) {
	job := makeStoreJob()
	job.ContentType = "instagram_reel"
	job.SourceURL = "https://www.instagram.com/reel/C123abc/"

	prevResults := worker.StepResults{
		"evidence": {Data: mustMarshal(t, VideoEvidence{
			Metadata: ResolvedVideo{
				LocalPath:       "/tmp/video.mp4",
				SourceType:      "instagram_reel",
				Title:           "Interesting Reel",
				DurationSeconds: 37,
				ThumbnailURL:    "https://cdn.example/thumb.jpg",
				Creator:         "creator",
			},
			Transcript:       "Transcript text",
			TranscriptSource: "whisper",
			SelectedFrames: SelectedFramesSummary{
				FrameCount:       2,
				Policy:           "uniform_timeline_v1",
				DurationSeconds:  37,
				TimestampSeconds: []float64{0, 37},
			},
			VisualTimeline: "A short video with captions.",
		})},
		"summarize": {Data: mustMarshal(t, SummarizeResult{
			Summary:   "Short summary",
			Tags:      []string{"instagram"},
			KeyTopics: []string{"reels"},
		})},
	}

	var videoFieldsCalled bool
	mockQ := &store.QuerierMock{
		IsContentDeletedFunc: func(ctx context.Context, id pgtype.UUID) (bool, error) {
			return false, nil
		},
		UpdateContentResultsFunc: func(ctx context.Context, arg store.UpdateContentResultsParams) error {
			if arg.SourceTitle.String != "Interesting Reel" {
				t.Errorf("SourceTitle = %q, want Interesting Reel", arg.SourceTitle.String)
			}
			if arg.ExtractedText.String != "Transcript text" {
				t.Errorf("ExtractedText = %q, want Transcript text", arg.ExtractedText.String)
			}
			if arg.VisualDescription.String != "A short video with captions." {
				t.Errorf("VisualDescription = %q, want frame description", arg.VisualDescription.String)
			}
			return nil
		},
		UpdateContentYoutubeFieldsFunc: func(ctx context.Context, arg store.UpdateContentYoutubeFieldsParams) error {
			videoFieldsCalled = true
			if arg.DurationSeconds.Int32 != 37 {
				t.Errorf("DurationSeconds = %d, want 37", arg.DurationSeconds.Int32)
			}
			if arg.VideoThumbnailUrl.String != "https://cdn.example/thumb.jpg" {
				t.Errorf("VideoThumbnailUrl = %q, want thumbnail", arg.VideoThumbnailUrl.String)
			}
			if arg.VideoChannel.String != "creator" {
				t.Errorf("VideoChannel = %q, want creator", arg.VideoChannel.String)
			}
			if arg.TranscriptSource.String != "whisper" {
				t.Errorf("TranscriptSource = %q, want whisper", arg.TranscriptSource.String)
			}
			return nil
		},
	}

	if _, err := Store(context.Background(), mockQ, job, prevResults); err != nil {
		t.Fatalf("Store: %v", err)
	}
	if !videoFieldsCalled {
		t.Error("expected video fields update for instagram reel metadata")
	}
}
