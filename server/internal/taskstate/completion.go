package taskstate

import (
	"time"

	"github.com/jackc/pgx/v5/pgtype"
)

// ComputeCompletedAtUpdate derives the completed_at mutation for a status change.
func ComputeCompletedAtUpdate(currentStatus string, requestedStatus *string) (bool, pgtype.Timestamptz) {
	if requestedStatus == nil || *requestedStatus == "archived" {
		return false, pgtype.Timestamptz{}
	}

	switch *requestedStatus {
	case "completed":
		if currentStatus == "completed" {
			return false, pgtype.Timestamptz{}
		}
		return true, pgtype.Timestamptz{Time: time.Now(), Valid: true}
	case "pending", "in_progress":
		return true, pgtype.Timestamptz{}
	default:
		return false, pgtype.Timestamptz{}
	}
}
