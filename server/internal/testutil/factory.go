package testutil

import (
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/ksushant6566/mindtab/server/internal/queue"
	"github.com/ksushant6566/mindtab/server/internal/store"
)

// --- pgtype helpers ---

func PgUUID(id uuid.UUID) pgtype.UUID {
	return pgtype.UUID{Bytes: id, Valid: true}
}

func PgText(s string) pgtype.Text {
	return pgtype.Text{String: s, Valid: true}
}

func PgTimestamptz(t time.Time) pgtype.Timestamptz {
	return pgtype.Timestamptz{Time: t, Valid: true}
}

// --- Content factories ---

type CreateContentOption func(*store.CreateContentRow)

func NewCreateContentRow(opts ...CreateContentOption) store.CreateContentRow {
	id := uuid.New()
	now := time.Now()
	row := store.CreateContentRow{
		ID:               PgUUID(id),
		UserID:           "test-user",
		SourceType:       "article",
		ProcessingStatus: "pending",
		CommitStatus:     "committed",
		CreatedAt:        PgTimestamptz(now),
	}
	for _, o := range opts {
		o(&row)
	}
	return row
}

func WithContentID(id uuid.UUID) CreateContentOption {
	return func(r *store.CreateContentRow) {
		r.ID = PgUUID(id)
	}
}

type ListContentOption func(*store.ListContentRow)

func NewListContentRow(opts ...ListContentOption) store.ListContentRow {
	id := uuid.New()
	now := time.Now()
	row := store.ListContentRow{
		ID:               PgUUID(id),
		UserID:           "test-user",
		SourceType:       "article",
		ProcessingStatus: "completed",
		Tags:             []string{},
		KeyTopics:        []string{},
		CreatedAt:        PgTimestamptz(now),
		UpdatedAt:        PgTimestamptz(now),
	}
	for _, o := range opts {
		o(&row)
	}
	return row
}

func WithListUserID(uid string) ListContentOption {
	return func(r *store.ListContentRow) { r.UserID = uid }
}

func WithListSourceType(st string) ListContentOption {
	return func(r *store.ListContentRow) { r.SourceType = st }
}

func WithListMediaKey(key string) ListContentOption {
	return func(r *store.ListContentRow) { r.MediaKey = PgText(key) }
}

func WithListSourceURL(url string) ListContentOption {
	return func(r *store.ListContentRow) { r.SourceUrl = PgText(url) }
}

type GetContentOption func(*store.GetContentByIDRow)

func NewGetContentRow(opts ...GetContentOption) store.GetContentByIDRow {
	id := uuid.New()
	now := time.Now()
	row := store.GetContentByIDRow{
		ID:               PgUUID(id),
		UserID:           "test-user",
		SourceType:       "article",
		ProcessingStatus: "completed",
		Tags:             []string{},
		KeyTopics:        []string{},
		CreatedAt:        PgTimestamptz(now),
		UpdatedAt:        PgTimestamptz(now),
	}
	for _, o := range opts {
		o(&row)
	}
	return row
}

func WithGetMediaKey(key string) GetContentOption {
	return func(r *store.GetContentByIDRow) { r.MediaKey = PgText(key) }
}

func WithGetSourceURL(url string) GetContentOption {
	return func(r *store.GetContentByIDRow) { r.SourceUrl = PgText(url) }
}

// --- Job payload factory ---

type PayloadOption func(*queue.JobPayload)

func NewJobPayload(opts ...PayloadOption) queue.JobPayload {
	p := queue.JobPayload{
		JobID:       uuid.New(),
		ContentID:   uuid.New(),
		UserID:      "test-user",
		ContentType: "article",
		MaxAttempts: 5,
	}
	for _, o := range opts {
		o(&p)
	}
	return p
}

func WithContentType(ct string) PayloadOption {
	return func(p *queue.JobPayload) { p.ContentType = ct }
}

func WithAttemptCount(n int) PayloadOption {
	return func(p *queue.JobPayload) { p.AttemptCount = n }
}

func WithMaxAttempts(n int) PayloadOption {
	return func(p *queue.JobPayload) { p.MaxAttempts = n }
}
