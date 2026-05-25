


ALTER INDEX IF EXISTS idx_content_drafts RENAME TO idx_mindmap_content_drafts;

ALTER INDEX IF EXISTS idx_verification_tokens_user_id RENAME TO idx_verification_token_user_id;

ALTER INDEX IF EXISTS refresh_tokens_user_id_idx RENAME TO refresh_token_user_id_idx;

ALTER INDEX IF EXISTS note_habits_habit_id_idx RENAME TO journal_habits_habit_id_idx;
ALTER INDEX IF EXISTS note_habits_note_id_idx RENAME TO journal_habits_journal_id_idx;
ALTER INDEX IF EXISTS note_habits_note_id_habit_id_unique_idx RENAME TO journal_habit_idx;

ALTER INDEX IF EXISTS note_tasks_task_id_idx RENAME TO journal_goal_goal_id_idx;
ALTER INDEX IF EXISTS note_tasks_note_id_idx RENAME TO journal_goal_journal_id_idx;
ALTER INDEX IF EXISTS note_tasks_note_id_task_id_unique_idx RENAME TO journal_goal_idx;

ALTER INDEX IF EXISTS notes_project_id_idx RENAME TO journal_project_id_idx;
ALTER INDEX IF EXISTS notes_user_id_idx RENAME TO journal_user_id_idx;
ALTER INDEX IF EXISTS notes_title_user_id_unique_idx RENAME TO journal_title_user_id_unique_idx;

ALTER INDEX IF EXISTS habit_records_habit_id_user_id_date_idx RENAME TO habit_tracker_habit_id_user_id_date_idx;
ALTER INDEX IF EXISTS habit_records_habit_id_user_id_idx RENAME TO habit_tracker_habit_id_user_id_idx;

ALTER INDEX IF EXISTS habits_user_id_idx RENAME TO habit_user_id_idx;
ALTER INDEX IF EXISTS habits_title_user_id_unique_idx RENAME TO habit_title_user_id_unique_idx;

ALTER INDEX IF EXISTS tasks_project_id_idx RENAME TO goal_project_id_idx;
ALTER INDEX IF EXISTS tasks_position_idx RENAME TO goal_position_idx;
ALTER INDEX IF EXISTS tasks_user_id_idx RENAME TO goal_user_id_idx;

ALTER INDEX IF EXISTS projects_status_idx RENAME TO project_status_idx;
ALTER INDEX IF EXISTS projects_last_updated_by_idx RENAME TO project_last_updated_by_idx;
ALTER INDEX IF EXISTS projects_created_by_idx RENAME TO project_created_by_idx;

ALTER INDEX IF EXISTS idx_users_email RENAME TO idx_mindmap_user_email;

ALTER TABLE note_habits RENAME COLUMN note_id TO journal_id;
ALTER TABLE note_tasks RENAME COLUMN task_id TO goal_id;
ALTER TABLE note_tasks RENAME COLUMN note_id TO journal_id;

ALTER TABLE messages RENAME TO mindmap_messages;
ALTER TABLE conversations RENAME TO mindmap_conversations;
ALTER TABLE jobs RENAME TO mindmap_jobs;
ALTER TABLE content RENAME TO mindmap_content;
ALTER TABLE verification_tokens RENAME TO mindmap_verification_token;
ALTER TABLE refresh_tokens RENAME TO mindmap_refresh_token;
ALTER TABLE note_habits RENAME TO mindmap_journal_habits;
ALTER TABLE note_tasks RENAME TO mindmap_journal_goal;
ALTER TABLE notes RENAME TO mindmap_journal;
ALTER TABLE habit_records RENAME TO mindmap_habit_tracker;
ALTER TABLE habits RENAME TO mindmap_habit;
ALTER TABLE tasks RENAME TO mindmap_goal;
ALTER TABLE projects RENAME TO mindmap_project;
ALTER TABLE users RENAME TO mindmap_user;
