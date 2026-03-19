package queue

import (
	"context"
	"fmt"

	"github.com/redis/go-redis/v9"
)

const (
	KeyPending    = "mindtab:jobs:pending"
	KeyProcessing = "mindtab:jobs:processing"
	KeyRetry      = "mindtab:jobs:retry"
	KeyDead       = "mindtab:jobs:dead"
	KeyLockPrefix = "mindtab:jobs:lock:"
)

// ConnectRedis parses a Redis URL and returns a connected client.
func ConnectRedis(ctx context.Context, redisURL string) (*redis.Client, error) {
	opts, err := redis.ParseURL(redisURL)
	if err != nil {
		return nil, fmt.Errorf("parse redis URL: %w", err)
	}

	client := redis.NewClient(opts)

	if err := client.Ping(ctx).Err(); err != nil {
		return nil, fmt.Errorf("redis ping: %w", err)
	}

	return client, nil
}
