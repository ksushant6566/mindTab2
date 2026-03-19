package worker

import (
	"context"
	"encoding/json"

	"github.com/google/uuid"
)

// StepResults holds the output of completed steps, keyed by step name.
type StepResults map[string]*StepResult

// StepResult is the output of a single processing step.
type StepResult struct {
	Data json.RawMessage `json:"data"`
}

// Job represents a processing job with its current state.
type Job struct {
	ID          uuid.UUID `json:"id"`
	ContentID   uuid.UUID `json:"content_id"`
	UserID      string    `json:"user_id"`
	ContentType string    `json:"content_type"`
	SourceURL   string    `json:"source_url,omitempty"`
	ImageData   []byte    `json:"-"`
	ImageType   string    `json:"-"`
}

// Processor defines a content type processing pipeline.
type Processor interface {
	ContentType() string
	Steps() []string
	Execute(ctx context.Context, step string, job *Job, prevResults StepResults) (*StepResult, error)
}
