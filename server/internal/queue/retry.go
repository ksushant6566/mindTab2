package queue

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"math"
	"math/rand"
	"time"

	"github.com/redis/go-redis/v9"
)

// RetryScheduler manages the retry sorted set and startup recovery.
type RetryScheduler struct {
	client *redis.Client
	logger *slog.Logger
}

func NewRetryScheduler(client *redis.Client, logger *slog.Logger) *RetryScheduler {
	return &RetryScheduler{client: client, logger: logger}
}

// ScheduleRetry adds a job to the retry sorted set with exponential backoff.
func (r *RetryScheduler) ScheduleRetry(ctx context.Context, payload JobPayload, baseDelay time.Duration) error {
	delay := CalculateBackoff(payload.AttemptCount, baseDelay)
	retryAt := time.Now().Add(delay)

	data, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("marshal job: %w", err)
	}

	// Remove from processing, add to retry
	r.client.LRem(ctx, KeyProcessing, 1, data)

	return r.client.ZAdd(ctx, KeyRetry, redis.Z{
		Score:  float64(retryAt.Unix()),
		Member: data,
	}).Err()
}

// PollRetries checks for jobs due for retry and moves them back to pending.
func (r *RetryScheduler) PollRetries(ctx context.Context) error {
	now := float64(time.Now().Unix())

	results, err := r.client.ZRangeByScore(ctx, KeyRetry, &redis.ZRangeBy{
		Min:   "-inf",
		Max:   fmt.Sprintf("%f", now),
		Count: 50,
	}).Result()
	if err != nil {
		return fmt.Errorf("zrangebyscore: %w", err)
	}

	for _, result := range results {
		removed, err := r.client.ZRem(ctx, KeyRetry, result).Result()
		if err != nil || removed == 0 {
			continue
		}

		if err := r.client.LPush(ctx, KeyPending, result).Err(); err != nil {
			r.logger.Error("failed to re-enqueue retry job", "error", err)
			r.client.ZAdd(ctx, KeyRetry, redis.Z{
				Score:  float64(time.Now().Add(10 * time.Second).Unix()),
				Member: result,
			})
		}
	}

	return nil
}

// RecoverOrphans scans the processing list for jobs with expired locks
// and moves them back to pending. Call once on startup.
func (r *RetryScheduler) RecoverOrphans(ctx context.Context) error {
	items, err := r.client.LRange(ctx, KeyProcessing, 0, -1).Result()
	if err != nil {
		return fmt.Errorf("lrange processing: %w", err)
	}

	recovered := 0
	for _, item := range items {
		var payload JobPayload
		if err := json.Unmarshal([]byte(item), &payload); err != nil {
			r.logger.Warn("invalid job in processing list", "error", err)
			continue
		}

		exists, err := r.client.Exists(ctx, KeyLockPrefix+payload.JobID.String()).Result()
		if err != nil {
			continue
		}

		if exists == 0 {
			r.client.LRem(ctx, KeyProcessing, 1, item)
			r.client.LPush(ctx, KeyPending, item)
			recovered++
			r.logger.Info("recovered orphaned job", "job_id", payload.JobID)
		}
	}

	if recovered > 0 {
		r.logger.Info("startup recovery complete", "recovered", recovered)
	}

	return nil
}

// CalculateBackoff returns exponential backoff with jitter.
func CalculateBackoff(attempt int, baseDelay time.Duration) time.Duration {
	if attempt <= 0 {
		attempt = 1
	}

	delay := time.Duration(float64(baseDelay) * math.Pow(2, float64(attempt-1)))
	maxDelay := 10 * time.Minute
	if delay > maxDelay {
		delay = maxDelay
	}

	jitter := time.Duration(rand.Int63n(int64(delay) / 2))
	delay = delay - delay/4 + jitter

	return delay
}
