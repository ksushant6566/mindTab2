package worker

import (
	"context"
	"log/slog"
	"time"

	"github.com/jackc/pgx/v5/pgtype"

	"github.com/ksushant6566/mindtab/server/internal/services"
	"github.com/ksushant6566/mindtab/server/internal/store"
)

// StartDraftCleanup runs an indefinite loop that, every interval, deletes any
// content rows with commit_status='draft' and updated_at older than
// expireAfter. Storage files for those rows are best-effort deleted before the
// rows go. The goroutine exits when ctx is cancelled.
func StartDraftCleanup(
	ctx context.Context,
	queries store.Querier,
	storage services.StorageProvider,
	logger *slog.Logger,
	interval time.Duration,
	expireAfter time.Duration,
) {
	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	runOnce := func() {
		cutoff := time.Now().Add(-expireAfter)
		cutoffArg := pgtype.Timestamptz{Time: cutoff, Valid: true}

		// Single atomic DELETE ... RETURNING avoids the TOCTOU window where a
		// draft could be committed between a separate SELECT and DELETE,
		// causing us to delete media for a now-committed row.
		deleted, err := queries.DeleteExpiredDraftsReturningKeys(ctx, cutoffArg)
		if err != nil {
			logger.Error("draft_cleanup: delete rows", "err", err)
			return
		}

		for _, k := range deleted {
			if !k.MediaKey.Valid {
				continue
			}
			if err := storage.Delete(ctx, k.MediaKey.String); err != nil {
				logger.Warn("draft_cleanup: storage delete failed (orphaned)", "key", k.MediaKey.String, "err", err)
			}
		}

		if len(deleted) > 0 {
			logger.Info("draft_cleanup: removed", "rows", len(deleted))
		}
	}

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			runOnce()
		}
	}
}
