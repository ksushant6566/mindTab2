package worker

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/alicebob/miniredis/v2"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/ksushant6566/mindtab/server/internal/providers"
	"github.com/ksushant6566/mindtab/server/internal/queue"
	"github.com/ksushant6566/mindtab/server/internal/store"
	"github.com/redis/go-redis/v9"
)

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// mockProcessor implements the Processor interface for testing.
type mockProcessor struct {
	contentType string
	steps       []string
	lockTTL     time.Duration
	executeFn   func(ctx context.Context, step string, job *Job, prev StepResults) (*StepResult, error)
}

func (m *mockProcessor) ContentType() string { return m.contentType }
func (m *mockProcessor) Steps() []string     { return m.steps }
func (m *mockProcessor) LockTTL() time.Duration {
	if m.lockTTL == 0 {
		return 30 * time.Second
	}
	return m.lockTTL
}
func (m *mockProcessor) Execute(ctx context.Context, step string, job *Job, prev StepResults) (*StepResult, error) {
	return m.executeFn(ctx, step, job, prev)
}

// newTestRedis creates a miniredis instance and a connected redis.Client.
func newTestRedis(t *testing.T) (*miniredis.Miniredis, *redis.Client) {
	t.Helper()
	mr := miniredis.RunT(t)
	client := redis.NewClient(&redis.Options{Addr: mr.Addr()})
	t.Cleanup(func() { client.Close() })
	return mr, client
}

// newTestDispatcher wires up a Dispatcher with real Redis-backed consumer and
// retry scheduler, plus the given mock querier.
func newTestDispatcher(t *testing.T, client *redis.Client, queries store.Querier) *Dispatcher {
	t.Helper()
	consumer := queue.NewConsumer(client)
	retry := queue.NewRetryScheduler(client, slog.Default())
	return NewDispatcher(consumer, retry, queries, slog.Default(), 1)
}

func TestDispatcherCleanupVideoTempDirUsesConfiguredPath(t *testing.T) {
	base := t.TempDir()
	jobID := uuid.New()
	tempDir := filepath.Join(base, jobID.String())
	if err := os.MkdirAll(tempDir, 0o755); err != nil {
		t.Fatalf("mkdir temp dir: %v", err)
	}

	d := NewDispatcher(nil, nil, nil, slog.Default(), 1, WithVideoTempPath(base))
	d.cleanupVideoTempDir(&queue.JobPayload{
		JobID:       jobID,
		ContentType: "youtube",
	})

	if _, err := os.Stat(tempDir); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("temp dir still exists or unexpected stat error: %v", err)
	}
}

// enqueuePayload pushes a serialised JobPayload onto the Redis pending list.
func enqueuePayload(t *testing.T, client *redis.Client, payload queue.JobPayload) {
	t.Helper()
	data, err := json.Marshal(payload)
	if err != nil {
		t.Fatalf("marshal payload: %v", err)
	}
	if err := client.LPush(context.Background(), queue.KeyPending, data).Err(); err != nil {
		t.Fatalf("lpush pending: %v", err)
	}
}

// listItems retrieves all items in a Redis list via miniredis.
func listItems(t *testing.T, mr *miniredis.Miniredis, key string) []string {
	t.Helper()
	items, err := mr.List(key)
	if err != nil {
		return nil
	}
	return items
}

// noopQuerierMock returns a QuerierMock where every job-related method is a
// silent no-op.  Tests that care about specific calls can override individual
// funcs after creation.
func noopQuerierMock() *store.QuerierMock {
	return &store.QuerierMock{
		StartJobFunc: func(ctx context.Context, id pgtype.UUID) error {
			return nil
		},
		CompleteJobFunc: func(ctx context.Context, id pgtype.UUID) error {
			return nil
		},
		FailJobFunc: func(ctx context.Context, arg store.FailJobParams) error {
			return nil
		},
		UpdateContentStatusFunc: func(ctx context.Context, arg store.UpdateContentStatusParams) error {
			return nil
		},
		UpdateJobStepResultsFunc: func(ctx context.Context, arg store.UpdateJobStepResultsParams) error {
			return nil
		},
		UpdateJobStatusFunc: func(ctx context.Context, arg store.UpdateJobStatusParams) error {
			return nil
		},
		GetContentByIDFunc: func(ctx context.Context, arg store.GetContentByIDParams) (store.GetContentByIDRow, error) {
			return store.GetContentByIDRow{}, nil
		},
	}
}

// newPayload creates a baseline JobPayload for tests.
func newPayload(contentType string) queue.JobPayload {
	return queue.JobPayload{
		JobID:       uuid.New(),
		ContentID:   uuid.New(),
		UserID:      "test-user",
		ContentType: contentType,
		MaxAttempts: 3,
	}
}

// waitForCondition polls fn until it returns true or timeout expires.
func waitForCondition(t *testing.T, timeout time.Duration, interval time.Duration, fn func() bool) {
	t.Helper()
	deadline := time.After(timeout)
	for {
		if fn() {
			return
		}
		select {
		case <-deadline:
			t.Fatal("timed out waiting for condition")
		default:
			time.Sleep(interval)
		}
	}
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

// 1. TestDispatcher_HappyPath — register a mock processor, enqueue a job, start
// dispatcher, verify job completed.
func TestDispatcher_HappyPath(t *testing.T) {
	mr, client := newTestRedis(t)
	queries := noopQuerierMock()

	var completedJobID atomic.Value

	queries.CompleteJobFunc = func(ctx context.Context, id pgtype.UUID) error {
		uid := uuid.UUID(id.Bytes)
		completedJobID.Store(uid)
		return nil
	}

	d := newTestDispatcher(t, client, queries)

	var executedSteps []string
	var mu sync.Mutex
	proc := &mockProcessor{
		contentType: "article",
		steps:       []string{"extract", "summarize", "embed"},
		executeFn: func(ctx context.Context, step string, job *Job, prev StepResults) (*StepResult, error) {
			mu.Lock()
			executedSteps = append(executedSteps, step)
			mu.Unlock()
			return &StepResult{Data: json.RawMessage(`{"ok":true}`)}, nil
		},
	}
	d.Register(proc)

	payload := newPayload("article")
	enqueuePayload(t, client, payload)

	ctx, cancel := context.WithCancel(context.Background())
	d.Start(ctx)

	// Wait for the job to be completed.
	waitForCondition(t, 5*time.Second, 50*time.Millisecond, func() bool {
		v := completedJobID.Load()
		if v == nil {
			return false
		}
		return v.(uuid.UUID) == payload.JobID
	})

	cancel()
	d.Stop()

	// Verify all three steps were executed in order.
	mu.Lock()
	defer mu.Unlock()
	if len(executedSteps) != 3 {
		t.Fatalf("expected 3 steps executed, got %d: %v", len(executedSteps), executedSteps)
	}
	expected := []string{"extract", "summarize", "embed"}
	for i, s := range expected {
		if executedSteps[i] != s {
			t.Errorf("step %d: got %q, want %q", i, executedSteps[i], s)
		}
	}

	// Processing list should be empty.
	processingItems := listItems(t, mr, queue.KeyProcessing)
	if len(processingItems) != 0 {
		t.Errorf("expected processing list empty, got %d items", len(processingItems))
	}
}

// 2. TestDispatcher_UnknownContentType — enqueue job with unknown type, verify
// it ends up in the dead letter queue.
func TestDispatcher_UnknownContentType(t *testing.T) {
	mr, client := newTestRedis(t)
	queries := noopQuerierMock()

	var failJobCalled atomic.Bool
	queries.FailJobFunc = func(ctx context.Context, arg store.FailJobParams) error {
		failJobCalled.Store(true)
		return nil
	}

	d := newTestDispatcher(t, client, queries)
	// Do NOT register any processor.

	payload := newPayload("unknown_type")
	enqueuePayload(t, client, payload)

	ctx, cancel := context.WithCancel(context.Background())
	d.Start(ctx)

	// Wait for the job to land in the dead letter queue.
	waitForCondition(t, 5*time.Second, 50*time.Millisecond, func() bool {
		items := listItems(t, mr, queue.KeyDead)
		return len(items) > 0
	})

	cancel()
	d.Stop()

	deadItems := listItems(t, mr, queue.KeyDead)
	if len(deadItems) != 1 {
		t.Fatalf("expected 1 dead letter item, got %d", len(deadItems))
	}

	if !failJobCalled.Load() {
		t.Error("expected FailJob to be called for unknown content type")
	}
}

// 3. TestDispatcher_CheckpointResume — enqueue job with step_results already
// containing completed steps, verify it resumes from the next step.
func TestDispatcher_CheckpointResume(t *testing.T) {
	_, client := newTestRedis(t)
	queries := noopQuerierMock()

	var completedJobCalled atomic.Bool
	queries.CompleteJobFunc = func(ctx context.Context, id pgtype.UUID) error {
		completedJobCalled.Store(true)
		return nil
	}

	d := newTestDispatcher(t, client, queries)

	var executedSteps []string
	var mu sync.Mutex
	proc := &mockProcessor{
		contentType: "article",
		steps:       []string{"extract", "summarize", "embed"},
		executeFn: func(ctx context.Context, step string, job *Job, prev StepResults) (*StepResult, error) {
			mu.Lock()
			executedSteps = append(executedSteps, step)
			mu.Unlock()
			return &StepResult{Data: json.RawMessage(`{"ok":true}`)}, nil
		},
	}
	d.Register(proc)

	// Pre-populate step_results for "extract" — only "summarize" and "embed"
	// should be executed.
	payload := newPayload("article")
	payload.StepResults = map[string]any{
		"extract": map[string]any{"data": map[string]any{"ok": true}},
	}
	enqueuePayload(t, client, payload)

	ctx, cancel := context.WithCancel(context.Background())
	d.Start(ctx)

	waitForCondition(t, 5*time.Second, 50*time.Millisecond, func() bool {
		return completedJobCalled.Load()
	})

	cancel()
	d.Stop()

	mu.Lock()
	defer mu.Unlock()
	if len(executedSteps) != 2 {
		t.Fatalf("expected 2 steps executed (skipping extract), got %d: %v", len(executedSteps), executedSteps)
	}
	if executedSteps[0] != "summarize" || executedSteps[1] != "embed" {
		t.Errorf("expected [summarize embed], got %v", executedSteps)
	}
}

// 4. TestDispatcher_RetriableError — processor returns retriable error, verify
// job is scheduled for retry (appears in retry sorted set).
func TestDispatcher_RetriableError(t *testing.T) {
	mr, client := newTestRedis(t)
	queries := noopQuerierMock()

	var updateJobStatusCalled atomic.Bool
	queries.UpdateJobStatusFunc = func(ctx context.Context, arg store.UpdateJobStatusParams) error {
		updateJobStatusCalled.Store(true)
		return nil
	}

	d := newTestDispatcher(t, client, queries)

	proc := &mockProcessor{
		contentType: "article",
		steps:       []string{"extract"},
		executeFn: func(ctx context.Context, step string, job *Job, prev StepResults) (*StepResult, error) {
			return nil, providers.NewRetriableError("test-provider", fmt.Errorf("rate limited"))
		},
	}
	d.Register(proc)

	payload := newPayload("article")
	payload.AttemptCount = 0
	payload.MaxAttempts = 3
	enqueuePayload(t, client, payload)

	ctx, cancel := context.WithCancel(context.Background())
	d.Start(ctx)

	// Wait for the job to appear in the retry sorted set.
	waitForCondition(t, 5*time.Second, 50*time.Millisecond, func() bool {
		members, _ := mr.ZMembers(queue.KeyRetry)
		return len(members) > 0
	})

	cancel()
	d.Stop()

	retryMembers, _ := mr.ZMembers(queue.KeyRetry)
	if len(retryMembers) != 1 {
		t.Fatalf("expected 1 retry member, got %d", len(retryMembers))
	}

	// Verify the payload in the retry set has incremented attempt count.
	var retried queue.JobPayload
	if err := json.Unmarshal([]byte(retryMembers[0]), &retried); err != nil {
		t.Fatalf("unmarshal retry payload: %v", err)
	}
	if retried.AttemptCount != 1 {
		t.Errorf("expected attempt_count=1, got %d", retried.AttemptCount)
	}

	if !updateJobStatusCalled.Load() {
		t.Error("expected UpdateJobStatus to be called for retry")
	}

	// Dead letter queue should be empty.
	deadItems := listItems(t, mr, queue.KeyDead)
	if len(deadItems) != 0 {
		t.Errorf("expected no dead letter items, got %d", len(deadItems))
	}
}

// 5. TestDispatcher_PermanentError — processor returns permanent error, verify
// job is sent to dead letter queue.
func TestDispatcher_PermanentError(t *testing.T) {
	mr, client := newTestRedis(t)
	queries := noopQuerierMock()

	var failJobCalled atomic.Bool
	queries.FailJobFunc = func(ctx context.Context, arg store.FailJobParams) error {
		failJobCalled.Store(true)
		return nil
	}

	d := newTestDispatcher(t, client, queries)

	proc := &mockProcessor{
		contentType: "article",
		steps:       []string{"extract"},
		executeFn: func(ctx context.Context, step string, job *Job, prev StepResults) (*StepResult, error) {
			return nil, providers.NewPermanentError("test-provider", fmt.Errorf("invalid input"))
		},
	}
	d.Register(proc)

	payload := newPayload("article")
	payload.AttemptCount = 0
	payload.MaxAttempts = 3
	enqueuePayload(t, client, payload)

	ctx, cancel := context.WithCancel(context.Background())
	d.Start(ctx)

	waitForCondition(t, 5*time.Second, 50*time.Millisecond, func() bool {
		items := listItems(t, mr, queue.KeyDead)
		return len(items) > 0
	})

	cancel()
	d.Stop()

	deadItems := listItems(t, mr, queue.KeyDead)
	if len(deadItems) != 1 {
		t.Fatalf("expected 1 dead letter item, got %d", len(deadItems))
	}

	if !failJobCalled.Load() {
		t.Error("expected FailJob to be called for permanent error")
	}

	// Retry set should be empty.
	retryMembers, _ := mr.ZMembers(queue.KeyRetry)
	if len(retryMembers) != 0 {
		t.Errorf("expected no retry members, got %d", len(retryMembers))
	}
}

// 6. TestDispatcher_MaxAttempts — job at max attempts with a retriable error
// should still go to dead letter queue.
func TestDispatcher_MaxAttempts(t *testing.T) {
	mr, client := newTestRedis(t)
	queries := noopQuerierMock()

	var failJobCalled atomic.Bool
	queries.FailJobFunc = func(ctx context.Context, arg store.FailJobParams) error {
		failJobCalled.Store(true)
		return nil
	}

	d := newTestDispatcher(t, client, queries)

	proc := &mockProcessor{
		contentType: "article",
		steps:       []string{"extract"},
		executeFn: func(ctx context.Context, step string, job *Job, prev StepResults) (*StepResult, error) {
			// Retriable error, but attempt count is at max.
			return nil, providers.NewRetriableError("test-provider", fmt.Errorf("timeout"))
		},
	}
	d.Register(proc)

	payload := newPayload("article")
	payload.AttemptCount = 2 // Already at attempt 2, max is 3 => next attempt (3) >= max
	payload.MaxAttempts = 3
	enqueuePayload(t, client, payload)

	ctx, cancel := context.WithCancel(context.Background())
	d.Start(ctx)

	waitForCondition(t, 5*time.Second, 50*time.Millisecond, func() bool {
		items := listItems(t, mr, queue.KeyDead)
		return len(items) > 0
	})

	cancel()
	d.Stop()

	deadItems := listItems(t, mr, queue.KeyDead)
	if len(deadItems) != 1 {
		t.Fatalf("expected 1 dead letter item, got %d", len(deadItems))
	}

	if !failJobCalled.Load() {
		t.Error("expected FailJob to be called when max attempts exceeded")
	}

	// Retry set should remain empty — no retry when at max attempts.
	retryMembers, _ := mr.ZMembers(queue.KeyRetry)
	if len(retryMembers) != 0 {
		t.Errorf("expected no retry members, got %d", len(retryMembers))
	}
}

// 7. TestDispatcher_LockAcquired — verify lock is acquired before processing.
func TestDispatcher_LockAcquired(t *testing.T) {
	_, client := newTestRedis(t)
	queries := noopQuerierMock()

	d := newTestDispatcher(t, client, queries)

	var lockHeld atomic.Bool
	proc := &mockProcessor{
		contentType: "article",
		steps:       []string{"extract"},
		lockTTL:     10 * time.Second,
		executeFn: func(ctx context.Context, step string, job *Job, prev StepResults) (*StepResult, error) {
			// While processing, check that a lock key exists in Redis.
			lockKey := queue.KeyLockPrefix + job.ID.String()
			exists, err := client.Exists(ctx, lockKey).Result()
			if err == nil && exists == 1 {
				lockHeld.Store(true)
			}
			return &StepResult{Data: json.RawMessage(`{}`)}, nil
		},
	}
	d.Register(proc)

	payload := newPayload("article")
	enqueuePayload(t, client, payload)

	ctx, cancel := context.WithCancel(context.Background())
	d.Start(ctx)

	waitForCondition(t, 5*time.Second, 50*time.Millisecond, func() bool {
		return lockHeld.Load()
	})

	cancel()
	d.Stop()

	if !lockHeld.Load() {
		t.Error("expected lock to be held during processing")
	}
}

// 8. TestDispatcher_LockContention — lock already held by another worker, job
// should not be processed.
func TestDispatcher_LockContention(t *testing.T) {
	_, client := newTestRedis(t)
	queries := noopQuerierMock()

	consumer := queue.NewConsumer(client)
	retry := queue.NewRetryScheduler(client, slog.Default())
	d := NewDispatcher(consumer, retry, queries, slog.Default(), 1)

	var executed atomic.Bool
	proc := &mockProcessor{
		contentType: "article",
		steps:       []string{"extract"},
		lockTTL:     30 * time.Second,
		executeFn: func(ctx context.Context, step string, job *Job, prev StepResults) (*StepResult, error) {
			executed.Store(true)
			return &StepResult{Data: json.RawMessage(`{}`)}, nil
		},
	}
	d.Register(proc)

	payload := newPayload("article")

	// Pre-acquire the lock for this job (simulating another worker holding it).
	lockKey := queue.KeyLockPrefix + payload.JobID.String()
	if err := client.Set(context.Background(), lockKey, "locked", 30*time.Second).Err(); err != nil {
		t.Fatalf("failed to pre-set lock: %v", err)
	}

	// Call processJob directly to avoid async timing issues.
	d.processJob(context.Background(), &payload)

	// The processor should NOT have been called since lock was already held.
	if executed.Load() {
		t.Error("expected processor NOT to execute when lock is already held")
	}
}

// 9. TestDispatcher_GracefulShutdown — cancel context, verify worker exits
// without hanging.
func TestDispatcher_GracefulShutdown(t *testing.T) {
	_, client := newTestRedis(t)
	queries := noopQuerierMock()
	d := newTestDispatcher(t, client, queries)

	ctx, cancel := context.WithCancel(context.Background())
	d.Start(ctx)

	// Let the worker loop start and block on dequeue.
	time.Sleep(100 * time.Millisecond)

	cancel()

	// Stop should return within a reasonable time (well under the 30s timeout).
	done := make(chan struct{})
	go func() {
		d.Stop()
		close(done)
	}()

	select {
	case <-done:
		// Graceful shutdown successful.
	case <-time.After(5 * time.Second):
		t.Fatal("dispatcher did not shut down within 5 seconds")
	}
}

// 10. TestDispatcher_ImageJob — image job is dispatched and completed successfully.
// NOTE: Temp-file loading is intentionally removed from the payload in Task 5.
// Tasks 6-7 will introduce the permanent-storage image flow.
func TestDispatcher_ImageJob(t *testing.T) {
	_, client := newTestRedis(t)
	queries := noopQuerierMock()

	var completedJobCalled atomic.Bool
	queries.CompleteJobFunc = func(ctx context.Context, id pgtype.UUID) error {
		completedJobCalled.Store(true)
		return nil
	}

	d := newTestDispatcher(t, client, queries)

	proc := &mockProcessor{
		contentType: "image",
		steps:       []string{"vision", "embed"},
		executeFn: func(ctx context.Context, step string, job *Job, prev StepResults) (*StepResult, error) {
			return &StepResult{Data: json.RawMessage(`{"ok":true}`)}, nil
		},
	}
	d.Register(proc)

	payload := newPayload("image")
	enqueuePayload(t, client, payload)

	ctx, cancel := context.WithCancel(context.Background())
	d.Start(ctx)

	waitForCondition(t, 5*time.Second, 50*time.Millisecond, func() bool {
		return completedJobCalled.Load()
	})

	cancel()
	d.Stop()
}
