ALTER TABLE mindmap_user RENAME TO users;
ALTER TABLE mindmap_project RENAME TO projects;
ALTER TABLE mindmap_goal RENAME TO tasks;
ALTER TABLE mindmap_habit RENAME TO habits;
ALTER TABLE mindmap_habit_tracker RENAME TO habit_records;
ALTER TABLE mindmap_journal RENAME TO notes;
ALTER TABLE mindmap_journal_goal RENAME TO note_tasks;
ALTER TABLE mindmap_journal_habits RENAME TO note_habits;
ALTER TABLE mindmap_refresh_token RENAME TO refresh_tokens;
ALTER TABLE mindmap_verification_token RENAME TO verification_tokens;
ALTER TABLE mindmap_content RENAME TO content;
ALTER TABLE mindmap_jobs RENAME TO jobs;
ALTER TABLE mindmap_conversations RENAME TO conversations;
ALTER TABLE mindmap_messages RENAME TO messages;

ALTER TABLE note_tasks RENAME COLUMN journal_id TO note_id;
ALTER TABLE note_tasks RENAME COLUMN goal_id TO task_id;
ALTER TABLE note_habits RENAME COLUMN journal_id TO note_id;

ALTER INDEX IF EXISTS idx_mindmap_user_email RENAME TO idx_users_email;

ALTER INDEX IF EXISTS project_created_by_idx RENAME TO projects_created_by_idx;
ALTER INDEX IF EXISTS project_last_updated_by_idx RENAME TO projects_last_updated_by_idx;
ALTER INDEX IF EXISTS project_status_idx RENAME TO projects_status_idx;

ALTER INDEX IF EXISTS goal_user_id_idx RENAME TO tasks_user_id_idx;
ALTER INDEX IF EXISTS goal_position_idx RENAME TO tasks_position_idx;
ALTER INDEX IF EXISTS goal_project_id_idx RENAME TO tasks_project_id_idx;

ALTER INDEX IF EXISTS habit_title_user_id_unique_idx RENAME TO habits_title_user_id_unique_idx;
ALTER INDEX IF EXISTS habit_user_id_idx RENAME TO habits_user_id_idx;

ALTER INDEX IF EXISTS habit_tracker_habit_id_user_id_idx RENAME TO habit_records_habit_id_user_id_idx;
ALTER INDEX IF EXISTS habit_tracker_habit_id_user_id_date_idx RENAME TO habit_records_habit_id_user_id_date_idx;

ALTER INDEX IF EXISTS journal_title_user_id_unique_idx RENAME TO notes_title_user_id_unique_idx;
ALTER INDEX IF EXISTS journal_user_id_idx RENAME TO notes_user_id_idx;
ALTER INDEX IF EXISTS journal_project_id_idx RENAME TO notes_project_id_idx;

ALTER INDEX IF EXISTS journal_goal_idx RENAME TO note_tasks_note_id_task_id_unique_idx;
ALTER INDEX IF EXISTS journal_goal_journal_id_idx RENAME TO note_tasks_note_id_idx;
ALTER INDEX IF EXISTS journal_goal_goal_id_idx RENAME TO note_tasks_task_id_idx;

ALTER INDEX IF EXISTS journal_habit_idx RENAME TO note_habits_note_id_habit_id_unique_idx;
ALTER INDEX IF EXISTS journal_habits_journal_id_idx RENAME TO note_habits_note_id_idx;
ALTER INDEX IF EXISTS journal_habits_habit_id_idx RENAME TO note_habits_habit_id_idx;

ALTER INDEX IF EXISTS refresh_token_user_id_idx RENAME TO refresh_tokens_user_id_idx;

ALTER INDEX IF EXISTS idx_verification_token_user_id RENAME TO idx_verification_tokens_user_id;

ALTER INDEX IF EXISTS idx_mindmap_content_drafts RENAME TO idx_content_drafts;



