package queue

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"
)

// JobPayload is the JSON structure stored in Redis.
type JobPayload struct {
	JobID         uuid.UUID      `json:"job_id"`
	ContentID     uuid.UUID      `json:"content_id"`
	UserID        string         `json:"user_id"`
	ContentType   string         `json:"content_type"`
	SourceURL     string         `json:"source_url,omitempty"`
	TempImagePath string         `json:"temp_image_path,omitempty"`
	ImageMIME     string         `json:"image_mime,omitempty"`
	AttemptCount  int            `json:"attempt_count"`
	MaxAttempts   int            `json:"max_attempts"`
	CurrentStep   string         `json:"current_step,omitempty"`
	StepResults   map[string]any `json:"step_results,omitempty"`
}

// Producer enqueues jobs to the Redis pending list.
type Producer struct {
	client *redis.Client
}

func NewProducer(client *redis.Client) *Producer {
	return &Producer{client: client}
}

// Enqueue adds a job to the pending queue.
func (p *Producer) Enqueue(ctx context.Context, payload JobPayload) error {
	data, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("marshal job: %w", err)
	}

	return p.client.LPush(ctx, KeyPending, data).Err()
}
