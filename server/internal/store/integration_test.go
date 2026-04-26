//go:build integration

package store_test

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/pgvector/pgvector-go"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/ksushant6566/mindtab/server/internal/store"
	"github.com/ksushant6566/mindtab/server/internal/testutil"
)

// createTestUser inserts a user and returns it; fails the test on error.
func createTestUser(t *testing.T, ctx context.Context, q *store.Queries) store.MindmapUser {
	t.Helper()
	user, err := q.UpsertUser(ctx, store.UpsertUserParams{
		ID:    "test-user-1",
		Name:  pgtype.Text{String: "Test User", Valid: true},
		Email: "test@example.com",
		Image: pgtype.Text{},
	})
	require.NoError(t, err)
	return user
}

// createTestContent inserts a minimal content row for the given userID.
func createTestContent(t *testing.T, ctx context.Context, q *store.Queries, userID string) store.CreateContentRow {
	t.Helper()
	content, err := q.CreateContent(ctx, store.CreateContentParams{
		ID:               pgtype.UUID{Bytes: uuid.New(), Valid: true},
		UserID:           userID,
		SourceUrl:        pgtype.Text{String: "https://example.com/article", Valid: true},
		SourceType:       "article",
		SourceTitle:      pgtype.Text{String: "Test Article", Valid: true},
		ExtractedText:    pgtype.Text{},
		MediaKey:         pgtype.Text{},
		MediaMime:        pgtype.Text{},
		MediaFileBytes:   pgtype.Int8{},
		DurationSeconds:  pgtype.Int4{},
		ProcessingStatus: "pending",
		CommitStatus:     "committed",
	})
	require.NoError(t, err)
	return content
}

// TestStore_CreateAndGetContent verifies that a newly created content row
// can be fetched by ID with matching fields.
func TestStore_CreateAndGetContent(t *testing.T) {
	pool := testutil.SetupTestDB(t)
	q := store.New(pool)
	ctx := context.Background()
	testutil.TruncateAllTables(t, pool)

	user := createTestUser(t, ctx, q)
	created := createTestContent(t, ctx, q, user.ID)

	fetched, err := q.GetContentByID(ctx, store.GetContentByIDParams{
		ID:     created.ID,
		UserID: user.ID,
	})
	require.NoError(t, err)

	assert.Equal(t, created.ID, fetched.ID)
	assert.Equal(t, user.ID, fetched.UserID)
	assert.Equal(t, "https://example.com/article", fetched.SourceUrl.String)
	assert.Equal(t, "article", fetched.SourceType)
	assert.Equal(t, "Test Article", fetched.SourceTitle.String)
	assert.Equal(t, "pending", fetched.ProcessingStatus)
}

// TestStore_ListContent verifies pagination: inserting 3 items and requesting
// limit=2 returns exactly 2 rows ordered newest-first.
func TestStore_ListContent(t *testing.T) {
	pool := testutil.SetupTestDB(t)
	q := store.New(pool)
	ctx := context.Background()
	testutil.TruncateAllTables(t, pool)

	user := createTestUser(t, ctx, q)

	for i := 0; i < 3; i++ {
		_, err := q.CreateContent(ctx, store.CreateContentParams{
			ID:               pgtype.UUID{Bytes: uuid.New(), Valid: true},
			UserID:           user.ID,
			SourceUrl:        pgtype.Text{String: "https://example.com/item", Valid: true},
			SourceType:       "article",
			SourceTitle:      pgtype.Text{String: "Item", Valid: true},
			ExtractedText:    pgtype.Text{},
			MediaKey:         pgtype.Text{},
			MediaMime:        pgtype.Text{},
			MediaFileBytes:   pgtype.Int8{},
			DurationSeconds:  pgtype.Int4{},
			ProcessingStatus: "pending",
			CommitStatus:     "committed",
		})
		require.NoError(t, err)
	}

	rows, err := q.ListContent(ctx, store.ListContentParams{
		UserID: user.ID,
		Limit:  2,
		Offset: 0,
	})
	require.NoError(t, err)
	assert.Len(t, rows, 2)

	// Verify descending order: first row should be newer than or equal to second.
	if len(rows) == 2 {
		assert.False(t, rows[0].CreatedAt.Time.Before(rows[1].CreatedAt.Time),
			"rows should be ordered by created_at DESC")
	}
}

// TestStore_SoftDelete verifies that a soft-deleted content row is invisible
// to both GetContentByID and ListContent.
func TestStore_SoftDelete(t *testing.T) {
	pool := testutil.SetupTestDB(t)
	q := store.New(pool)
	ctx := context.Background()
	testutil.TruncateAllTables(t, pool)

	user := createTestUser(t, ctx, q)
	content := createTestContent(t, ctx, q, user.ID)

	// Soft-delete the row.
	err := q.SoftDeleteContent(ctx, store.SoftDeleteContentParams{
		ID:     content.ID,
		UserID: user.ID,
	})
	require.NoError(t, err)

	// GetContentByID should return not found.
	_, err = q.GetContentByID(ctx, store.GetContentByIDParams{
		ID:     content.ID,
		UserID: user.ID,
	})
	assert.Error(t, err, "GetContentByID should return an error for soft-deleted content")

	// ListContent should exclude the deleted row.
	rows, err := q.ListContent(ctx, store.ListContentParams{
		UserID: user.ID,
		Limit:  100,
		Offset: 0,
	})
	require.NoError(t, err)
	for _, r := range rows {
		assert.NotEqual(t, content.ID, r.ID, "deleted content should not appear in list")
	}
}

// TestStore_CreateAndCompleteJob verifies the happy-path status transitions:
// pending -> processing -> completed.
func TestStore_CreateAndCompleteJob(t *testing.T) {
	pool := testutil.SetupTestDB(t)
	q := store.New(pool)
	ctx := context.Background()
	testutil.TruncateAllTables(t, pool)

	user := createTestUser(t, ctx, q)
	content := createTestContent(t, ctx, q, user.ID)

	jobID, err := q.CreateJob(ctx, store.CreateJobParams{
		ContentID:   content.ID,
		UserID:      user.ID,
		ContentType: "article",
	})
	require.NoError(t, err)
	assert.True(t, jobID.Valid)

	// pending -> processing
	err = q.StartJob(ctx, jobID)
	require.NoError(t, err)

	job, err := q.GetJobByContentID(ctx, content.ID)
	require.NoError(t, err)
	assert.Equal(t, "processing", job.Status)
	assert.True(t, job.StartedAt.Valid, "started_at should be set after StartJob")

	// processing -> completed
	err = q.CompleteJob(ctx, jobID)
	require.NoError(t, err)

	job, err = q.GetJobByContentID(ctx, content.ID)
	require.NoError(t, err)
	assert.Equal(t, "completed", job.Status)
	assert.True(t, job.CompletedAt.Valid, "completed_at should be set after CompleteJob")
}

// TestStore_UpdateJobStepResults verifies that JSONB step results are
// persisted and can be read back via GetJobByContentID.
func TestStore_UpdateJobStepResults(t *testing.T) {
	pool := testutil.SetupTestDB(t)
	q := store.New(pool)
	ctx := context.Background()
	testutil.TruncateAllTables(t, pool)

	user := createTestUser(t, ctx, q)
	content := createTestContent(t, ctx, q, user.ID)

	jobID, err := q.CreateJob(ctx, store.CreateJobParams{
		ContentID:   content.ID,
		UserID:      user.ID,
		ContentType: "article",
	})
	require.NoError(t, err)

	stepData := map[string]interface{}{
		"extract": map[string]interface{}{"status": "ok", "chars": 1234},
		"summary": map[string]interface{}{"status": "ok", "provider": "gemini"},
	}
	stepJSON, err := json.Marshal(stepData)
	require.NoError(t, err)

	err = q.UpdateJobStepResults(ctx, store.UpdateJobStepResultsParams{
		ID:          jobID,
		StepResults: stepJSON,
		CurrentStep: pgtype.Text{String: "summary", Valid: true},
	})
	require.NoError(t, err)

	job, err := q.GetJobByContentID(ctx, content.ID)
	require.NoError(t, err)
	assert.Equal(t, "summary", job.CurrentStep.String)
	assert.JSONEq(t, string(stepJSON), string(job.StepResults))
}

// TestStore_UpdateContentResults verifies that summary, tags, and key_topics
// are written and visible via GetContentByID after UpdateContentResults.
func TestStore_UpdateContentResults(t *testing.T) {
	pool := testutil.SetupTestDB(t)
	q := store.New(pool)
	ctx := context.Background()
	testutil.TruncateAllTables(t, pool)

	user := createTestUser(t, ctx, q)
	content := createTestContent(t, ctx, q, user.ID)

	err := q.UpdateContentResults(ctx, store.UpdateContentResultsParams{
		ID:                content.ID,
		ExtractedText:     pgtype.Text{String: "Full article text here.", Valid: true},
		VisualDescription: pgtype.Text{},
		Summary:           pgtype.Text{String: "A concise summary.", Valid: true},
		Tags:              []string{"go", "testing", "integration"},
		KeyTopics:         []string{"databases", "sql"},
		SourceTitle:       pgtype.Text{String: "Updated Title", Valid: true},
		SummaryProvider:   pgtype.Text{String: "gemini", Valid: true},
		EmbeddingProvider: pgtype.Text{String: "openai", Valid: true},
		EmbeddingModel:    pgtype.Text{String: "text-embedding-3-small", Valid: true},
		MediaKey:          pgtype.Text{},
	})
	require.NoError(t, err)

	fetched, err := q.GetContentByID(ctx, store.GetContentByIDParams{
		ID:     content.ID,
		UserID: user.ID,
	})
	require.NoError(t, err)

	assert.Equal(t, "A concise summary.", fetched.Summary.String)
	assert.Equal(t, []string{"go", "testing", "integration"}, fetched.Tags)
	assert.Equal(t, []string{"databases", "sql"}, fetched.KeyTopics)
	assert.Equal(t, "completed", fetched.ProcessingStatus)
	assert.Equal(t, "Updated Title", fetched.SourceTitle.String)
	assert.Equal(t, "gemini", fetched.SummaryProvider.String)
}

// TestStore_UpdateContentEmbedding verifies that a vector embedding can be
// written without error (direct verification requires raw SQL, so we only
// check the exec path succeeds).
func TestStore_UpdateContentEmbedding(t *testing.T) {
	pool := testutil.SetupTestDB(t)
	q := store.New(pool)
	ctx := context.Background()
	testutil.TruncateAllTables(t, pool)

	user := createTestUser(t, ctx, q)
	content := createTestContent(t, ctx, q, user.ID)

	// 1536-dimension vector (text-embedding-3-small dimension).
	dims := make([]float32, 1536)
	for i := range dims {
		dims[i] = float32(i) * 0.001
	}
	embedding := pgvector.NewVector(dims)

	err := q.UpdateContentEmbedding(ctx, store.UpdateContentEmbeddingParams{
		ID:        content.ID,
		Embedding: embedding,
	})
	require.NoError(t, err)

	// Read back via raw SQL since no sqlc query returns the embedding column.
	var got pgvector.Vector
	err = pool.QueryRow(ctx,
		"SELECT embedding FROM mindmap_content WHERE id = $1", content.ID,
	).Scan(&got)
	require.NoError(t, err, "failed to read back embedding")
	require.Equal(t, len(dims), len(got.Slice()), "embedding dimension mismatch")
	for i, v := range got.Slice() {
		assert.InDelta(t, dims[i], v, 1e-6, "embedding[%d] mismatch", i)
	}
}

// TestStore_IsContentDeleted verifies the IsContentDeleted helper returns
// false for active content and true after a soft-delete.
func TestStore_IsContentDeleted(t *testing.T) {
	pool := testutil.SetupTestDB(t)
	q := store.New(pool)
	ctx := context.Background()
	testutil.TruncateAllTables(t, pool)

	user := createTestUser(t, ctx, q)
	content := createTestContent(t, ctx, q, user.ID)

	// Active content should not be deleted.
	isDeleted, err := q.IsContentDeleted(ctx, content.ID)
	require.NoError(t, err)
	assert.False(t, isDeleted, "newly created content should not be deleted")

	// Soft-delete it.
	err = q.SoftDeleteContent(ctx, store.SoftDeleteContentParams{
		ID:     content.ID,
		UserID: user.ID,
	})
	require.NoError(t, err)

	// Now it should report as deleted.
	isDeleted, err = q.IsContentDeleted(ctx, content.ID)
	require.NoError(t, err)
	assert.True(t, isDeleted, "soft-deleted content should be reported as deleted")
}
