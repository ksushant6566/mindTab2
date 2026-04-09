package steps

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/ksushant6566/mindtab/server/internal/services"
	"github.com/ksushant6566/mindtab/server/internal/store"
	"github.com/ksushant6566/mindtab/server/internal/worker"
)

func makeJob(sourceURL string) *worker.Job {
	contentID := uuid.New()
	return &worker.Job{
		ID:          uuid.New(),
		ContentID:   contentID,
		UserID:      "user-test",
		ContentType: "article",
		SourceURL:   sourceURL,
	}
}

func TestExtract_JinaSuccess(t *testing.T) {
	wantText := "# Article\n\nThis is the article content."

	// Serve the primary Jina endpoint successfully.
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(wantText))
	}))
	defer server.Close()

	jina := services.NewJinaReader("test-key")
	jina.SetBaseURL(server.URL)

	mockQ := &store.QuerierMock{
		GetContentByIDFunc: func(ctx context.Context, arg store.GetContentByIDParams) (store.GetContentByIDRow, error) {
			// Return a row with no pre-extracted content.
			return store.GetContentByIDRow{
				ExtractedText: pgtype.Text{Valid: false},
			}, nil
		},
	}

	job := makeJob("https://example.com/article")
	result, err := Extract(context.Background(), jina, mockQ, job)
	if err != nil {
		t.Fatalf("Extract: unexpected error: %v", err)
	}
	if result == nil {
		t.Fatal("Extract: expected non-nil result")
	}

	var er ExtractResult
	if err := json.Unmarshal(result.Data, &er); err != nil {
		t.Fatalf("unmarshal ExtractResult: %v", err)
	}
	if er.Text != wantText {
		t.Errorf("text mismatch: got %q, want %q", er.Text, wantText)
	}
}

func TestExtract_PreExtractedContent(t *testing.T) {
	preText := "Pre-extracted article text from the share extension."
	preTitle := "My Saved Article"

	// Jina server should never be called.
	jinaCallCount := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		jinaCallCount++
		t.Error("Jina should not be called when pre-extracted content is present")
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("jina content"))
	}))
	defer server.Close()

	jina := services.NewJinaReader("test-key")
	jina.SetBaseURL(server.URL)

	mockQ := &store.QuerierMock{
		GetContentByIDFunc: func(ctx context.Context, arg store.GetContentByIDParams) (store.GetContentByIDRow, error) {
			return store.GetContentByIDRow{
				ExtractedText: pgtype.Text{String: preText, Valid: true},
				SourceTitle:   pgtype.Text{String: preTitle, Valid: true},
			}, nil
		},
	}

	job := makeJob("https://example.com/article")
	result, err := Extract(context.Background(), jina, mockQ, job)
	if err != nil {
		t.Fatalf("Extract: unexpected error: %v", err)
	}
	if result == nil {
		t.Fatal("Extract: expected non-nil result")
	}

	var er ExtractResult
	if err := json.Unmarshal(result.Data, &er); err != nil {
		t.Fatalf("unmarshal ExtractResult: %v", err)
	}
	if er.Text != preText {
		t.Errorf("text mismatch: got %q, want %q", er.Text, preText)
	}
	if er.Title != preTitle {
		t.Errorf("title mismatch: got %q, want %q", er.Title, preTitle)
	}
	if jinaCallCount != 0 {
		t.Errorf("Jina was called %d times, expected 0", jinaCallCount)
	}
}

func TestExtract_JinaFailure(t *testing.T) {
	// Both primary and fallback endpoints return 500 so both Jina calls fail.
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
		w.Write([]byte("internal error"))
	}))
	defer server.Close()

	jina := services.NewJinaReader("test-key")
	jina.SetBaseURL(server.URL)

	mockQ := &store.QuerierMock{
		GetContentByIDFunc: func(ctx context.Context, arg store.GetContentByIDParams) (store.GetContentByIDRow, error) {
			// Return an error so Extract falls through to Jina.
			return store.GetContentByIDRow{}, fmt.Errorf("db error")
		},
	}

	job := makeJob(server.URL + "/article")
	result, err := Extract(context.Background(), jina, mockQ, job)
	if err == nil {
		t.Fatal("Extract: expected error but got nil")
	}
	if result != nil {
		t.Errorf("Extract: expected nil result on error, got %+v", result)
	}
}

func TestExtract_NoSourceURL(t *testing.T) {
	jina := services.NewJinaReader("test-key")

	mockQ := &store.QuerierMock{}

	job := makeJob("")
	_, err := Extract(context.Background(), jina, mockQ, job)
	if err == nil {
		t.Fatal("Extract: expected error for empty source URL")
	}
}
