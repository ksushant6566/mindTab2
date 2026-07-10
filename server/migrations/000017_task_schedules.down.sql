ALTER TABLE tasks
    DROP CONSTRAINT IF EXISTS tasks_schedule_range_check,
    DROP COLUMN IF EXISTS scheduled_end_at,
    DROP COLUMN IF EXISTS scheduled_start_at;
