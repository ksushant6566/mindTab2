ALTER TABLE tasks
    ADD COLUMN scheduled_start_at TIMESTAMPTZ,
    ADD COLUMN scheduled_end_at TIMESTAMPTZ,
    ADD CONSTRAINT tasks_schedule_range_check CHECK (
        (scheduled_start_at IS NULL AND scheduled_end_at IS NULL)
        OR (
            scheduled_start_at IS NOT NULL
            AND scheduled_end_at IS NOT NULL
            AND scheduled_end_at > scheduled_start_at
        )
    );
