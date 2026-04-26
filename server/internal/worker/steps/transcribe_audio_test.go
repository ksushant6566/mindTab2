package steps

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/ksushant6566/mindtab/server/internal/providers"
	"github.com/ksushant6566/mindtab/server/internal/providers/transcription"
	"github.com/ksushant6566/mindtab/server/internal/store"
	"github.com/ksushant6566/mindtab/server/internal/testutil"
	"github.com/ksushant6566/mindtab/server/internal/worker"
)

// makeTranscriptionAudioChain builds a Chain backed by the given mock provider.
func makeTranscriptionAudioChain(mock *testutil.MockTranscriptionProvider) *providers.Chain[transcription.TranscriptionProvider] {
	chain := providers.NewChain[transcription.TranscriptionProvider](slog.Default())
	chain.Add("mock-transcription", mock)
	return chain
}

func TestTranscribeAudio_HappyPath(t *testing.T) {
	ctx := context.Background()
	contentID := uuid.New()

	queries := &store.QuerierMock{
		GetContentByIDFunc: func(_ context.Context, arg store.GetContentByIDParams) (store.GetContentByIDRow, error) {
			return store.GetContentByIDRow{
				ID:       pgtype.UUID{Bytes: contentID, Valid: true},
				UserID:   "u1",
				MediaKey: pgtype.Text{String: "u1/c1/audio.m4a", Valid: true},
			}, nil
		},
	}

	storage := testutil.NewMockStorage()
	storage.Files["u1/c1/audio.m4a"] = []byte("fake-audio-bytes")

	mock := &testutil.MockTranscriptionProvider{Transcript: "hello world"}
	chain := makeTranscriptionAudioChain(mock)

	job := &worker.Job{ContentID: contentID, UserID: "u1", ContentType: "audio"}

	res, err := TranscribeAudio(ctx, chain, storage, queries, job, nil)
	if err != nil {
		t.Fatalf("TranscribeAudio: unexpected error: %v", err)
	}
	if res == nil {
		t.Fatal("TranscribeAudio: expected non-nil result")
	}

	var out TranscribeAudioResult
	if err := json.Unmarshal(res.Data, &out); err != nil {
		t.Fatalf("unmarshal TranscribeAudioResult: %v", err)
	}
	if out.ExtractedText != "hello world" {
		t.Errorf("extracted_text: got %q, want %q", out.ExtractedText, "hello world")
	}
	if out.TranscriptSource != "whisper" {
		t.Errorf("transcript_source: got %q, want %q", out.TranscriptSource, "whisper")
	}
	if mock.CallCount != 1 {
		t.Errorf("expected 1 transcription call, got %d", mock.CallCount)
	}
}

func TestTranscribeAudio_OversizeRequiresDuration(t *testing.T) {
	ctx := context.Background()
	contentID := uuid.New()

	queries := &store.QuerierMock{
		GetContentByIDFunc: func(_ context.Context, arg store.GetContentByIDParams) (store.GetContentByIDRow, error) {
			return store.GetContentByIDRow{
				ID:       pgtype.UUID{Bytes: contentID, Valid: true},
				UserID:   "u1",
				MediaKey: pgtype.Text{String: "u1/c1/audio.m4a", Valid: true},
				// DurationSeconds intentionally left as zero/invalid — chunking cannot proceed.
			}, nil
		},
	}

	// 30 MB payload — exceeds the 24 MB threshold, so chunking path is taken.
	oversizeData := make([]byte, 30*1024*1024)
	storage := testutil.NewMockStorage()
	storage.Files["u1/c1/audio.m4a"] = oversizeData

	mock := &testutil.MockTranscriptionProvider{Transcript: "should not be called"}
	chain := makeTranscriptionAudioChain(mock)

	job := &worker.Job{ContentID: contentID, UserID: "u1", ContentType: "audio"}

	_, err := TranscribeAudio(ctx, chain, storage, queries, job, nil)
	if err == nil {
		t.Fatal("TranscribeAudio: expected error for oversize file without duration, got nil")
	}
	if !strings.Contains(err.Error(), "cannot chunk without duration_seconds") {
		t.Errorf("error message: expected to contain %q, got %q", "cannot chunk without duration_seconds", err.Error())
	}
	if mock.CallCount != 0 {
		t.Errorf("expected 0 transcription calls for oversize file, got %d", mock.CallCount)
	}
}

func TestTranscribeAudio_NoMediaKey(t *testing.T) {
	ctx := context.Background()
	contentID := uuid.New()

	queries := &store.QuerierMock{
		GetContentByIDFunc: func(_ context.Context, arg store.GetContentByIDParams) (store.GetContentByIDRow, error) {
			return store.GetContentByIDRow{
				ID:       pgtype.UUID{Bytes: contentID, Valid: true},
				UserID:   "u1",
				MediaKey: pgtype.Text{Valid: false},
			}, nil
		},
	}

	storage := testutil.NewMockStorage()
	mock := &testutil.MockTranscriptionProvider{Transcript: "ignored"}
	chain := makeTranscriptionAudioChain(mock)

	job := &worker.Job{ContentID: contentID, UserID: "u1", ContentType: "audio"}

	_, err := TranscribeAudio(ctx, chain, storage, queries, job, nil)
	if err == nil {
		t.Fatal("TranscribeAudio: expected error when no media_key")
	}
	if !strings.Contains(err.Error(), "no media_key") {
		t.Errorf("error message: expected to contain %q, got %q", "no media_key", err.Error())
	}
}

func TestTranscribeAudio_StorageGetFails(t *testing.T) {
	ctx := context.Background()
	contentID := uuid.New()

	queries := &store.QuerierMock{
		GetContentByIDFunc: func(_ context.Context, arg store.GetContentByIDParams) (store.GetContentByIDRow, error) {
			return store.GetContentByIDRow{
				ID:       pgtype.UUID{Bytes: contentID, Valid: true},
				UserID:   "u1",
				MediaKey: pgtype.Text{String: "u1/c1/audio.m4a", Valid: true},
			}, nil
		},
	}

	// Empty storage — key not found.
	storage := testutil.NewMockStorage()
	mock := &testutil.MockTranscriptionProvider{Transcript: "ignored"}
	chain := makeTranscriptionAudioChain(mock)

	job := &worker.Job{ContentID: contentID, UserID: "u1", ContentType: "audio"}

	_, err := TranscribeAudio(ctx, chain, storage, queries, job, nil)
	if err == nil {
		t.Fatal("TranscribeAudio: expected error when storage key missing")
	}
	if !strings.Contains(err.Error(), "storage get") {
		t.Errorf("error message: expected to contain %q, got %q", "storage get", err.Error())
	}
}

func TestTranscribeAudio_ChainError(t *testing.T) {
	ctx := context.Background()
	contentID := uuid.New()

	queries := &store.QuerierMock{
		GetContentByIDFunc: func(_ context.Context, arg store.GetContentByIDParams) (store.GetContentByIDRow, error) {
			return store.GetContentByIDRow{
				ID:       pgtype.UUID{Bytes: contentID, Valid: true},
				UserID:   "u1",
				MediaKey: pgtype.Text{String: "u1/c1/audio.m4a", Valid: true},
			}, nil
		},
	}

	storage := testutil.NewMockStorage()
	storage.Files["u1/c1/audio.m4a"] = []byte("fake-audio-bytes")

	mock := &testutil.MockTranscriptionProvider{
		Err: providers.NewPermanentError("mock-transcription", fmt.Errorf("transcription failed")),
	}
	chain := makeTranscriptionAudioChain(mock)

	job := &worker.Job{ContentID: contentID, UserID: "u1", ContentType: "audio"}

	_, err := TranscribeAudio(ctx, chain, storage, queries, job, nil)
	if err == nil {
		t.Fatal("TranscribeAudio: expected error when chain fails")
	}
	if !strings.Contains(err.Error(), "chain failed") {
		t.Errorf("error message: expected to contain %q, got %q", "chain failed", err.Error())
	}
}
