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
// ListNotesTool
// ---------------------------------------------------------------------------

// ListNotesArgs holds arguments for the list_notes tool.
type ListNotesArgs struct {
	ProjectID *string `json:"project_id" validate:"omitempty,uuid"`
}

// ListNotesTool lists note entries, optionally filtered by project.
type ListNotesTool struct {
	queries store.Querier
}

// NewListNotesTool returns a new ListNotesTool.
func NewListNotesTool(queries store.Querier) *ListNotesTool {
	return &ListNotesTool{queries: queries}
}

func (t *ListNotesTool) Name() string { return "list_notes" }

func (t *ListNotesTool) Description() string {
	return "List note entries, optionally filtered by project."
}

func (t *ListNotesTool) Schema() llm.ToolDefinition {
	return llm.ToolDefinition{
		Name:        t.Name(),
		Description: t.Description(),
		Parameters: jsonSchema("object", map[string]interface{}{
			"project_id": jsonSchema("string", nil, "Filter by project UUID"),
		}),
	}
}

func (t *ListNotesTool) ParseArgs(raw json.RawMessage) (any, error) {
	var args ListNotesArgs
	if err := json.Unmarshal(raw, &args); err != nil {
		return nil, fmt.Errorf("parse list_notes args: %w", err)
	}
	return &args, nil
}

func (t *ListNotesTool) Execute(ctx context.Context, userID string, args any) (any, error) {
	a := args.(*ListNotesArgs)

	var projectID pgtype.UUID
	if a.ProjectID != nil {
		uid, err := uuid.Parse(*a.ProjectID)
		if err != nil {
			return nil, fmt.Errorf("invalid project_id: %w", err)
		}
		projectID = pgtype.UUID{Bytes: uid, Valid: true}
	}

	rows, err := t.queries.ListNotes(ctx, store.ListNotesParams{
		UserID:  userID,
		Column2: projectID,
	})
	if err != nil {
		return nil, fmt.Errorf("list notes: %w", err)
	}

	type noteItem struct {
		ID        string `json:"id"`
		Title     string `json:"title"`
		Snippet   string `json:"snippet"`
		UpdatedAt string `json:"updated_at"`
	}

	notes := make([]noteItem, 0, len(rows))
	for _, j := range rows {
		snippet := j.Content
		if len(snippet) > 200 {
			snippet = snippet[:200] + "..."
		}
		notes = append(notes, noteItem{
			ID:        uuidToString(j.ID),
			Title:     j.Title,
			Snippet:   snippet,
			UpdatedAt: timestamptzToString(j.UpdatedAt),
		})
	}

	return map[string]interface{}{"notes": notes}, nil
}

// ---------------------------------------------------------------------------
// CreateNoteTool
// ---------------------------------------------------------------------------

// CreateNoteArgs holds arguments for the create_note tool.
type CreateNoteArgs struct {
	Title   string `json:"title"   validate:"required,min=1"`
	Content string `json:"content" validate:"required,min=1"`
}

// CreateNoteTool creates a new note entry.
type CreateNoteTool struct {
	queries store.Querier
}

// NewCreateNoteTool returns a new CreateNoteTool.
func NewCreateNoteTool(queries store.Querier) *CreateNoteTool {
	return &CreateNoteTool{queries: queries}
}

func (t *CreateNoteTool) Name() string { return "create_note" }

func (t *CreateNoteTool) Description() string {
	return "Create a new note entry."
}

func (t *CreateNoteTool) Schema() llm.ToolDefinition {
	return llm.ToolDefinition{
		Name:        t.Name(),
		Description: t.Description(),
		Parameters: jsonSchemaWithRequired("object", map[string]interface{}{
			"title":   jsonSchema("string", nil, "Title of the note entry"),
			"content": jsonSchema("string", nil, "Content/body of the note entry"),
		}, []string{"title", "content"}),
	}
}

func (t *CreateNoteTool) ParseArgs(raw json.RawMessage) (any, error) {
	var args CreateNoteArgs
	if err := json.Unmarshal(raw, &args); err != nil {
		return nil, fmt.Errorf("parse create_note args: %w", err)
	}
	return &args, nil
}

func (t *CreateNoteTool) Execute(ctx context.Context, userID string, args any) (any, error) {
	a := args.(*CreateNoteArgs)

	err := t.queries.CreateNote(ctx, store.CreateNoteParams{
		Title:   a.Title,
		Content: a.Content,
		UserID:  userID,
	})
	if err != nil {
		return nil, fmt.Errorf("create note: %w", err)
	}

	return map[string]interface{}{
		"title":  a.Title,
		"status": "created",
	}, nil
}

// ---------------------------------------------------------------------------
// UpdateNoteTool
// ---------------------------------------------------------------------------

// UpdateNoteArgs holds arguments for the update_note tool.
type UpdateNoteArgs struct {
	ID      string  `json:"id"      validate:"required,uuid"`
	Title   *string `json:"title"   validate:"omitempty,min=1"`
	Content *string `json:"content"`
}

// UpdateNoteTool updates a note entry's title or content.
type UpdateNoteTool struct {
	queries store.Querier
}

// NewUpdateNoteTool returns a new UpdateNoteTool.
func NewUpdateNoteTool(queries store.Querier) *UpdateNoteTool {
	return &UpdateNoteTool{queries: queries}
}

func (t *UpdateNoteTool) Name() string { return "update_note" }

func (t *UpdateNoteTool) Description() string {
	return "Update a note entry's title or content."
}

func (t *UpdateNoteTool) Schema() llm.ToolDefinition {
	return llm.ToolDefinition{
		Name:        t.Name(),
		Description: t.Description(),
		Parameters: jsonSchemaWithRequired("object", map[string]interface{}{
			"id":      jsonSchema("string", nil, "Note UUID"),
			"title":   jsonSchema("string", nil, "New title"),
			"content": jsonSchema("string", nil, "New content"),
		}, []string{"id"}),
	}
}

func (t *UpdateNoteTool) ParseArgs(raw json.RawMessage) (any, error) {
	var args UpdateNoteArgs
	if err := json.Unmarshal(raw, &args); err != nil {
		return nil, fmt.Errorf("parse update_note args: %w", err)
	}
	return &args, nil
}

func (t *UpdateNoteTool) Execute(ctx context.Context, userID string, args any) (any, error) {
	a := args.(*UpdateNoteArgs)

	noteUUID, err := uuid.Parse(a.ID)
	if err != nil {
		return nil, fmt.Errorf("invalid note id: %w", err)
	}
	pgID := pgtype.UUID{Bytes: noteUUID, Valid: true}

	// Fetch existing note to fill in unchanged fields
	existing, err := t.queries.GetNoteByID(ctx, store.GetNoteByIDParams{
		ID:     pgID,
		UserID: userID,
	})
	if err != nil {
		return nil, fmt.Errorf("get note: %w", err)
	}

	title := existing.Title
	if a.Title != nil {
		title = *a.Title
	}

	content := existing.Content
	if a.Content != nil {
		content = *a.Content
	}

	err = t.queries.UpdateNote(ctx, store.UpdateNoteParams{
		ID:      pgID,
		UserID:  userID,
		Title:   title,
		Content: content,
	})
	if err != nil {
		return nil, fmt.Errorf("update note: %w", err)
	}

	return map[string]interface{}{
		"id":    a.ID,
		"title": title,
	}, nil
}

// ---------------------------------------------------------------------------
// DeleteNoteTool
// ---------------------------------------------------------------------------

// DeleteNoteArgs holds arguments for the delete_note tool.
type DeleteNoteArgs struct {
	ID string `json:"id" validate:"required,uuid"`
}

// DeleteNoteTool soft-deletes a note entry.
type DeleteNoteTool struct {
	queries store.Querier
}

// NewDeleteNoteTool returns a new DeleteNoteTool.
func NewDeleteNoteTool(queries store.Querier) *DeleteNoteTool {
	return &DeleteNoteTool{queries: queries}
}

func (t *DeleteNoteTool) Name() string { return "delete_note" }

func (t *DeleteNoteTool) Description() string {
	return "Soft-delete a note entry."
}

func (t *DeleteNoteTool) Schema() llm.ToolDefinition {
	return llm.ToolDefinition{
		Name:        t.Name(),
		Description: t.Description(),
		Parameters: jsonSchemaWithRequired("object", map[string]interface{}{
			"id": jsonSchema("string", nil, "Note UUID"),
		}, []string{"id"}),
	}
}

func (t *DeleteNoteTool) ParseArgs(raw json.RawMessage) (any, error) {
	var args DeleteNoteArgs
	if err := json.Unmarshal(raw, &args); err != nil {
		return nil, fmt.Errorf("parse delete_note args: %w", err)
	}
	return &args, nil
}

func (t *DeleteNoteTool) Execute(ctx context.Context, userID string, args any) (any, error) {
	a := args.(*DeleteNoteArgs)

	noteUUID, err := uuid.Parse(a.ID)
	if err != nil {
		return nil, fmt.Errorf("invalid note id: %w", err)
	}

	err = t.queries.DeleteNote(ctx, store.DeleteNoteParams{
		ID:     pgtype.UUID{Bytes: noteUUID, Valid: true},
		UserID: userID,
	})
	if err != nil {
		return nil, fmt.Errorf("delete note: %w", err)
	}

	return map[string]interface{}{"success": true}, nil
}

// ---------------------------------------------------------------------------
// GetNoteContentTool
// ---------------------------------------------------------------------------

// GetNoteContentArgs holds arguments for the get_note_content tool.
type GetNoteContentArgs struct {
	ID string `json:"id" validate:"required,uuid"`
}

// GetNoteContentTool retrieves the full content of a note entry by ID.
type GetNoteContentTool struct {
	queries store.Querier
}

// NewGetNoteContentTool returns a new GetNoteContentTool.
func NewGetNoteContentTool(queries store.Querier) *GetNoteContentTool {
	return &GetNoteContentTool{queries: queries}
}

func (t *GetNoteContentTool) Name() string { return "get_note_content" }

func (t *GetNoteContentTool) Description() string {
	return "Get the full content of a note entry by ID."
}

func (t *GetNoteContentTool) Schema() llm.ToolDefinition {
	return llm.ToolDefinition{
		Name:        t.Name(),
		Description: t.Description(),
		Parameters: jsonSchemaWithRequired("object", map[string]interface{}{
			"id": jsonSchema("string", nil, "Note UUID"),
		}, []string{"id"}),
	}
}

func (t *GetNoteContentTool) ParseArgs(raw json.RawMessage) (any, error) {
	var args GetNoteContentArgs
	if err := json.Unmarshal(raw, &args); err != nil {
		return nil, fmt.Errorf("parse get_note_content args: %w", err)
	}
	return &args, nil
}

func (t *GetNoteContentTool) Execute(ctx context.Context, userID string, args any) (any, error) {
	a := args.(*GetNoteContentArgs)

	noteUUID, err := uuid.Parse(a.ID)
	if err != nil {
		return nil, fmt.Errorf("invalid note id: %w", err)
	}
	pgID := pgtype.UUID{Bytes: noteUUID, Valid: true}

	j, err := t.queries.GetNoteByID(ctx, store.GetNoteByIDParams{
		ID:     pgID,
		UserID: userID,
	})
	if err != nil {
		return nil, fmt.Errorf("get note: %w", err)
	}

	return map[string]interface{}{
		"id":           uuidToString(j.ID),
		"title":        j.Title,
		"content":      j.Content,
		"type":         j.Type,
		"project_id":   uuidToString(j.ProjectID),
		"project_name": pgtextToString(j.ProjectName),
		"created_at":   timestamptzToString(j.CreatedAt),
		"updated_at":   timestamptzToString(j.UpdatedAt),
	}, nil
}

// ---------------------------------------------------------------------------
// SearchNotesTool
// ---------------------------------------------------------------------------

// SearchNotesArgs holds arguments for the search_notes tool.
type SearchNotesArgs struct {
	Query string `json:"query" validate:"required,min=1"`
}

// SearchNotesTool searches note entries by title keyword.
type SearchNotesTool struct {
	queries store.Querier
}

// NewSearchNotesTool returns a new SearchNotesTool.
func NewSearchNotesTool(queries store.Querier) *SearchNotesTool {
	return &SearchNotesTool{queries: queries}
}

func (t *SearchNotesTool) Name() string { return "search_notes" }

func (t *SearchNotesTool) Description() string {
	return "Search note entries by title keyword."
}

func (t *SearchNotesTool) Schema() llm.ToolDefinition {
	return llm.ToolDefinition{
		Name:        t.Name(),
		Description: t.Description(),
		Parameters: jsonSchemaWithRequired("object", map[string]interface{}{
			"query": jsonSchema("string", nil, "Search keyword to match against note titles"),
		}, []string{"query"}),
	}
}

func (t *SearchNotesTool) ParseArgs(raw json.RawMessage) (any, error) {
	var args SearchNotesArgs
	if err := json.Unmarshal(raw, &args); err != nil {
		return nil, fmt.Errorf("parse search_notes args: %w", err)
	}
	return &args, nil
}

func (t *SearchNotesTool) Execute(ctx context.Context, userID string, args any) (any, error) {
	a := args.(*SearchNotesArgs)

	rows, err := t.queries.SearchNotes(ctx, store.SearchNotesParams{
		UserID:  userID,
		Column2: pgtype.Text{String: a.Query, Valid: true},
	})
	if err != nil {
		return nil, fmt.Errorf("search notes: %w", err)
	}

	type noteItem struct {
		ID        string `json:"id"`
		Title     string `json:"title"`
		Snippet   string `json:"snippet"`
		Type      any    `json:"type"`
		UpdatedAt string `json:"updated_at"`
	}

	notes := make([]noteItem, 0, len(rows))
	for _, j := range rows {
		snippet := j.Content
		if len(snippet) > 200 {
			snippet = snippet[:200] + "..."
		}
		notes = append(notes, noteItem{
			ID:        uuidToString(j.ID),
			Title:     j.Title,
			Snippet:   snippet,
			Type:      j.Type,
			UpdatedAt: timestamptzToString(j.UpdatedAt),
		})
	}

	return map[string]interface{}{"notes": notes}, nil
}
