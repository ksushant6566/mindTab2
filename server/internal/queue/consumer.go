package queue

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/redis/go-redis/v9"
)

// Consumer dequeues jobs from Redis.
type Consumer struct {
	client *redis.Client
}

func NewConsumer(client *redis.Client) *Consumer {
	return &Consumer{client: client}
}

// Dequeue blocks for up to timeout waiting for a job. Returns nil payload if timeout.
func (c *Consumer) Dequeue(ctx context.Context, timeout time.Duration) (*JobPayload, error) {
	result, err := c.client.BRPopLPush(ctx, KeyPending, KeyProcessing, timeout).Result()
	if err == redis.Nil {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("dequeue: %w", err)
	}

	var payload JobPayload
	if err := json.Unmarshal([]byte(result), &payload); err != nil {
		return nil, fmt.Errorf("unmarshal job: %w", err)
	}

	return &payload, nil
}

// RemoveFromProcessing removes a job from the processing list by scanning for its job_id.
func (c *Consumer) RemoveFromProcessing(ctx context.Context, jobID string) error {
	items, err := c.client.LRange(ctx, KeyProcessing, 0, -1).Result()
	if err != nil {
		return err
	}
	for _, item := range items {
		if strings.Contains(item, jobID) {
			c.client.LRem(ctx, KeyProcessing, 1, item)
			return nil
		}
	}
	return nil
}

// Complete removes a job from the processing list.
func (c *Consumer) Complete(ctx context.Context, payload JobPayload) error {
	return c.RemoveFromProcessing(ctx, payload.JobID.String())
}

// AcquireLock sets a lock for a job with TTL. Returns false if lock already held.
func (c *Consumer) AcquireLock(ctx context.Context, jobID string, ttl time.Duration) (bool, error) {
	return c.client.SetNX(ctx, KeyLockPrefix+jobID, "locked", ttl).Result()
}

// ReleaseLock removes a job lock.
func (c *Consumer) ReleaseLock(ctx context.Context, jobID string) error {
	return c.client.Del(ctx, KeyLockPrefix+jobID).Err()
}

// SendToDeadLetter moves a job from processing to dead letter queue.
func (c *Consumer) SendToDeadLetter(ctx context.Context, payload JobPayload) error {
	data, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("marshal job: %w", err)
	}

	c.RemoveFromProcessing(ctx, payload.JobID.String())
	return c.client.LPush(ctx, KeyDead, data).Err()
}
