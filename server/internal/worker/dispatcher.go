package worker

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"os"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/ksushant6566/mindtab/server/internal/queue"
	"github.com/ksushant6566/mindtab/server/internal/store"
)

// Dispatcher orchestrates job processing using registered Processors.
type Dispatcher struct {
	consumer   *queue.Consumer
	retry      *queue.RetryScheduler
	queries    store.Querier
	logger     *slog.Logger
	processors map[string]Processor
	workers    int
	wg         sync.WaitGroup
	quit       chan struct{}
	cancel     context.CancelFunc
}

// NewDispatcher creates a Dispatcher with the given dependencies.
func NewDispatcher(
	consumer *queue.Consumer,
	retry *queue.RetryScheduler,
	queries store.Querier,
	logger *slog.Logger,
	workers int,
) *Dispatcher {
	return &Dispatcher{
		consumer:   consumer,
		retry:      retry,
		queries:    queries,
		logger:     logger,
		processors: make(map[string]Processor),
		workers:    workers,
		quit:       make(chan struct{}),
	}
}

// Register adds a Processor for its declared content type.
func (d *Dispatcher) Register(p Processor) {
	d.processors[p.ContentType()] = p
}

// Start launches N worker goroutines and the retry poller.
func (d *Dispatcher) Start(ctx context.Context) {
	ctx, cancel := context.WithCancel(ctx)
	d.cancel = cancel

	for i := 0; i < d.workers; i++ {
		d.wg.Add(1)
		go d.runWorker(ctx, i)
	}

	d.wg.Add(1)
	go d.runRetryPoller(ctx)
}

// Stop signals all goroutines and waits up to 30 seconds for them to finish.
func (d *Dispatcher) Stop() {
	if d.cancel != nil {
		d.cancel()
	}
	close(d.quit)
	done := make(chan struct{})
	go func() {
		d.wg.Wait()
		close(done)
	}()

	select {
	case <-done:
	case <-time.After(30 * time.Second):
		d.logger.Warn("dispatcher shutdown timed out after 30s")
	}
}

// runWorker is the main loop for a single worker goroutine.
func (d *Dispatcher) runWorker(ctx context.Context, id int) {
	defer d.wg.Done()
	d.logger.Info("worker started", "worker_id", id)

	for {
		select {
		case <-d.quit:
			d.logger.Info("worker stopping", "worker_id", id)
			return
		default:
		}

		payload, err := d.consumer.Dequeue(ctx, 2*time.Second)
		if err != nil {
			d.logger.Error("dequeue error", "worker_id", id, "error", err)
			continue
		}
		if payload == nil {
			// Timeout — no jobs, loop again
			continue
		}

		d.processJob(ctx, payload)
	}
}

// runRetryPoller polls the retry sorted set every 5 seconds.
func (d *Dispatcher) runRetryPoller(ctx context.Context) {
	defer d.wg.Done()
	ticker := time.NewTicker(5 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-d.quit:
			return
		case <-ticker.C:
			if err := d.retry.PollRetries(ctx); err != nil {
				d.logger.Error("retry poll error", "error", err)
			}
		}
	}
}

// processJob executes all steps of a single job.
func (d *Dispatcher) processJob(ctx context.Context, payload *queue.JobPayload) {
	jobIDStr := payload.JobID.String()
	log := d.logger.With("job_id", jobIDStr, "content_type", payload.ContentType)

	// Acquire distributed lock (5-minute TTL).
	locked, err := d.consumer.AcquireLock(ctx, jobIDStr, 5*time.Minute)
	if err != nil {
		log.Error("lock acquire error", "error", err)
		return
	}
	if !locked {
		log.Info("job already locked by another worker, skipping")
		return
	}
	defer d.consumer.ReleaseLock(ctx, jobIDStr)

	// Find the processor for this content type.
	proc, ok := d.processors[payload.ContentType]
	if !ok {
		log.Error("no processor registered for content type")
		d.handleFailure(ctx, payload, fmt.Errorf("no processor for content_type %q", payload.ContentType), true)
		return
	}

	// Mark job as started in DB.
	if err := d.queries.StartJob(ctx, toPgUUID(payload.JobID)); err != nil {
		log.Error("failed to mark job started", "error", err)
		return
	}

	// Build the job struct.
	job := &Job{
		ID:          payload.JobID,
		ContentID:   payload.ContentID,
		UserID:      payload.UserID,
		ContentType: payload.ContentType,
		SourceURL:   payload.SourceURL,
	}

	// Load image data from temp file if this is an image job.
	if payload.TempImagePath != "" {
		data, err := os.ReadFile(payload.TempImagePath)
		if err != nil {
			log.Error("failed to read temp image file", "path", payload.TempImagePath, "error", err)
			d.handleFailure(ctx, payload, fmt.Errorf("read temp image: %w", err), false)
			return
		}
		job.ImageData = data
		job.ImageType = payload.ImageMIME
	}

	// Load previous step results from the payload.
	prevResults := make(StepResults)
	for k, v := range payload.StepResults {
		vBytes, err := json.Marshal(v)
		if err != nil {
			log.Warn("failed to marshal previous step result", "step", k, "error", err)
			continue
		}
		prevResults[k] = &StepResult{Data: json.RawMessage(vBytes)}
	}

	// Execute each step sequentially.
	steps := proc.Steps()
	for _, step := range steps {
		// Skip already-completed steps (resume from checkpoint).
		if _, done := prevResults[step]; done {
			log.Info("skipping completed step", "step", step)
			continue
		}

		log.Info("executing step", "step", step)
		result, err := proc.Execute(ctx, step, job, prevResults)
		if err != nil {
			log.Error("step failed", "step", step, "error", err)
			d.handleFailure(ctx, payload, fmt.Errorf("step %q: %w", step, err), false)
			return
		}

		prevResults[step] = result

		// Checkpoint step results to DB.
		if err := d.checkpointStepResults(ctx, payload.JobID, prevResults, step); err != nil {
			log.Error("failed to checkpoint step results", "step", step, "error", err)
			d.handleFailure(ctx, payload, fmt.Errorf("checkpoint step %q: %w", step, err), false)
			return
		}
	}

	// All steps complete — mark job and content completed.
	if err := d.queries.CompleteJob(ctx, toPgUUID(payload.JobID)); err != nil {
		log.Error("failed to mark job completed", "error", err)
	}
	if err := d.queries.UpdateContentStatus(ctx, store.UpdateContentStatusParams{
		ID:               toPgUUID(payload.ContentID),
		ProcessingStatus: "completed",
	}); err != nil {
		log.Error("failed to mark content completed", "error", err)
	}

	// Remove from processing list.
	if err := d.consumer.Complete(ctx, *payload); err != nil {
		log.Error("failed to remove job from processing list", "error", err)
	}

	// Clean up temp image file.
	if payload.TempImagePath != "" {
		if err := os.Remove(payload.TempImagePath); err != nil && !os.IsNotExist(err) {
			log.Warn("failed to remove temp image file", "path", payload.TempImagePath, "error", err)
		}
	}

	log.Info("job completed successfully")
}

// checkpointStepResults serialises current step results and persists them to DB.
func (d *Dispatcher) checkpointStepResults(ctx context.Context, jobID uuid.UUID, results StepResults, currentStep string) error {
	data, err := json.Marshal(results)
	if err != nil {
		return fmt.Errorf("marshal step results: %w", err)
	}

	return d.queries.UpdateJobStepResults(ctx, store.UpdateJobStepResultsParams{
		ID:          toPgUUID(jobID),
		StepResults: data,
		CurrentStep: pgtype.Text{String: currentStep, Valid: true},
	})
}

// handleFailure increments attempt count, either schedules a retry or sends to dead letter.
func (d *Dispatcher) handleFailure(ctx context.Context, payload *queue.JobPayload, jobErr error, permanent bool) {
	log := d.logger.With("job_id", payload.JobID.String())

	newAttempt := payload.AttemptCount + 1

	if permanent || newAttempt >= payload.MaxAttempts {
		log.Warn("sending job to dead letter queue", "attempts", newAttempt, "max", payload.MaxAttempts, "permanent", permanent)

		// Mark job and content as failed in DB.
		_ = d.queries.FailJob(ctx, store.FailJobParams{
			ID:        toPgUUID(payload.JobID),
			LastError: pgtype.Text{String: jobErr.Error(), Valid: true},
		})
		_ = d.queries.UpdateContentStatus(ctx, store.UpdateContentStatusParams{
			ID:               toPgUUID(payload.ContentID),
			ProcessingStatus: "failed",
			ProcessingError:  pgtype.Text{String: jobErr.Error(), Valid: true},
		})

		if err := d.consumer.SendToDeadLetter(ctx, *payload); err != nil {
			log.Error("failed to send to dead letter queue", "error", err)
		}
		return
	}

	log.Warn("scheduling job retry", "attempt", newAttempt, "max", payload.MaxAttempts)

	// Persist incremented attempt count and error.
	_ = d.queries.UpdateJobStatus(ctx, store.UpdateJobStatusParams{
		ID:           toPgUUID(payload.JobID),
		Status:       "pending",
		CurrentStep:  pgtype.Text{String: payload.CurrentStep, Valid: payload.CurrentStep != ""},
		LastError:    pgtype.Text{String: jobErr.Error(), Valid: true},
		AttemptCount: int32(newAttempt),
	})

	updated := *payload
	updated.AttemptCount = newAttempt

	if err := d.retry.ScheduleRetry(ctx, updated, 30*time.Second); err != nil {
		log.Error("failed to schedule retry", "error", err)
	}
}

// ptrStr returns a pointer to the given string.
func ptrStr(s string) *string {
	return &s
}

// toPgUUID converts a uuid.UUID to pgtype.UUID.
func toPgUUID(id uuid.UUID) pgtype.UUID {
	return pgtype.UUID{Bytes: id, Valid: true}
}
