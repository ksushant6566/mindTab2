package worker_test

import (
	"context"
	"log/slog"
	"os"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/require"

	"github.com/ksushant6566/mindtab/server/internal/store"
	"github.com/ksushant6566/mindtab/server/internal/testutil"
	"github.com/ksushant6566/mindtab/server/internal/worker"
)

func TestDraftCleanup_TickRemovesDraftsAndFiles(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	var deletedCalls atomic.Int32
	var (
		cutoffMu     sync.Mutex
		listedCutoff time.Time
	)

	keys := []store.DeleteExpiredDraftsReturningKeysRow{
		{
			ID:       testutil.PgUUID(uuid.New()),
			MediaKey: pgtype.Text{String: "u/c/audio.m4a", Valid: true},
		},
	}

	q := &store.QuerierMock{
		DeleteExpiredDraftsReturningKeysFunc: func(_ context.Context, cutoff pgtype.Timestamptz) ([]store.DeleteExpiredDraftsReturningKeysRow, error) {
			cutoffMu.Lock()
			listedCutoff = cutoff.Time
			cutoffMu.Unlock()
			deletedCalls.Add(1)
			return keys, nil
		},
	}

	storage := testutil.NewMockStorage()
	storage.Files["u/c/audio.m4a"] = []byte("fake audio data")

	logger := slog.New(slog.NewTextHandler(os.Stdout, nil))

	// Run cleanup with a 50 ms tick and 100 ms expiry window.
	done := make(chan struct{})
	go func() {
		worker.StartDraftCleanup(ctx, q, storage, logger, 50*time.Millisecond, 100*time.Millisecond)
		close(done)
	}()

	require.Eventually(t, func() bool { return deletedCalls.Load() >= 1 }, time.Second, 25*time.Millisecond,
		"expected DeleteExpiredDraftsReturningKeys to be called at least once within 1s")

	cancel()
	// Wait for the goroutine to fully exit so any in-flight storage.Delete
	// has completed before we inspect storage state.
	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("StartDraftCleanup did not exit within 1s of cancel")
	}

	cutoffMu.Lock()
	cutoffSeen := listedCutoff
	cutoffMu.Unlock()
	require.False(t, cutoffSeen.IsZero(), "expected DeleteExpiredDraftsReturningKeys to have been called with a non-zero cutoff")
	require.False(t, storage.FileExists("u/c/audio.m4a"), "expected storage key to have been deleted after cleanup tick")
}

func TestDraftCleanup_StopsOnContextCancel(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())

	var callCount atomic.Int32
	q := &store.QuerierMock{
		DeleteExpiredDraftsReturningKeysFunc: func(_ context.Context, _ pgtype.Timestamptz) ([]store.DeleteExpiredDraftsReturningKeysRow, error) {
			callCount.Add(1)
			return nil, nil
		},
	}

	storage := testutil.NewMockStorage()
	logger := slog.New(slog.NewTextHandler(os.Stdout, nil))

	done := make(chan struct{})
	go func() {
		worker.StartDraftCleanup(ctx, q, storage, logger, 50*time.Millisecond, 100*time.Millisecond)
		close(done)
	}()

	// Let it tick at least once, then cancel.
	require.Eventually(t, func() bool { return callCount.Load() >= 1 }, time.Second, 25*time.Millisecond)
	cancel()

	select {
	case <-done:
		// goroutine exited cleanly
	case <-time.After(500 * time.Millisecond):
		t.Fatal("StartDraftCleanup did not exit after context cancellation")
	}
}
