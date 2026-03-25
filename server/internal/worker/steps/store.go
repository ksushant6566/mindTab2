package steps

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/jackc/pgx/v5/pgtype"
	pgvector "github.com/pgvector/pgvector-go"
	"github.com/ksushant6566/mindtab/server/internal/store"
	"github.com/ksushant6566/mindtab/server/internal/worker"
)

func Store(
	ctx context.Context,
	queries store.Querier,
	job *worker.Job,
	prevResults worker.StepResults,
) (*worker.StepResult, error) {
	contentID := pgtype.UUID{Bytes: job.ContentID, Valid: true}

	// Check if content was deleted during processing
	isDeleted, err := queries.IsContentDeleted(ctx, contentID)
	if err != nil {
		return nil, fmt.Errorf("check deleted: %w", err)
	}
	if isDeleted {
		return nil, nil
	}

	// Parse step results
	var extractResult ExtractResult
	var visionResult VisionResult
	var summarizeResult SummarizeResult
	var embedResult EmbedResult
	var mediaKey string

	if r, ok := prevResults["extract"]; ok && r != nil {
		json.Unmarshal(r.Data, &extractResult)
	}
	if r, ok := prevResults["vision"]; ok && r != nil {
		json.Unmarshal(r.Data, &visionResult)
	}
	if r, ok := prevResults["summarize"]; ok && r != nil {
		json.Unmarshal(r.Data, &summarizeResult)
	}
	if r, ok := prevResults["embed"]; ok && r != nil {
		json.Unmarshal(r.Data, &embedResult)
	}
	if r, ok := prevResults["save"]; ok && r != nil {
		var saveResult map[string]string
		json.Unmarshal(r.Data, &saveResult)
		mediaKey = saveResult["media_key"]
	}

	// Build extracted text: prefer article text, fall back to vision OCR text
	extractedText := extractResult.Text
	if extractedText == "" {
		extractedText = visionResult.ExtractedText
	}

	// Prefer extract title (articles), fall back to summarize title (images)
	title := extractResult.Title
	if title == "" {
		title = summarizeResult.Title
	}

	// Update content results
	err = queries.UpdateContentResults(ctx, store.UpdateContentResultsParams{
		ID:                contentID,
		ExtractedText:     pgtextFrom(extractedText),
		VisualDescription: pgtextFrom(visionResult.VisualDescription),
		Summary:           pgtextFrom(summarizeResult.Summary),
		Tags:              summarizeResult.Tags,
		KeyTopics:         summarizeResult.KeyTopics,
		SourceTitle:       pgtextFrom(title),
		SummaryProvider:   pgtextFrom(summarizeResult.Provider),
		EmbeddingProvider: pgtextFrom(embedResult.Provider),
		EmbeddingModel:    pgtextFrom(embedResult.Model),
		MediaKey:          pgtextFrom(mediaKey),
	})
	if err != nil {
		return nil, fmt.Errorf("update content results: %w", err)
	}

	// Update embedding via sqlc-generated query
	if len(embedResult.Embedding) > 0 {
		vec := pgvector.NewVector(embedResult.Embedding)
		err = queries.UpdateContentEmbedding(ctx, store.UpdateContentEmbeddingParams{
			ID:        contentID,
			Embedding: vec,
		})
		if err != nil {
			return nil, fmt.Errorf("update embedding: %w", err)
		}
	}

	return nil, nil
}

func pgtextFrom(s string) pgtype.Text {
	if s == "" {
		return pgtype.Text{}
	}
	return pgtype.Text{String: s, Valid: true}
}
