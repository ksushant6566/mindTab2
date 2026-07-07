DO $$ BEGIN CREATE TYPE habit_frequency AS ENUM ('daily', 'weekly'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE habit_tracker_status AS ENUM ('pending', 'completed'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE users ADD COLUMN IF NOT EXISTS xp INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS habits (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title TEXT,
    description TEXT,
    frequency habit_frequency NOT NULL DEFAULT 'daily',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ,
    deleted_at TIMESTAMPTZ,
    user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS habit_records (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    habit_id UUID NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
    user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status habit_tracker_status NOT NULL DEFAULT 'pending',
    date DATE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS note_habits (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    note_id UUID NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
    habit_id UUID NOT NULL REFERENCES habits(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS habits_title_user_id_unique_idx ON habits(user_id, title);
CREATE INDEX IF NOT EXISTS habits_user_id_idx ON habits(user_id);
CREATE INDEX IF NOT EXISTS habit_records_habit_id_user_id_idx ON habit_records(habit_id, user_id);
CREATE UNIQUE INDEX IF NOT EXISTS habit_records_habit_id_user_id_date_idx ON habit_records(habit_id, user_id, date);
CREATE UNIQUE INDEX IF NOT EXISTS note_habits_note_id_habit_id_unique_idx ON note_habits(note_id, habit_id);
CREATE INDEX IF NOT EXISTS note_habits_note_id_idx ON note_habits(note_id);
CREATE INDEX IF NOT EXISTS note_habits_habit_id_idx ON note_habits(habit_id);
