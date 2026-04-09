//go:build integration

package testutil

import (
	"context"
	"fmt"
	"testing"
	"time"

	goredis "github.com/redis/go-redis/v9"
	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/wait"
)

// SetupTestRedis boots a Redis container and returns a connected client.
// The container is terminated in t.Cleanup.
func SetupTestRedis(t *testing.T) *goredis.Client {
	t.Helper()

	ctx := context.Background()

	ctr, err := testcontainers.Run(ctx, "redis:7-alpine",
		testcontainers.WithExposedPorts("6379/tcp"),
		testcontainers.WithWaitStrategy(
			wait.ForLog("Ready to accept connections").
				WithStartupTimeout(15*time.Second),
		),
	)
	if err != nil {
		t.Fatalf("failed to start redis container: %v", err)
	}

	t.Cleanup(func() {
		if err := testcontainers.TerminateContainer(ctr); err != nil {
			t.Logf("failed to terminate redis container: %v", err)
		}
	})

	host, err := ctr.Host(ctx)
	if err != nil {
		t.Fatalf("failed to get redis container host: %v", err)
	}

	port, err := ctr.MappedPort(ctx, "6379/tcp")
	if err != nil {
		t.Fatalf("failed to get redis container port: %v", err)
	}

	addr := fmt.Sprintf("%s:%s", host, port.Port())

	client := goredis.NewClient(&goredis.Options{
		Addr: addr,
	})

	t.Cleanup(func() {
		if err := client.Close(); err != nil {
			t.Logf("failed to close redis client: %v", err)
		}
	})

	if err := client.Ping(ctx).Err(); err != nil {
		t.Fatalf("failed to ping redis: %v", err)
	}

	return client
}

// FlushRedis flushes all keys from the Redis instance, useful for test isolation.
func FlushRedis(t *testing.T, client *goredis.Client) {
	t.Helper()

	if err := client.FlushAll(context.Background()).Err(); err != nil {
		t.Fatalf("failed to flush redis: %v", err)
	}
}
