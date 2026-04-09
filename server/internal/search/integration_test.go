//go:build integration

package search_test

import (
	"context"
	"fmt"
	"log/slog"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	pgvector "github.com/pgvector/pgvector-go"
	"github.com/ksushant6566/mindtab/server/internal/providers"
	"github.com/ksushant6566/mindtab/server/internal/providers/embedding"
	"github.com/ksushant6566/mindtab/server/internal/search"
	"github.com/ksushant6566/mindtab/server/internal/store"
	"github.com/ksushant6566/mindtab/server/internal/testutil"
)

// upsertTestUser creates a user in the DB, failing the test if it errors.
func upsertTestUser(t *testing.T, ctx context.Context, q *store.Queries, userID string) {
	t.Helper()
	_, err := q.UpsertUser(ctx, store.UpsertUserParams{
		ID:    userID,
		Name:  pgtype.Text{String: "Test User", Valid: true},
		Email: fmt.Sprintf("%s@test.example", userID),
		Image: pgtype.Text{},
	})
	if err != nil {
		t.Fatalf("UpsertUser(%s): %v", userID, err)
	}
}

// insertContent inserts a mindmap_content row with the given embedding directly
// via raw SQL so we can set the vector column without going through sqlc.
// Returns the ID of the inserted row.
func insertContent(t *testing.T, ctx context.Context, pool *pgxpool.Pool, userID, sourceType string, vec []float32) uuid.UUID {
	t.Helper()
	id := uuid.New()
	v := pgvector.NewVector(vec)
	_, err := pool.Exec(ctx, `
		INSERT INTO mindmap_content (id, user_id, source_type, embedding, processing_status)
		VALUES ($1, $2, $3, $4, 'completed')
	`, id, userID, sourceType, v)
	if err != nil {
		t.Fatalf("insertContent(user=%s): %v", userID, err)
	}
	return id
}

// softDeleteContent sets deleted_at for the given content row.
func softDeleteContent(t *testing.T, ctx context.Context, pool *pgxpool.Pool, id uuid.UUID) {
	t.Helper()
	_, err := pool.Exec(ctx, `UPDATE mindmap_content SET deleted_at = $1 WHERE id = $2`, time.Now(), id)
	if err != nil {
		t.Fatalf("softDeleteContent(%v): %v", id, err)
	}
}

// newSemanticSearch builds a SemanticSearch backed by a mock embedding provider
// that always returns the given vector.
func newSemanticSearch(t *testing.T, pool *pgxpool.Pool, vec []float32) *search.SemanticSearch {
	t.Helper()
	mockEmb := &testutil.MockEmbeddingProvider{Embedding: vec}
	chain := providers.NewChain[embedding.EmbeddingProvider](slog.Default())
	chain.Add("mock", mockEmb)
	return search.NewSemanticSearch(pool, chain)
}

// TestSearch_ReturnsRankedResults inserts 3 content rows with distinct embeddings
// and verifies the search returns them ordered by cosine similarity to the query.
func TestSearch_ReturnsRankedResults(t *testing.T) {
	pool := testutil.SetupTestDB(t)
	ctx := context.Background()
	userID := "user-rank-" + uuid.New().String()[:8]

	upsertTestUser(t, ctx, store.New(pool), userID)

	// vec1: unit vector pointing along dimension 1.
	vec1 := make([]float32, 1536)
	vec1[1] = 1.0 // points along dimension 1

	// vec2: points along dimension 0 — orthogonal to vec1.
	vec2 := make([]float32, 1536)
	vec2[0] = 1.0

	// vec3: between vec1 and vec2.
	vec3 := make([]float32, 1536)
	vec3[0] = 0.707
	vec3[1] = 0.707

	insertContent(t, ctx, pool, userID, "article", vec1)
	insertContent(t, ctx, pool, userID, "article", vec2)
	insertContent(t, ctx, pool, userID, "article", vec3)

	// Query vector identical to vec2: vec2 should rank first.
	queryVec := make([]float32, 1536)
	queryVec[0] = 1.0

	s := newSemanticSearch(t, pool, queryVec)

	results, err := s.Search(ctx, userID, "test query", 10)
	if err != nil {
		t.Fatalf("Search() error = %v", err)
	}

	if len(results) != 3 {
		t.Fatalf("expected 3 results, got %d", len(results))
	}

	// Results must be ordered by descending similarity (closest first).
	for i := 1; i < len(results); i++ {
		if results[i].Similarity > results[i-1].Similarity {
			t.Errorf(
				"results not ordered by similarity: index %d (%f) > index %d (%f)",
				i, results[i].Similarity, i-1, results[i-1].Similarity,
			)
		}
	}

	// The top result must be closest to queryVec (vec2).
	if results[0].Similarity < results[len(results)-1].Similarity {
		t.Errorf("first result should have the highest similarity")
	}
}

// TestSearch_UserScoped inserts content for two users and verifies that
// searching as user A only returns user A's content.
func TestSearch_UserScoped(t *testing.T) {
	pool := testutil.SetupTestDB(t)
	ctx := context.Background()

	userA := "user-a-" + uuid.New().String()[:8]
	userB := "user-b-" + uuid.New().String()[:8]

	q := store.New(pool)
	upsertTestUser(t, ctx, q, userA)
	upsertTestUser(t, ctx, q, userB)

	vec := make([]float32, 1536)
	vec[0] = 0.5

	idA := insertContent(t, ctx, pool, userA, "article", vec)
	insertContent(t, ctx, pool, userB, "article", vec) // user B's content — must not appear

	queryVec := make([]float32, 1536)
	queryVec[0] = 0.5

	s := newSemanticSearch(t, pool, queryVec)

	results, err := s.Search(ctx, userA, "query", 10)
	if err != nil {
		t.Fatalf("Search() error = %v", err)
	}

	if len(results) != 1 {
		t.Fatalf("expected 1 result for userA, got %d", len(results))
	}
	if results[0].ID != idA {
		t.Errorf("expected result ID %v, got %v", idA, results[0].ID)
	}
}

// TestSearch_ExcludesSoftDeleted inserts a content row, soft-deletes it,
// then verifies it is excluded from search results.
func TestSearch_ExcludesSoftDeleted(t *testing.T) {
	pool := testutil.SetupTestDB(t)
	ctx := context.Background()
	userID := "user-del-" + uuid.New().String()[:8]

	upsertTestUser(t, ctx, store.New(pool), userID)

	vec := make([]float32, 1536)
	vec[0] = 1.0

	id := insertContent(t, ctx, pool, userID, "article", vec)
	softDeleteContent(t, ctx, pool, id)

	queryVec := make([]float32, 1536)
	queryVec[0] = 1.0

	s := newSemanticSearch(t, pool, queryVec)

	results, err := s.Search(ctx, userID, "query", 10)
	if err != nil {
		t.Fatalf("Search() error = %v", err)
	}

	if len(results) != 0 {
		t.Errorf("expected 0 results after soft-delete, got %d", len(results))
	}
}

// TestSearch_EmptyResults searches when no content exists for the user and
// verifies an empty (non-nil) result with no error.
func TestSearch_EmptyResults(t *testing.T) {
	pool := testutil.SetupTestDB(t)
	ctx := context.Background()
	userID := "user-empty-" + uuid.New().String()[:8]

	upsertTestUser(t, ctx, store.New(pool), userID)

	queryVec := make([]float32, 1536)
	queryVec[0] = 0.3

	s := newSemanticSearch(t, pool, queryVec)

	results, err := s.Search(ctx, userID, "anything", 10)
	if err != nil {
		t.Fatalf("Search() error = %v", err)
	}

	if len(results) != 0 {
		t.Errorf("expected 0 results, got %d", len(results))
	}
}
