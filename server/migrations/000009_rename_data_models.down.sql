ALTER TABLE messages RENAME CONSTRAINT messages_role_check TO mindmap_messages_role_check;
ALTER TABLE messages RENAME CONSTRAINT messages_conversation_id_fkey TO mindmap_messages_conversation_id_fkey;
ALTER TABLE messages RENAME CONSTRAINT messages_pkey TO mindmap_messages_pkey;

ALTER TABLE conversations RENAME CONSTRAINT conversations_user_id_fkey TO mindmap_conversations_user_id_fkey;
ALTER TABLE conversations RENAME CONSTRAINT conversations_pkey TO mindmap_conversations_pkey;

ALTER TABLE jobs RENAME CONSTRAINT jobs_user_id_fkey TO mindmap_jobs_user_id_fkey;
ALTER TABLE jobs RENAME CONSTRAINT jobs_content_id_fkey TO mindmap_jobs_content_id_fkey;
ALTER TABLE jobs RENAME CONSTRAINT jobs_pkey TO mindmap_jobs_pkey;

ALTER TABLE content RENAME CONSTRAINT content_source_metadata_object TO mindmap_content_source_metadata_object;
ALTER TABLE content RENAME CONSTRAINT content_user_id_fkey TO mindmap_content_user_id_fkey;
ALTER TABLE content RENAME CONSTRAINT content_pkey TO mindmap_content_pkey;
ALTER INDEX IF EXISTS idx_content_drafts RENAME TO idx_mindmap_content_drafts;

ALTER INDEX IF EXISTS idx_verification_tokens_user_id RENAME TO idx_verification_token_user_id;
ALTER TABLE verification_tokens RENAME CONSTRAINT verification_tokens_user_id_fkey TO mindmap_verification_token_user_id_fkey;
ALTER TABLE verification_tokens RENAME CONSTRAINT verification_tokens_token_hash_key TO mindmap_verification_token_token_hash_key;
ALTER TABLE verification_tokens RENAME CONSTRAINT verification_tokens_pkey TO mindmap_verification_token_pkey;

ALTER INDEX IF EXISTS refresh_tokens_user_id_idx RENAME TO refresh_token_user_id_idx;
ALTER TABLE refresh_tokens RENAME CONSTRAINT refresh_tokens_user_id_fkey TO mindmap_refresh_token_user_id_fkey;
ALTER TABLE refresh_tokens RENAME CONSTRAINT refresh_tokens_token_hash_key TO mindmap_refresh_token_token_hash_key;
ALTER TABLE refresh_tokens RENAME CONSTRAINT refresh_tokens_pkey TO mindmap_refresh_token_pkey;

ALTER INDEX IF EXISTS note_habits_habit_id_idx RENAME TO journal_habits_habit_id_idx;
ALTER INDEX IF EXISTS note_habits_note_id_idx RENAME TO journal_habits_journal_id_idx;
ALTER INDEX IF EXISTS note_habits_note_id_habit_id_unique_idx RENAME TO journal_habit_idx;
ALTER TABLE note_habits RENAME CONSTRAINT note_habits_habit_id_fkey TO mindmap_journal_habits_habit_id_fkey;
ALTER TABLE note_habits RENAME CONSTRAINT note_habits_note_id_fkey TO mindmap_journal_habits_journal_id_fkey;
ALTER TABLE note_habits RENAME CONSTRAINT note_habits_pkey TO mindmap_journal_habits_pkey;

ALTER INDEX IF EXISTS note_tasks_task_id_idx RENAME TO journal_goal_goal_id_idx;
ALTER INDEX IF EXISTS note_tasks_note_id_idx RENAME TO journal_goal_journal_id_idx;
ALTER INDEX IF EXISTS note_tasks_note_id_task_id_unique_idx RENAME TO journal_goal_idx;
ALTER TABLE note_tasks RENAME CONSTRAINT note_tasks_task_id_fkey TO mindmap_journal_goal_goal_id_fkey;
ALTER TABLE note_tasks RENAME CONSTRAINT note_tasks_note_id_fkey TO mindmap_journal_goal_journal_id_fkey;
ALTER TABLE note_tasks RENAME CONSTRAINT note_tasks_pkey TO mindmap_journal_goal_pkey;

ALTER INDEX IF EXISTS notes_project_id_idx RENAME TO journal_project_id_idx;
ALTER INDEX IF EXISTS notes_user_id_idx RENAME TO journal_user_id_idx;
ALTER INDEX IF EXISTS notes_title_user_id_unique_idx RENAME TO journal_title_user_id_unique_idx;
ALTER TABLE notes RENAME CONSTRAINT notes_project_id_fkey TO mindmap_journal_project_id_fkey;
ALTER TABLE notes RENAME CONSTRAINT notes_user_id_fkey TO mindmap_journal_user_id_fkey;
ALTER TABLE notes RENAME CONSTRAINT notes_pkey TO mindmap_journal_pkey;

ALTER INDEX IF EXISTS habit_records_habit_id_user_id_date_idx RENAME TO habit_tracker_habit_id_user_id_date_idx;
ALTER INDEX IF EXISTS habit_records_habit_id_user_id_idx RENAME TO habit_tracker_habit_id_user_id_idx;
ALTER TABLE habit_records RENAME CONSTRAINT habit_records_user_id_fkey TO mindmap_habit_tracker_user_id_fkey;
ALTER TABLE habit_records RENAME CONSTRAINT habit_records_habit_id_fkey TO mindmap_habit_tracker_habit_id_fkey;
ALTER TABLE habit_records RENAME CONSTRAINT habit_records_pkey TO mindmap_habit_tracker_pkey;

ALTER INDEX IF EXISTS habits_user_id_idx RENAME TO habit_user_id_idx;
ALTER INDEX IF EXISTS habits_title_user_id_unique_idx RENAME TO habit_title_user_id_unique_idx;
ALTER TABLE habits RENAME CONSTRAINT habits_user_id_fkey TO mindmap_habit_user_id_fkey;
ALTER TABLE habits RENAME CONSTRAINT habits_pkey TO mindmap_habit_pkey;

ALTER INDEX IF EXISTS tasks_project_id_idx RENAME TO goal_project_id_idx;
ALTER INDEX IF EXISTS tasks_position_idx RENAME TO goal_position_idx;
ALTER INDEX IF EXISTS tasks_user_id_idx RENAME TO goal_user_id_idx;
ALTER TABLE tasks RENAME CONSTRAINT tasks_project_id_fkey TO mindmap_goal_project_id_fkey;
ALTER TABLE tasks RENAME CONSTRAINT tasks_user_id_fkey TO mindmap_goal_user_id_fkey;
ALTER TABLE tasks RENAME CONSTRAINT tasks_pkey TO mindmap_goal_pkey;

ALTER INDEX IF EXISTS projects_status_idx RENAME TO project_status_idx;
ALTER INDEX IF EXISTS projects_last_updated_by_idx RENAME TO project_last_updated_by_idx;
ALTER INDEX IF EXISTS projects_created_by_idx RENAME TO project_created_by_idx;
ALTER TABLE projects RENAME CONSTRAINT projects_last_updated_by_fkey TO mindmap_project_last_updated_by_fkey;
ALTER TABLE projects RENAME CONSTRAINT projects_created_by_fkey TO mindmap_project_created_by_fkey;
ALTER TABLE projects RENAME CONSTRAINT projects_pkey TO mindmap_project_pkey;

ALTER INDEX IF EXISTS idx_users_email RENAME TO idx_mindmap_user_email;
ALTER TABLE users RENAME CONSTRAINT users_font_check TO mindmap_user_font_check;
ALTER TABLE users RENAME CONSTRAINT users_theme_check TO mindmap_user_theme_check;
ALTER TABLE users RENAME CONSTRAINT users_pkey TO mindmap_user_pkey;

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
