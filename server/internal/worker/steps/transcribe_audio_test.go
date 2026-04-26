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
	"github.com/ksushant6566/mindtab/server/internal/services"
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

// ---------------------------------------------------------------------------
// pickSplitPoints unit tests
// ---------------------------------------------------------------------------

func TestPickSplitPoints_RespectsSilenceWithinTolerance(t *testing.T) {
	// 3000s file, target=1200s, tolerance=120s.
	// Silences at ~1200s and ~2401s — both within ±120s of the ideal cursor
	// positions (1200s and 2400s).
	silences := []services.SilenceMarker{
		{StartSec: 1195, EndSec: 1205}, // midpoint 1200 — exactly at cursor 1200
		{StartSec: 2395, EndSec: 2407}, // midpoint 2401 — within 120s of cursor 2400
	}
	segs := pickSplitPoints(3000, 1200, 120, silences)
	if len(segs) != 3 {
		t.Fatalf("expected 3 segments, got %d: %v", len(segs), segs)
	}
	// Segment 0 ends at silence midpoint 1200.
	if segs[0][0] != 0 {
		t.Errorf("seg[0] start: got %v, want 0", segs[0][0])
	}
	if segs[0][1] != 1200 {
		t.Errorf("seg[0] end: got %v, want 1200", segs[0][1])
	}
	// Segment 1 ends at silence midpoint 2401.
	if segs[1][0] != 1200 {
		t.Errorf("seg[1] start: got %v, want 1200", segs[1][0])
	}
	if segs[1][1] != 2401 {
		t.Errorf("seg[1] end: got %v, want 2401", segs[1][1])
	}
	// Segment 2 runs to the end.
	if segs[2][0] != 2401 {
		t.Errorf("seg[2] start: got %v, want 2401", segs[2][0])
	}
	if segs[2][1] != 3000 {
		t.Errorf("seg[2] end: got %v, want 3000", segs[2][1])
	}
}

func TestPickSplitPoints_FallsBackToExactWhenNoSilence(t *testing.T) {
	// 3000s file, target=1200s, no silences — splits must fall exactly on multiples.
	segs := pickSplitPoints(3000, 1200, 120, nil)
	if len(segs) != 3 {
		t.Fatalf("expected 3 segments, got %d: %v", len(segs), segs)
	}
	want := [][2]float64{{0, 1200}, {1200, 2400}, {2400, 3000}}
	for i, w := range want {
		if segs[i] != w {
			t.Errorf("seg[%d]: got %v, want %v", i, segs[i], w)
		}
	}
}

func TestPickSplitPoints_ShortFileSingleChunk(t *testing.T) {
	// 600s file with target 1200s — fits in a single segment.
	segs := pickSplitPoints(600, 1200, 120, nil)
	if len(segs) != 1 {
		t.Fatalf("expected 1 segment, got %d: %v", len(segs), segs)
	}
	if segs[0] != ([2]float64{0, 600}) {
		t.Errorf("seg[0]: got %v, want [0 600]", segs[0])
	}
}
