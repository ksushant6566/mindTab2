package queue

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	"github.com/alicebob/miniredis/v2"
	"github.com/google/uuid"
)

// pushPayload is a helper that serialises a JobPayload and pushes it to the
// named Redis list using miniredis Push (equivalent to LPUSH).
func pushPayload(t *testing.T, mr *miniredis.Miniredis, key string, p JobPayload) {
	t.Helper()
	data, err := json.Marshal(p)
	if err != nil {
		t.Fatalf("marshal payload: %v", err)
	}
	if _, err := mr.Push(key, string(data)); err != nil {
		t.Fatalf("miniredis Push: %v", err)
	}
}

// listItems retrieves all items from a miniredis list.
// Returns an empty slice when the key doesn't exist (Redis deletes empty lists).
func listItems(t *testing.T, mr *miniredis.Miniredis, key string) []string {
	t.Helper()
	items, err := mr.List(key)
	if err != nil {
		// "ERR no such key" means the list was deleted (it became empty).
		return nil
	}
	return items
}

func TestConsumer_Dequeue(t *testing.T) {
	mr, client := newTestRedis(t)
	ctx := context.Background()

	consumer := NewConsumer(client)

	payload := JobPayload{
		JobID:       uuid.New(),
		ContentID:   uuid.New(),
		UserID:      "user-abc",
		ContentType: "image",
		MaxAttempts: 3,
	}
	pushPayload(t, mr, KeyPending, payload)

	got, err := consumer.Dequeue(ctx, 1*time.Second)
	if err != nil {
		t.Fatalf("Dequeue() error = %v", err)
	}
	if got == nil {
		t.Fatal("Dequeue() returned nil, want payload")
	}
	if got.JobID != payload.JobID {
		t.Errorf("JobID mismatch: got %v, want %v", got.JobID, payload.JobID)
	}
	if got.UserID != payload.UserID {
		t.Errorf("UserID mismatch: got %v, want %v", got.UserID, payload.UserID)
	}

	// Item should now be in the processing list.
	processingItems := listItems(t, mr, KeyProcessing)
	if len(processingItems) != 1 {
		t.Errorf("expected 1 item in processing list, got %d", len(processingItems))
	}

	// Pending list should be empty.
	pendingItems := listItems(t, mr, KeyPending)
	if len(pendingItems) != 0 {
		t.Errorf("expected 0 items in pending list, got %d", len(pendingItems))
	}
}

func TestConsumer_DequeueTimeout(t *testing.T) {
	_, client := newTestRedis(t)
	ctx := context.Background()

	consumer := NewConsumer(client)

	// Queue is empty — should return nil without error after timeout.
	got, err := consumer.Dequeue(ctx, 1*time.Second)
	if err != nil {
		t.Fatalf("Dequeue() on empty queue error = %v", err)
	}
	if got != nil {
		t.Errorf("Dequeue() on empty queue = %v, want nil", got)
	}
}

func TestConsumer_AcquireLock(t *testing.T) {
	_, client := newTestRedis(t)
	ctx := context.Background()

	consumer := NewConsumer(client)
	jobID := uuid.New().String()

	acquired, err := consumer.AcquireLock(ctx, jobID, 5*time.Second)
	if err != nil {
		t.Fatalf("AcquireLock() error = %v", err)
	}
	if !acquired {
		t.Error("AcquireLock() = false, want true for a fresh lock")
	}
}

func TestConsumer_LockContention(t *testing.T) {
	_, client := newTestRedis(t)
	ctx := context.Background()

	consumer := NewConsumer(client)
	jobID := uuid.New().String()

	// First acquire should succeed.
	first, err := consumer.AcquireLock(ctx, jobID, 5*time.Second)
	if err != nil {
		t.Fatalf("AcquireLock() first error = %v", err)
	}
	if !first {
		t.Fatal("AcquireLock() first = false, want true")
	}

	// Second acquire for the same job should fail (lock already held).
	second, err := consumer.AcquireLock(ctx, jobID, 5*time.Second)
	if err != nil {
		t.Fatalf("AcquireLock() second error = %v", err)
	}
	if second {
		t.Error("AcquireLock() second = true, want false (lock contention)")
	}
}

func TestConsumer_Complete(t *testing.T) {
	mr, client := newTestRedis(t)
	ctx := context.Background()

	consumer := NewConsumer(client)

	payload := JobPayload{
		JobID:       uuid.New(),
		ContentID:   uuid.New(),
		UserID:      "user-xyz",
		ContentType: "video",
		MaxAttempts: 5,
	}

	// Simulate item already in the processing list (as if Dequeue moved it there).
	pushPayload(t, mr, KeyProcessing, payload)

	if err := consumer.Complete(ctx, payload); err != nil {
		t.Fatalf("Complete() error = %v", err)
	}

	// Processing list should now be empty.
	processingItems := listItems(t, mr, KeyProcessing)
	if len(processingItems) != 0 {
		t.Errorf("expected processing list to be empty after Complete, got %d items", len(processingItems))
	}
}

func TestConsumer_SendToDeadLetter(t *testing.T) {
	mr, client := newTestRedis(t)
	ctx := context.Background()

	consumer := NewConsumer(client)

	payload := JobPayload{
		JobID:        uuid.New(),
		ContentID:    uuid.New(),
		UserID:       "user-fail",
		ContentType:  "link",
		AttemptCount: 5,
		MaxAttempts:  5,
	}

	// Simulate item in the processing list.
	pushPayload(t, mr, KeyProcessing, payload)

	if err := consumer.SendToDeadLetter(ctx, payload); err != nil {
		t.Fatalf("SendToDeadLetter() error = %v", err)
	}

	// Processing list should be empty.
	processingItems := listItems(t, mr, KeyProcessing)
	if len(processingItems) != 0 {
		t.Errorf("expected processing list to be empty, got %d items", len(processingItems))
	}

	// Dead letter list should have one item.
	deadItems := listItems(t, mr, KeyDead)
	if len(deadItems) != 1 {
		t.Fatalf("expected 1 item in dead letter list, got %d", len(deadItems))
	}

	// Verify the payload round-trips.
	var got JobPayload
	if err := json.Unmarshal([]byte(deadItems[0]), &got); err != nil {
		t.Fatalf("unmarshal dead-letter payload: %v", err)
	}
	if got.JobID != payload.JobID {
		t.Errorf("dead-letter JobID mismatch: got %v, want %v", got.JobID, payload.JobID)
	}
}
