package chat

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/ksushant6566/mindtab/server/internal/providers/llm"
	"github.com/ksushant6566/mindtab/server/internal/store"
)

// ---------------------------------------------------------------------------
// ListJournalsTool
// ---------------------------------------------------------------------------

// ListJournalsArgs holds arguments for the list_journals tool.
type ListJournalsArgs struct {
	ProjectID *string `json:"project_id" validate:"omitempty,uuid"`
}

// ListJournalsTool lists journal entries, optionally filtered by project.
type ListJournalsTool struct {
	queries store.Querier
}

func (t *ListJournalsTool) Name() string { return "list_journals" }

func (t *ListJournalsTool) Description() string {
	return "List journal entries, optionally filtered by project."
}

func (t *ListJournalsTool) Schema() llm.ToolDefinition {
	return llm.ToolDefinition{
		Name:        t.Name(),
		Description: t.Description(),
		Parameters: jsonSchema("object", map[string]interface{}{
			"project_id": jsonSchema("string", nil, "Filter by project UUID"),
		}),
	}
}

func (t *ListJournalsTool) ParseArgs(raw json.RawMessage) (any, error) {
	var args ListJournalsArgs
	if err := json.Unmarshal(raw, &args); err != nil {
		return nil, fmt.Errorf("parse list_journals args: %w", err)
	}
	return &args, nil
}

func (t *ListJournalsTool) Execute(ctx context.Context, userID string, args any) (any, error) {
	a := args.(*ListJournalsArgs)

	var projectID pgtype.UUID
	if a.ProjectID != nil {
		uid, err := uuid.Parse(*a.ProjectID)
		if err != nil {
			return nil, fmt.Errorf("invalid project_id: %w", err)
		}
		projectID = pgtype.UUID{Bytes: uid, Valid: true}
	}

	rows, err := t.queries.ListJournals(ctx, store.ListJournalsParams{
		UserID:  userID,
		Column2: projectID,
	})
	if err != nil {
		return nil, fmt.Errorf("list journals: %w", err)
	}

	type journalItem struct {
		ID        string `json:"id"`
		Title     string `json:"title"`
		Snippet   string `json:"snippet"`
		UpdatedAt string `json:"updated_at"`
	}

	journals := make([]journalItem, 0, len(rows))
	for _, j := range rows {
		snippet := j.Content
		if len(snippet) > 200 {
			snippet = snippet[:200] + "..."
		}
		journals = append(journals, journalItem{
			ID:        uuidToString(j.ID),
			Title:     j.Title,
			Snippet:   snippet,
			UpdatedAt: timestamptzToString(j.UpdatedAt),
		})
	}

	return map[string]interface{}{"journals": journals}, nil
}

// ---------------------------------------------------------------------------
// CreateJournalTool
// ---------------------------------------------------------------------------

// CreateJournalArgs holds arguments for the create_journal tool.
type CreateJournalArgs struct {
	Title   string `json:"title"   validate:"required,min=1"`
	Content string `json:"content" validate:"required,min=1"`
}

// CreateJournalTool creates a new journal entry.
type CreateJournalTool struct {
	queries store.Querier
}

func (t *CreateJournalTool) Name() string { return "create_journal" }

func (t *CreateJournalTool) Description() string {
	return "Create a new journal entry."
}

func (t *CreateJournalTool) Schema() llm.ToolDefinition {
	return llm.ToolDefinition{
		Name:        t.Name(),
		Description: t.Description(),
		Parameters: jsonSchemaWithRequired("object", map[string]interface{}{
			"title":   jsonSchema("string", nil, "Title of the journal entry"),
			"content": jsonSchema("string", nil, "Content/body of the journal entry"),
		}, []string{"title", "content"}),
	}
}

func (t *CreateJournalTool) ParseArgs(raw json.RawMessage) (any, error) {
	var args CreateJournalArgs
	if err := json.Unmarshal(raw, &args); err != nil {
		return nil, fmt.Errorf("parse create_journal args: %w", err)
	}
	return &args, nil
}

func (t *CreateJournalTool) Execute(ctx context.Context, userID string, args any) (any, error) {
	a := args.(*CreateJournalArgs)

	err := t.queries.CreateJournal(ctx, store.CreateJournalParams{
		Title:   a.Title,
		Content: a.Content,
		UserID:  userID,
	})
	if err != nil {
		return nil, fmt.Errorf("create journal: %w", err)
	}

	return map[string]interface{}{
		"title":  a.Title,
		"status": "created",
	}, nil
}

// ---------------------------------------------------------------------------
// UpdateJournalTool
// ---------------------------------------------------------------------------

// UpdateJournalArgs holds arguments for the update_journal tool.
type UpdateJournalArgs struct {
	ID      string  `json:"id"      validate:"required,uuid"`
	Title   *string `json:"title"   validate:"omitempty,min=1"`
	Content *string `json:"content"`
}

// UpdateJournalTool updates a journal entry's title or content.
type UpdateJournalTool struct {
	queries store.Querier
}

func (t *UpdateJournalTool) Name() string { return "update_journal" }

func (t *UpdateJournalTool) Description() string {
	return "Update a journal entry's title or content."
}

func (t *UpdateJournalTool) Schema() llm.ToolDefinition {
	return llm.ToolDefinition{
		Name:        t.Name(),
		Description: t.Description(),
		Parameters: jsonSchemaWithRequired("object", map[string]interface{}{
			"id":      jsonSchema("string", nil, "Journal UUID"),
			"title":   jsonSchema("string", nil, "New title"),
			"content": jsonSchema("string", nil, "New content"),
		}, []string{"id"}),
	}
}

func (t *UpdateJournalTool) ParseArgs(raw json.RawMessage) (any, error) {
	var args UpdateJournalArgs
	if err := json.Unmarshal(raw, &args); err != nil {
		return nil, fmt.Errorf("parse update_journal args: %w", err)
	}
	return &args, nil
}

func (t *UpdateJournalTool) Execute(ctx context.Context, userID string, args any) (any, error) {
	a := args.(*UpdateJournalArgs)

	journalUUID, err := uuid.Parse(a.ID)
	if err != nil {
		return nil, fmt.Errorf("invalid journal id: %w", err)
	}
	pgID := pgtype.UUID{Bytes: journalUUID, Valid: true}

	// Fetch existing journal to fill in unchanged fields
	existing, err := t.queries.GetJournalByID(ctx, store.GetJournalByIDParams{
		ID:     pgID,
		UserID: userID,
	})
	if err != nil {
		return nil, fmt.Errorf("get journal: %w", err)
	}

	title := existing.Title
	if a.Title != nil {
		title = *a.Title
	}

	content := existing.Content
	if a.Content != nil {
		content = *a.Content
	}

	err = t.queries.UpdateJournal(ctx, store.UpdateJournalParams{
		ID:        pgID,
		UserID:    userID,
		Title:     title,
		Content:   content,
		ProjectID: existing.ProjectID,
	})
	if err != nil {
		return nil, fmt.Errorf("update journal: %w", err)
	}

	return map[string]interface{}{
		"id":    a.ID,
		"title": title,
	}, nil
}

// ---------------------------------------------------------------------------
// DeleteJournalTool
// ---------------------------------------------------------------------------

// DeleteJournalArgs holds arguments for the delete_journal tool.
type DeleteJournalArgs struct {
	ID string `json:"id" validate:"required,uuid"`
}

// DeleteJournalTool soft-deletes a journal entry.
type DeleteJournalTool struct {
	queries store.Querier
}

func (t *DeleteJournalTool) Name() string { return "delete_journal" }

func (t *DeleteJournalTool) Description() string {
	return "Soft-delete a journal entry."
}

func (t *DeleteJournalTool) Schema() llm.ToolDefinition {
	return llm.ToolDefinition{
		Name:        t.Name(),
		Description: t.Description(),
		Parameters: jsonSchemaWithRequired("object", map[string]interface{}{
			"id": jsonSchema("string", nil, "Journal UUID"),
		}, []string{"id"}),
	}
}

func (t *DeleteJournalTool) ParseArgs(raw json.RawMessage) (any, error) {
	var args DeleteJournalArgs
	if err := json.Unmarshal(raw, &args); err != nil {
		return nil, fmt.Errorf("parse delete_journal args: %w", err)
	}
	return &args, nil
}

func (t *DeleteJournalTool) Execute(ctx context.Context, userID string, args any) (any, error) {
	a := args.(*DeleteJournalArgs)

	journalUUID, err := uuid.Parse(a.ID)
	if err != nil {
		return nil, fmt.Errorf("invalid journal id: %w", err)
	}

	err = t.queries.DeleteJournal(ctx, store.DeleteJournalParams{
		ID:     pgtype.UUID{Bytes: journalUUID, Valid: true},
		UserID: userID,
	})
	if err != nil {
		return nil, fmt.Errorf("delete journal: %w", err)
	}

	return map[string]interface{}{"success": true}, nil
}
