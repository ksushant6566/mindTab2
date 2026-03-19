package search

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	pgvector "github.com/pgvector/pgvector-go"
	"github.com/ksushant6566/mindtab/server/internal/providers"
	"github.com/ksushant6566/mindtab/server/internal/providers/embedding"
)

type SearchResult struct {
	ID          uuid.UUID `json:"id"`
	SourceURL   *string   `json:"source_url,omitempty"`
	SourceType  string    `json:"source_type"`
	SourceTitle *string   `json:"source_title,omitempty"`
	Summary     *string   `json:"summary,omitempty"`
	Tags        []string  `json:"tags"`
	MediaKey    *string   `json:"media_key,omitempty"`
	Similarity  float64   `json:"similarity"`
	CreatedAt   time.Time `json:"created_at"`
}

type SemanticSearch struct {
	pool           *pgxpool.Pool
	embeddingChain *providers.Chain[embedding.EmbeddingProvider]
}

func NewSemanticSearch(pool *pgxpool.Pool, embeddingChain *providers.Chain[embedding.EmbeddingProvider]) *SemanticSearch {
	return &SemanticSearch{pool: pool, embeddingChain: embeddingChain}
}

func (s *SemanticSearch) Search(ctx context.Context, userID string, query string, limit int) ([]SearchResult, error) {
	if limit <= 0 {
		limit = 10
	}

	var queryEmbedding []float32
	err := s.embeddingChain.Execute(func(name string, provider embedding.EmbeddingProvider) error {
		embeddings, err := provider.Embed(ctx, []string{query})
		if err != nil {
			return err
		}
		if len(embeddings) > 0 {
			queryEmbedding = embeddings[0]
		}
		return nil
	})
	if err != nil {
		return nil, fmt.Errorf("embed query: %w", err)
	}

	if len(queryEmbedding) == 0 {
		return nil, fmt.Errorf("empty query embedding")
	}

	vec := pgvector.NewVector(queryEmbedding)

	rows, err := s.pool.Query(ctx, `
		SELECT id, source_url, source_type, source_title, summary, tags, media_key,
		       1 - (embedding <=> $1) AS similarity,
		       created_at
		FROM mindmap_content
		WHERE user_id = $2
		  AND deleted_at IS NULL
		  AND embedding IS NOT NULL
		ORDER BY embedding <=> $1
		LIMIT $3
	`, vec, userID, limit)
	if err != nil {
		return nil, fmt.Errorf("search query: %w", err)
	}
	defer rows.Close()

	var results []SearchResult
	for rows.Next() {
		var r SearchResult
		err := rows.Scan(
			&r.ID, &r.SourceURL, &r.SourceType, &r.SourceTitle,
			&r.Summary, &r.Tags, &r.MediaKey,
			&r.Similarity, &r.CreatedAt,
		)
		if err != nil {
			return nil, fmt.Errorf("scan result: %w", err)
		}
		results = append(results, r)
	}

	return results, rows.Err()
}
