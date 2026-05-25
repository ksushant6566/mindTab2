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

ALTER TABLE users RENAME CONSTRAINT mindmap_user_pkey TO users_pkey;
ALTER TABLE users RENAME CONSTRAINT mindmap_user_theme_check TO users_theme_check;
ALTER TABLE users RENAME CONSTRAINT mindmap_user_font_check TO users_font_check;
ALTER INDEX IF EXISTS idx_mindmap_user_email RENAME TO idx_users_email;

ALTER TABLE projects RENAME CONSTRAINT mindmap_project_pkey TO projects_pkey;
ALTER TABLE projects RENAME CONSTRAINT mindmap_project_created_by_fkey TO projects_created_by_fkey;
ALTER TABLE projects RENAME CONSTRAINT mindmap_project_last_updated_by_fkey TO projects_last_updated_by_fkey;
ALTER INDEX IF EXISTS project_created_by_idx RENAME TO projects_created_by_idx;
ALTER INDEX IF EXISTS project_last_updated_by_idx RENAME TO projects_last_updated_by_idx;
ALTER INDEX IF EXISTS project_status_idx RENAME TO projects_status_idx;

ALTER TABLE tasks RENAME CONSTRAINT mindmap_goal_pkey TO tasks_pkey;
ALTER TABLE tasks RENAME CONSTRAINT mindmap_goal_user_id_fkey TO tasks_user_id_fkey;
ALTER TABLE tasks RENAME CONSTRAINT mindmap_goal_project_id_fkey TO tasks_project_id_fkey;
ALTER INDEX IF EXISTS goal_user_id_idx RENAME TO tasks_user_id_idx;
ALTER INDEX IF EXISTS goal_position_idx RENAME TO tasks_position_idx;
ALTER INDEX IF EXISTS goal_project_id_idx RENAME TO tasks_project_id_idx;

ALTER TABLE habits RENAME CONSTRAINT mindmap_habit_pkey TO habits_pkey;
ALTER TABLE habits RENAME CONSTRAINT mindmap_habit_user_id_fkey TO habits_user_id_fkey;
ALTER INDEX IF EXISTS habit_title_user_id_unique_idx RENAME TO habits_title_user_id_unique_idx;
ALTER INDEX IF EXISTS habit_user_id_idx RENAME TO habits_user_id_idx;

ALTER TABLE habit_records RENAME CONSTRAINT mindmap_habit_tracker_pkey TO habit_records_pkey;
ALTER TABLE habit_records RENAME CONSTRAINT mindmap_habit_tracker_habit_id_fkey TO habit_records_habit_id_fkey;
ALTER TABLE habit_records RENAME CONSTRAINT mindmap_habit_tracker_user_id_fkey TO habit_records_user_id_fkey;
ALTER INDEX IF EXISTS habit_tracker_habit_id_user_id_idx RENAME TO habit_records_habit_id_user_id_idx;
ALTER INDEX IF EXISTS habit_tracker_habit_id_user_id_date_idx RENAME TO habit_records_habit_id_user_id_date_idx;

ALTER TABLE notes RENAME CONSTRAINT mindmap_journal_pkey TO notes_pkey;
ALTER TABLE notes RENAME CONSTRAINT mindmap_journal_user_id_fkey TO notes_user_id_fkey;
ALTER TABLE notes RENAME CONSTRAINT mindmap_journal_project_id_fkey TO notes_project_id_fkey;
ALTER INDEX IF EXISTS journal_title_user_id_unique_idx RENAME TO notes_title_user_id_unique_idx;
ALTER INDEX IF EXISTS journal_user_id_idx RENAME TO notes_user_id_idx;
ALTER INDEX IF EXISTS journal_project_id_idx RENAME TO notes_project_id_idx;

ALTER TABLE note_tasks RENAME CONSTRAINT mindmap_journal_goal_pkey TO note_tasks_pkey;
ALTER TABLE note_tasks RENAME CONSTRAINT mindmap_journal_goal_journal_id_fkey TO note_tasks_note_id_fkey;
ALTER TABLE note_tasks RENAME CONSTRAINT mindmap_journal_goal_goal_id_fkey TO note_tasks_task_id_fkey;
ALTER INDEX IF EXISTS journal_goal_idx RENAME TO note_tasks_note_id_task_id_unique_idx;
ALTER INDEX IF EXISTS journal_goal_journal_id_idx RENAME TO note_tasks_note_id_idx;
ALTER INDEX IF EXISTS journal_goal_goal_id_idx RENAME TO note_tasks_task_id_idx;

ALTER TABLE note_habits RENAME CONSTRAINT mindmap_journal_habits_pkey TO note_habits_pkey;
ALTER TABLE note_habits RENAME CONSTRAINT mindmap_journal_habits_journal_id_fkey TO note_habits_note_id_fkey;
ALTER TABLE note_habits RENAME CONSTRAINT mindmap_journal_habits_habit_id_fkey TO note_habits_habit_id_fkey;
ALTER INDEX IF EXISTS journal_habit_idx RENAME TO note_habits_note_id_habit_id_unique_idx;
ALTER INDEX IF EXISTS journal_habits_journal_id_idx RENAME TO note_habits_note_id_idx;
ALTER INDEX IF EXISTS journal_habits_habit_id_idx RENAME TO note_habits_habit_id_idx;

ALTER TABLE refresh_tokens RENAME CONSTRAINT mindmap_refresh_token_pkey TO refresh_tokens_pkey;
ALTER TABLE refresh_tokens RENAME CONSTRAINT mindmap_refresh_token_token_hash_key TO refresh_tokens_token_hash_key;
ALTER TABLE refresh_tokens RENAME CONSTRAINT mindmap_refresh_token_user_id_fkey TO refresh_tokens_user_id_fkey;
ALTER INDEX IF EXISTS refresh_token_user_id_idx RENAME TO refresh_tokens_user_id_idx;

ALTER TABLE verification_tokens RENAME CONSTRAINT mindmap_verification_token_pkey TO verification_tokens_pkey;
ALTER TABLE verification_tokens RENAME CONSTRAINT mindmap_verification_token_token_hash_key TO verification_tokens_token_hash_key;
ALTER TABLE verification_tokens RENAME CONSTRAINT mindmap_verification_token_user_id_fkey TO verification_tokens_user_id_fkey;
ALTER INDEX IF EXISTS idx_verification_token_user_id RENAME TO idx_verification_tokens_user_id;

ALTER TABLE content RENAME CONSTRAINT mindmap_content_pkey TO content_pkey;
ALTER TABLE content RENAME CONSTRAINT mindmap_content_user_id_fkey TO content_user_id_fkey;
ALTER TABLE content RENAME CONSTRAINT mindmap_content_source_metadata_object TO content_source_metadata_object;
ALTER INDEX IF EXISTS idx_mindmap_content_drafts RENAME TO idx_content_drafts;

ALTER TABLE jobs RENAME CONSTRAINT mindmap_jobs_pkey TO jobs_pkey;
ALTER TABLE jobs RENAME CONSTRAINT mindmap_jobs_content_id_fkey TO jobs_content_id_fkey;
ALTER TABLE jobs RENAME CONSTRAINT mindmap_jobs_user_id_fkey TO jobs_user_id_fkey;

ALTER TABLE conversations RENAME CONSTRAINT mindmap_conversations_pkey TO conversations_pkey;
ALTER TABLE conversations RENAME CONSTRAINT mindmap_conversations_user_id_fkey TO conversations_user_id_fkey;

ALTER TABLE messages RENAME CONSTRAINT mindmap_messages_pkey TO messages_pkey;
ALTER TABLE messages RENAME CONSTRAINT mindmap_messages_conversation_id_fkey TO messages_conversation_id_fkey;
ALTER TABLE messages RENAME CONSTRAINT mindmap_messages_role_check TO messages_role_check;
