package queue

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/alicebob/miniredis/v2"
	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"
)

func newTestRedis(t *testing.T) (*miniredis.Miniredis, *redis.Client) {
	t.Helper()
	mr := miniredis.RunT(t)
	client := redis.NewClient(&redis.Options{Addr: mr.Addr()})
	t.Cleanup(func() { client.Close() })
	return mr, client
}

func TestProducer_Enqueue(t *testing.T) {
	mr, client := newTestRedis(t)
	ctx := context.Background()

	producer := NewProducer(client)

	payload := JobPayload{
		JobID:       uuid.New(),
		ContentID:   uuid.New(),
		UserID:      "user-123",
		ContentType: "image",
		MaxAttempts: 3,
	}

	if err := producer.Enqueue(ctx, payload); err != nil {
		t.Fatalf("Enqueue() error = %v", err)
	}

	// Verify the item is in the pending list.
	items := listItems(t, mr, KeyPending)
	if len(items) != 1 {
		t.Fatalf("expected 1 item in pending list, got %d", len(items))
	}

	// Verify the payload round-trips correctly.
	var got JobPayload
	if err := json.Unmarshal([]byte(items[0]), &got); err != nil {
		t.Fatalf("unmarshal stored payload: %v", err)
	}

	if got.JobID != payload.JobID {
		t.Errorf("JobID mismatch: got %v, want %v", got.JobID, payload.JobID)
	}
	if got.UserID != payload.UserID {
		t.Errorf("UserID mismatch: got %v, want %v", got.UserID, payload.UserID)
	}
	if got.ContentType != payload.ContentType {
		t.Errorf("ContentType mismatch: got %v, want %v", got.ContentType, payload.ContentType)
	}
}

func TestProducer_Enqueue_MultipleJobs(t *testing.T) {
	mr, client := newTestRedis(t)
	ctx := context.Background()

	producer := NewProducer(client)

	for i := 0; i < 3; i++ {
		payload := JobPayload{
			JobID:       uuid.New(),
			ContentID:   uuid.New(),
			UserID:      "user-abc",
			ContentType: "video",
			MaxAttempts: 5,
		}
		if err := producer.Enqueue(ctx, payload); err != nil {
			t.Fatalf("Enqueue() error = %v on iteration %d", err, i)
		}
	}

	items := listItems(t, mr, KeyPending)
	if len(items) != 3 {
		t.Errorf("expected 3 items in pending list, got %d", len(items))
	}
}
