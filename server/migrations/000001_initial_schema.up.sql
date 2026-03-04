-- Enums (idempotent)
DO $$ BEGIN CREATE TYPE goal_status AS ENUM ('pending', 'in_progress', 'completed', 'archived'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE goal_priority AS ENUM ('priority_1', 'priority_2', 'priority_3', 'priority_4'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE goal_impact AS ENUM ('low', 'medium', 'high'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE habit_frequency AS ENUM ('daily', 'weekly'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE habit_tracker AS ENUM ('daily', 'weekly', 'monthly'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE habit_tracker_status AS ENUM ('pending', 'completed'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE journal_type AS ENUM ('article', 'book', 'video', 'podcast', 'website'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE project_status AS ENUM ('active', 'paused', 'completed', 'archived'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Users
CREATE TABLE IF NOT EXISTS mindmap_user (
    id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(255),
    email VARCHAR(255) NOT NULL,
    email_verified TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    image VARCHAR(255),
    xp INTEGER NOT NULL DEFAULT 0,
    onboarding_completed BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ
);

-- Projects
CREATE TABLE IF NOT EXISTS mindmap_project (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(256),
    description TEXT,
    status project_status NOT NULL DEFAULT 'active',
    start_date DATE NOT NULL,
    end_date DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ,
    created_by VARCHAR(255) NOT NULL REFERENCES mindmap_user(id),
    last_updated_by VARCHAR(255) NOT NULL REFERENCES mindmap_user(id),
    deleted_at TIMESTAMPTZ
);

-- Goals
CREATE TABLE IF NOT EXISTS mindmap_goal (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(256),
    description TEXT,
    status goal_status NOT NULL DEFAULT 'pending',
    priority goal_priority NOT NULL DEFAULT 'priority_1',
    impact goal_impact NOT NULL DEFAULT 'medium',
    position INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    deleted_at TIMESTAMPTZ,
    user_id VARCHAR(255) NOT NULL REFERENCES mindmap_user(id),
    project_id UUID REFERENCES mindmap_project(id) ON DELETE SET NULL
);

-- Habits
CREATE TABLE IF NOT EXISTS mindmap_habit (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(256),
    description TEXT,
    frequency habit_frequency NOT NULL DEFAULT 'daily',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ,
    deleted_at TIMESTAMPTZ,
    user_id VARCHAR(255) NOT NULL REFERENCES mindmap_user(id)
);

-- Habit Tracker
CREATE TABLE IF NOT EXISTS mindmap_habit_tracker (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    habit_id UUID NOT NULL REFERENCES mindmap_habit(id) ON DELETE CASCADE,
    status habit_tracker_status NOT NULL DEFAULT 'pending',
    date DATE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ,
    user_id VARCHAR(255) NOT NULL REFERENCES mindmap_user(id)
);

-- Journals
CREATE TABLE IF NOT EXISTS mindmap_journal (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(256) NOT NULL,
    content TEXT NOT NULL,
    type journal_type NOT NULL DEFAULT 'article',
    source VARCHAR(256) NOT NULL DEFAULT 'mindmap',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ,
    user_id VARCHAR(255) NOT NULL REFERENCES mindmap_user(id),
    project_id UUID REFERENCES mindmap_project(id) ON DELETE SET NULL,
    deleted_at TIMESTAMPTZ,
    archived_at TIMESTAMPTZ
);

-- Journal-Goals junction
CREATE TABLE IF NOT EXISTS mindmap_journal_goal (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    journal_id UUID NOT NULL REFERENCES mindmap_journal(id) ON DELETE CASCADE,
    goal_id UUID NOT NULL REFERENCES mindmap_goal(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ
);

-- Journal-Habits junction
CREATE TABLE IF NOT EXISTS mindmap_journal_habits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    journal_id UUID NOT NULL REFERENCES mindmap_journal(id) ON DELETE CASCADE,
    habit_id UUID NOT NULL REFERENCES mindmap_habit(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ
);

-- Refresh tokens (NEW table for JWT auth)
CREATE TABLE IF NOT EXISTS mindmap_refresh_token (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR(255) NOT NULL REFERENCES mindmap_user(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX IF NOT EXISTS goal_user_id_idx ON mindmap_goal(user_id);
CREATE INDEX IF NOT EXISTS goal_position_idx ON mindmap_goal(position);
CREATE INDEX IF NOT EXISTS goal_project_id_idx ON mindmap_goal(project_id);
CREATE UNIQUE INDEX IF NOT EXISTS habit_title_user_id_unique_idx ON mindmap_habit(user_id, title);
CREATE INDEX IF NOT EXISTS habit_user_id_idx ON mindmap_habit(user_id);
CREATE INDEX IF NOT EXISTS habit_tracker_habit_id_user_id_idx ON mindmap_habit_tracker(habit_id, user_id);
CREATE UNIQUE INDEX IF NOT EXISTS habit_tracker_habit_id_user_id_date_idx ON mindmap_habit_tracker(habit_id, user_id, date);
CREATE UNIQUE INDEX IF NOT EXISTS journal_title_user_id_unique_idx ON mindmap_journal(user_id, title);
CREATE INDEX IF NOT EXISTS journal_user_id_idx ON mindmap_journal(user_id);
CREATE INDEX IF NOT EXISTS journal_project_id_idx ON mindmap_journal(project_id);
CREATE UNIQUE INDEX IF NOT EXISTS journal_goal_idx ON mindmap_journal_goal(journal_id, goal_id);
CREATE INDEX IF NOT EXISTS journal_goal_journal_id_idx ON mindmap_journal_goal(journal_id);
CREATE INDEX IF NOT EXISTS journal_goal_goal_id_idx ON mindmap_journal_goal(goal_id);
CREATE UNIQUE INDEX IF NOT EXISTS journal_habit_idx ON mindmap_journal_habits(journal_id, habit_id);
CREATE INDEX IF NOT EXISTS journal_habits_journal_id_idx ON mindmap_journal_habits(journal_id);
CREATE INDEX IF NOT EXISTS journal_habits_habit_id_idx ON mindmap_journal_habits(habit_id);
CREATE INDEX IF NOT EXISTS project_created_by_idx ON mindmap_project(created_by);
CREATE INDEX IF NOT EXISTS project_last_updated_by_idx ON mindmap_project(last_updated_by);
CREATE INDEX IF NOT EXISTS project_status_idx ON mindmap_project(status);
CREATE INDEX IF NOT EXISTS refresh_token_user_id_idx ON mindmap_refresh_token(user_id);
