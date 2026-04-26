package worker_test

import (
	"context"
	"log/slog"
	"os"
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

	var deletedCalls int
	var listedCutoff time.Time

	keys := []store.GetMediaKeysForExpiredDraftsRow{
		{
			ID:       testutil.PgUUID(uuid.New()),
			MediaKey: pgtype.Text{String: "u/c/audio.m4a", Valid: true},
		},
	}

	q := &store.QuerierMock{
		GetMediaKeysForExpiredDraftsFunc: func(_ context.Context, cutoff pgtype.Timestamptz) ([]store.GetMediaKeysForExpiredDraftsRow, error) {
			listedCutoff = cutoff.Time
			return keys, nil
		},
		DeleteExpiredDraftsFunc: func(_ context.Context, _ pgtype.Timestamptz) (int64, error) {
			deletedCalls++
			return int64(len(keys)), nil
		},
	}

	storage := testutil.NewMockStorage()
	storage.Files["u/c/audio.m4a"] = []byte("fake audio data")

	logger := slog.New(slog.NewTextHandler(os.Stdout, nil))

	// Run cleanup with a 50 ms tick and 100 ms expiry window.
	go worker.StartDraftCleanup(ctx, q, storage, logger, 50*time.Millisecond, 100*time.Millisecond)

	require.Eventually(t, func() bool { return deletedCalls >= 1 }, time.Second, 25*time.Millisecond,
		"expected DeleteExpiredDrafts to be called at least once within 1s")

	cancel()

	require.False(t, listedCutoff.IsZero(), "expected GetMediaKeysForExpiredDrafts to have been called with a non-zero cutoff")
	_, stillPresent := storage.Files["u/c/audio.m4a"]
	require.False(t, stillPresent, "expected storage key to have been deleted after cleanup tick")
}

func TestDraftCleanup_StopsOnContextCancel(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())

	var callCount int
	q := &store.QuerierMock{
		GetMediaKeysForExpiredDraftsFunc: func(_ context.Context, _ pgtype.Timestamptz) ([]store.GetMediaKeysForExpiredDraftsRow, error) {
			callCount++
			return nil, nil
		},
		DeleteExpiredDraftsFunc: func(_ context.Context, _ pgtype.Timestamptz) (int64, error) {
			return 0, nil
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
	require.Eventually(t, func() bool { return callCount >= 1 }, time.Second, 25*time.Millisecond)
	cancel()

	select {
	case <-done:
		// goroutine exited cleanly
	case <-time.After(500 * time.Millisecond):
		t.Fatal("StartDraftCleanup did not exit after context cancellation")
	}
}
