DROP TABLE IF EXISTS note_habits;
DROP TABLE IF EXISTS habit_records;
DROP TABLE IF EXISTS habits;

ALTER TABLE users DROP COLUMN IF EXISTS xp;

DROP TYPE IF EXISTS habit_tracker_status;
DROP TYPE IF EXISTS habit_tracker;
DROP TYPE IF EXISTS habit_frequency;
