//go:build integration

package queue_test

import (
	"context"
	"encoding/json"
	"log/slog"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/ksushant6566/mindtab/server/internal/queue"
	"github.com/ksushant6566/mindtab/server/internal/testutil"
)

// TestQueue_FullLifecycle tests Enqueue → Dequeue → Complete.
// After completion, both pending and processing lists must be empty.
func TestQueue_FullLifecycle(t *testing.T) {
	client := testutil.SetupTestRedis(t)
	testutil.FlushRedis(t, client)
	ctx := context.Background()

	producer := queue.NewProducer(client)
	consumer := queue.NewConsumer(client)

	payload := queue.JobPayload{
		JobID:       uuid.New(),
		ContentID:   uuid.New(),
		UserID:      "user-lifecycle",
		ContentType: "article",
		MaxAttempts: 3,
	}

	// Enqueue the job.
	if err := producer.Enqueue(ctx, payload); err != nil {
		t.Fatalf("Enqueue() error = %v", err)
	}

	// Verify it is in the pending list.
	pending, err := client.LLen(ctx, queue.KeyPending).Result()
	if err != nil {
		t.Fatalf("LLen(pending) error = %v", err)
	}
	if pending != 1 {
		t.Fatalf("expected 1 item in pending, got %d", pending)
	}

	// Dequeue the job.
	got, err := consumer.Dequeue(ctx, 2*time.Second)
	if err != nil {
		t.Fatalf("Dequeue() error = %v", err)
	}
	if got == nil {
		t.Fatal("Dequeue() returned nil, want payload")
	}
	if got.JobID != payload.JobID {
		t.Errorf("JobID mismatch: got %v, want %v", got.JobID, payload.JobID)
	}

	// Pending must be empty; processing must have 1 item.
	pending, _ = client.LLen(ctx, queue.KeyPending).Result()
	processing, _ := client.LLen(ctx, queue.KeyProcessing).Result()
	if pending != 0 {
		t.Errorf("expected 0 items in pending after Dequeue, got %d", pending)
	}
	if processing != 1 {
		t.Errorf("expected 1 item in processing after Dequeue, got %d", processing)
	}

	// Complete the job.
	if err := consumer.Complete(ctx, *got); err != nil {
		t.Fatalf("Complete() error = %v", err)
	}

	// Both lists must be empty.
	pending, _ = client.LLen(ctx, queue.KeyPending).Result()
	processing, _ = client.LLen(ctx, queue.KeyProcessing).Result()
	if pending != 0 {
		t.Errorf("expected 0 items in pending after Complete, got %d", pending)
	}
	if processing != 0 {
		t.Errorf("expected 0 items in processing after Complete, got %d", processing)
	}
}

// TestQueue_RetryLifecycle tests Enqueue → Dequeue → ScheduleRetry → PollRetries → job back in pending.
func TestQueue_RetryLifecycle(t *testing.T) {
	client := testutil.SetupTestRedis(t)
	testutil.FlushRedis(t, client)
	ctx := context.Background()

	producer := queue.NewProducer(client)
	consumer := queue.NewConsumer(client)
	scheduler := queue.NewRetryScheduler(client, slog.Default())

	payload := queue.JobPayload{
		JobID:        uuid.New(),
		ContentID:    uuid.New(),
		UserID:       "user-retry",
		ContentType:  "video",
		AttemptCount: 1,
		MaxAttempts:  3,
	}

	// Enqueue then dequeue (moves to processing).
	if err := producer.Enqueue(ctx, payload); err != nil {
		t.Fatalf("Enqueue() error = %v", err)
	}
	got, err := consumer.Dequeue(ctx, 2*time.Second)
	if err != nil {
		t.Fatalf("Dequeue() error = %v", err)
	}
	if got == nil {
		t.Fatal("Dequeue() returned nil")
	}

	// Schedule a retry with a very short base delay so PollRetries picks it up immediately.
	// Use 1ms so the retry timestamp is already in the past by the time we poll.
	if err := scheduler.ScheduleRetry(ctx, *got, 1*time.Millisecond); err != nil {
		t.Fatalf("ScheduleRetry() error = %v", err)
	}

	// Processing list should be empty (ScheduleRetry removes from processing).
	processing, _ := client.LLen(ctx, queue.KeyProcessing).Result()
	if processing != 0 {
		t.Errorf("expected 0 items in processing after ScheduleRetry, got %d", processing)
	}

	// Retry sorted set should have 1 entry.
	retryCount, _ := client.ZCard(ctx, queue.KeyRetry).Result()
	if retryCount != 1 {
		t.Errorf("expected 1 item in retry set, got %d", retryCount)
	}

	// Wait a tiny bit to ensure the retry score is in the past.
	time.Sleep(5 * time.Millisecond)

	// PollRetries should move the job back to pending.
	if err := scheduler.PollRetries(ctx); err != nil {
		t.Fatalf("PollRetries() error = %v", err)
	}

	// Retry set should be empty; pending should have 1 item.
	retryCount, _ = client.ZCard(ctx, queue.KeyRetry).Result()
	pending, _ := client.LLen(ctx, queue.KeyPending).Result()
	if retryCount != 0 {
		t.Errorf("expected 0 items in retry set after PollRetries, got %d", retryCount)
	}
	if pending != 1 {
		t.Errorf("expected 1 item in pending after PollRetries, got %d", pending)
	}
}

// TestQueue_DeadLetterLifecycle tests Enqueue → Dequeue → SendToDeadLetter.
// Verifies the job appears in the dead letter list.
func TestQueue_DeadLetterLifecycle(t *testing.T) {
	client := testutil.SetupTestRedis(t)
	testutil.FlushRedis(t, client)
	ctx := context.Background()

	producer := queue.NewProducer(client)
	consumer := queue.NewConsumer(client)

	payload := queue.JobPayload{
		JobID:        uuid.New(),
		ContentID:    uuid.New(),
		UserID:       "user-dead",
		ContentType:  "link",
		AttemptCount: 5,
		MaxAttempts:  5,
	}

	if err := producer.Enqueue(ctx, payload); err != nil {
		t.Fatalf("Enqueue() error = %v", err)
	}

	got, err := consumer.Dequeue(ctx, 2*time.Second)
	if err != nil {
		t.Fatalf("Dequeue() error = %v", err)
	}
	if got == nil {
		t.Fatal("Dequeue() returned nil")
	}

	if err := consumer.SendToDeadLetter(ctx, *got); err != nil {
		t.Fatalf("SendToDeadLetter() error = %v", err)
	}

	// Processing must be empty.
	processing, _ := client.LLen(ctx, queue.KeyProcessing).Result()
	if processing != 0 {
		t.Errorf("expected 0 items in processing after SendToDeadLetter, got %d", processing)
	}

	// Dead letter list must have 1 item.
	dead, _ := client.LLen(ctx, queue.KeyDead).Result()
	if dead != 1 {
		t.Fatalf("expected 1 item in dead list, got %d", dead)
	}

	// The payload must round-trip correctly.
	raw, err := client.LIndex(ctx, queue.KeyDead, 0).Result()
	if err != nil {
		t.Fatalf("LIndex(dead, 0) error = %v", err)
	}
	var stored queue.JobPayload
	if err := json.Unmarshal([]byte(raw), &stored); err != nil {
		t.Fatalf("unmarshal dead-letter payload: %v", err)
	}
	if stored.JobID != payload.JobID {
		t.Errorf("dead-letter JobID mismatch: got %v, want %v", stored.JobID, payload.JobID)
	}
}

// TestQueue_OrphanRecovery manually pushes a job to the processing list without
// acquiring a lock, then calls RecoverOrphans and verifies the job moves to pending.
func TestQueue_OrphanRecovery(t *testing.T) {
	client := testutil.SetupTestRedis(t)
	testutil.FlushRedis(t, client)
	ctx := context.Background()

	scheduler := queue.NewRetryScheduler(client, slog.Default())

	orphan := queue.JobPayload{
		JobID:       uuid.New(),
		ContentID:   uuid.New(),
		UserID:      "user-orphan",
		ContentType: "image",
		MaxAttempts: 3,
	}

	// Manually push the job to the processing list (simulating a crash where the
	// lock was never acquired or has already expired).
	data, err := json.Marshal(orphan)
	if err != nil {
		t.Fatalf("marshal orphan: %v", err)
	}
	if err := client.LPush(ctx, queue.KeyProcessing, data).Err(); err != nil {
		t.Fatalf("LPush(processing) error = %v", err)
	}

	// Confirm no lock exists for this job.
	lockKey := queue.KeyLockPrefix + orphan.JobID.String()
	exists, _ := client.Exists(ctx, lockKey).Result()
	if exists != 0 {
		t.Fatal("expected lock to not exist before RecoverOrphans")
	}

	// RecoverOrphans should detect the missing lock and move the job to pending.
	if err := scheduler.RecoverOrphans(ctx); err != nil {
		t.Fatalf("RecoverOrphans() error = %v", err)
	}

	processing, _ := client.LLen(ctx, queue.KeyProcessing).Result()
	pending, _ := client.LLen(ctx, queue.KeyPending).Result()

	if processing != 0 {
		t.Errorf("expected 0 items in processing after RecoverOrphans, got %d", processing)
	}
	if pending != 1 {
		t.Errorf("expected 1 item in pending after RecoverOrphans, got %d", pending)
	}

	// Verify the recovered payload is correct.
	raw, err := client.LIndex(ctx, queue.KeyPending, 0).Result()
	if err != nil {
		t.Fatalf("LIndex(pending, 0) error = %v", err)
	}
	var recovered queue.JobPayload
	if err := json.Unmarshal([]byte(raw), &recovered); err != nil {
		t.Fatalf("unmarshal recovered payload: %v", err)
	}
	if recovered.JobID != orphan.JobID {
		t.Errorf("recovered JobID mismatch: got %v, want %v", recovered.JobID, orphan.JobID)
	}
}

// TestQueue_LockExpiry acquires a lock with a short TTL and confirms the key
// disappears from Redis after the TTL elapses.
func TestQueue_LockExpiry(t *testing.T) {
	client := testutil.SetupTestRedis(t)
	testutil.FlushRedis(t, client)
	ctx := context.Background()

	consumer := queue.NewConsumer(client)
	jobID := uuid.New().String()

	// Acquire lock with a 100ms TTL.
	acquired, err := consumer.AcquireLock(ctx, jobID, 100*time.Millisecond)
	if err != nil {
		t.Fatalf("AcquireLock() error = %v", err)
	}
	if !acquired {
		t.Fatal("AcquireLock() = false, want true")
	}

	// Lock must exist immediately after acquisition.
	exists, _ := client.Exists(ctx, queue.KeyLockPrefix+jobID).Result()
	if exists != 1 {
		t.Error("expected lock key to exist immediately after AcquireLock")
	}

	// Wait for the TTL to elapse.
	time.Sleep(200 * time.Millisecond)

	// Lock must be gone.
	exists, err = client.Exists(ctx, queue.KeyLockPrefix+jobID).Result()
	if err != nil {
		t.Fatalf("Exists() error = %v", err)
	}
	if exists != 0 {
		t.Errorf("expected lock key to be expired, but it still exists")
	}
}
