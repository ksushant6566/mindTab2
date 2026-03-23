package steps

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/ksushant6566/mindtab/server/internal/services"
	"github.com/ksushant6566/mindtab/server/internal/store"
	"github.com/ksushant6566/mindtab/server/internal/worker"
)

type ExtractResult struct {
	Text  string `json:"text"`
	Title string `json:"title,omitempty"`
}

func Extract(ctx context.Context, jina *services.JinaReader, queries store.Querier, job *worker.Job) (*worker.StepResult, error) {
	if job.SourceURL == "" {
		return nil, fmt.Errorf("extract: no source URL")
	}

	// Check if extracted_text is already populated (pre-extracted content from share extension).
	content, err := queries.GetContentByID(ctx, store.GetContentByIDParams{
		ID:     pgtype.UUID{Bytes: job.ContentID, Valid: true},
		UserID: job.UserID,
	})
	if err != nil {
		slog.Warn("extract: failed to check for pre-extracted content, falling back to Jina", "error", err, "contentID", job.ContentID)
	} else if content.ExtractedText.Valid && content.ExtractedText.String != "" {
		result := ExtractResult{
			Text:  content.ExtractedText.String,
			Title: content.SourceTitle.String,
		}
		data, _ := json.Marshal(result)
		return &worker.StepResult{Data: data}, nil
	}

	// No pre-extracted content — fetch via Jina.
	text, err := jina.Extract(ctx, job.SourceURL)
	if err != nil {
		text, err = jina.FallbackExtract(ctx, job.SourceURL)
		if err != nil {
			return nil, fmt.Errorf("extract (with fallback): %w", err)
		}
	}

	result := ExtractResult{Text: text}
	data, _ := json.Marshal(result)
	return &worker.StepResult{Data: data}, nil
}
