package steps

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/ksushant6566/mindtab/server/internal/services"
	"github.com/ksushant6566/mindtab/server/internal/worker"
)

type ExtractResult struct {
	Text  string `json:"text"`
	Title string `json:"title,omitempty"`
}

func Extract(ctx context.Context, jina *services.JinaReader, job *worker.Job) (*worker.StepResult, error) {
	if job.SourceURL == "" {
		return nil, fmt.Errorf("extract: no source URL")
	}

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
