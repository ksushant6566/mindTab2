-- name: CreateJob :one
INSERT INTO mindmap_jobs (content_id, user_id, content_type, status)
VALUES ($1, $2, $3, 'pending')
RETURNING id;

-- name: GetJobByContentID :one
SELECT id, content_id, user_id, content_type, status, current_step,
       attempt_count, max_attempts, last_error, next_retry_at,
       step_results, started_at, completed_at, created_at, updated_at
FROM mindmap_jobs
WHERE content_id = $1;

-- name: UpdateJobStatus :exec
UPDATE mindmap_jobs
SET status = $2,
    current_step = $3,
    last_error = $4,
    attempt_count = $5,
    updated_at = CURRENT_TIMESTAMP
WHERE id = $1;

-- name: UpdateJobStepResults :exec
UPDATE mindmap_jobs
SET step_results = $2,
    current_step = $3,
    updated_at = CURRENT_TIMESTAMP
WHERE id = $1;

-- name: CompleteJob :exec
UPDATE mindmap_jobs
SET status = 'completed',
    completed_at = CURRENT_TIMESTAMP,
    updated_at = CURRENT_TIMESTAMP
WHERE id = $1;

-- name: FailJob :exec
UPDATE mindmap_jobs
SET status = 'failed',
    last_error = $2,
    updated_at = CURRENT_TIMESTAMP
WHERE id = $1;

-- name: StartJob :exec
UPDATE mindmap_jobs
SET status = 'processing',
    started_at = CURRENT_TIMESTAMP,
    updated_at = CURRENT_TIMESTAMP
WHERE id = $1;
