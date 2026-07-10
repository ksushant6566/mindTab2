package chat

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/ksushant6566/mindtab/server/internal/providers/llm"
	"github.com/ksushant6566/mindtab/server/internal/store"
	"github.com/ksushant6566/mindtab/server/internal/taskstate"
)

// ---------------------------------------------------------------------------
// ListTasksTool
// ---------------------------------------------------------------------------

// ListTasksArgs holds validated arguments for list_tasks.
type ListTasksArgs struct {
	Status    *string `json:"status"     validate:"omitempty,oneof=pending in_progress completed archived"`
	ProjectID *string `json:"project_id" validate:"omitempty,uuid"`
}

// ListTasksTool implements the Tool interface for listing tasks.
type ListTasksTool struct {
	queries store.Querier
}

// NewListTasksTool returns a new ListTasksTool.
func NewListTasksTool(queries store.Querier) *ListTasksTool {
	return &ListTasksTool{queries: queries}
}

func (t *ListTasksTool) Name() string { return "list_tasks" }

func (t *ListTasksTool) Description() string {
	return "List the user's tasks, optionally filtered by status or project. Returns all non-archived tasks by default. Omit status to get all tasks."
}

func (t *ListTasksTool) Schema() llm.ToolDefinition {
	return llm.ToolDefinition{
		Name:        t.Name(),
		Description: t.Description(),
		Parameters: jsonSchema("object", map[string]interface{}{
			"status":     jsonSchemaEnum([]string{"pending", "in_progress", "completed", "archived"}, "Filter by exact status. Omit to return all non-archived tasks."),
			"project_id": jsonSchema("string", nil, "Filter by project UUID"),
		}),
	}
}

func (t *ListTasksTool) ParseArgs(raw json.RawMessage) (any, error) {
	var args ListTasksArgs
	if err := json.Unmarshal(raw, &args); err != nil {
		return nil, fmt.Errorf("parse list_tasks args: %w", err)
	}
	return &args, nil
}

func (t *ListTasksTool) Execute(ctx context.Context, userID string, argsAny any) (any, error) {
	args := argsAny.(*ListTasksArgs)

	var projectID pgtype.UUID
	if args.ProjectID != nil {
		uid, err := uuid.Parse(*args.ProjectID)
		if err != nil {
			return nil, fmt.Errorf("invalid project_id: %w", err)
		}
		projectID = pgtype.UUID{Bytes: uid, Valid: true}
	}

	rows, err := t.queries.ListTasks(ctx, store.ListTasksParams{
		UserID:  userID,
		Column2: false, // do not include archived by default
		Column3: projectID,
	})
	if err != nil {
		return nil, fmt.Errorf("list tasks: %w", err)
	}

	type taskItem struct {
		ID       string  `json:"id"`
		Title    string  `json:"title"`
		Status   string  `json:"status"`
		Priority string  `json:"priority"`
		Project  *string `json:"project,omitempty"`
	}

	tasks := make([]taskItem, 0, len(rows))
	for _, g := range rows {
		// Apply optional status filter client-side
		status := ifaceToString(g.Status)
		if args.Status != nil {
			filter := *args.Status
			// "active" is not a real status — treat it as "not archived/completed"
			if filter == "active" {
				if status == "archived" || status == "completed" {
					continue
				}
			} else if status != filter {
				continue
			}
		}
		var proj *string
		if g.ProjectName.Valid {
			proj = &g.ProjectName.String
		}
		tasks = append(tasks, taskItem{
			ID:       uuidToString(g.ID),
			Title:    pgtextToString(g.Title),
			Status:   status,
			Priority: ifaceToString(g.Priority),
			Project:  proj,
		})
	}

	return map[string]interface{}{"tasks": tasks}, nil
}

// ---------------------------------------------------------------------------
// CreateTaskTool
// ---------------------------------------------------------------------------

// CreateTaskArgs holds validated arguments for create_task.
type CreateTaskArgs struct {
	Title     string  `json:"title"      validate:"required,min=1"`
	Priority  *string `json:"priority"   validate:"omitempty,oneof=priority_1 priority_2 priority_3 priority_4"`
	ProjectID *string `json:"project_id" validate:"omitempty,uuid"`
}

// CreateTaskTool implements the Tool interface for creating a task.
type CreateTaskTool struct {
	queries store.Querier
}

// NewCreateTaskTool returns a new CreateTaskTool.
func NewCreateTaskTool(queries store.Querier) *CreateTaskTool {
	return &CreateTaskTool{queries: queries}
}

func (t *CreateTaskTool) Name() string { return "create_task" }

func (t *CreateTaskTool) Description() string {
	return "Create a new task for the user."
}

func (t *CreateTaskTool) Schema() llm.ToolDefinition {
	return llm.ToolDefinition{
		Name:        t.Name(),
		Description: t.Description(),
		Parameters: jsonSchemaWithRequired("object", map[string]interface{}{
			"title":      jsonSchema("string", nil, "Title of the task"),
			"priority":   jsonSchemaEnum([]string{"priority_1", "priority_2", "priority_3", "priority_4"}, "Priority level: priority_1 (highest/critical), priority_2 (high), priority_3 (medium), priority_4 (low). Defaults to priority_3."),
			"project_id": jsonSchema("string", nil, "Optional project UUID to assign the task to"),
		}, []string{"title"}),
	}
}

func (t *CreateTaskTool) ParseArgs(raw json.RawMessage) (any, error) {
	var args CreateTaskArgs
	if err := json.Unmarshal(raw, &args); err != nil {
		return nil, fmt.Errorf("parse create_task args: %w", err)
	}
	return &args, nil
}

func (t *CreateTaskTool) Execute(ctx context.Context, userID string, argsAny any) (any, error) {
	args := argsAny.(*CreateTaskArgs)

	var priority interface{} = "medium"
	if args.Priority != nil {
		priority = *args.Priority
	}

	var projectID pgtype.UUID
	if args.ProjectID != nil {
		uid, err := uuid.Parse(*args.ProjectID)
		if err != nil {
			return nil, fmt.Errorf("invalid project_id: %w", err)
		}
		projectID = pgtype.UUID{Bytes: uid, Valid: true}
	}

	// Get count to determine position for the new task
	count, err := t.queries.CountTasks(ctx, store.CountTasksParams{
		UserID:  userID,
		Column2: false,
		Column3: projectID,
	})
	if err != nil {
		count = 0
	}

	_, err = t.queries.CreateTask(ctx, store.CreateTaskParams{
		Title:     pgtype.Text{String: args.Title, Valid: true},
		Status:    "active",
		Priority:  priority,
		Impact:    "medium",
		Position:  count,
		UserID:    userID,
		ProjectID: projectID,
	})
	if err != nil {
		return nil, fmt.Errorf("create task: %w", err)
	}

	return map[string]interface{}{
		"title":  args.Title,
		"status": "created",
	}, nil
}

// ---------------------------------------------------------------------------
// UpdateTaskTool
// ---------------------------------------------------------------------------

// UpdateTaskArgs holds validated arguments for update_task.
type UpdateTaskArgs struct {
	ID       string  `json:"id"       validate:"required,uuid"`
	Title    *string `json:"title"    validate:"omitempty,min=1"`
	Status   *string `json:"status"   validate:"omitempty,oneof=pending in_progress completed archived"`
	Priority *string `json:"priority" validate:"omitempty,oneof=priority_1 priority_2 priority_3 priority_4"`
}

// UpdateTaskTool implements the Tool interface for updating a task.
type UpdateTaskTool struct {
	queries store.Querier
}

// NewUpdateTaskTool returns a new UpdateTaskTool.
func NewUpdateTaskTool(queries store.Querier) *UpdateTaskTool {
	return &UpdateTaskTool{queries: queries}
}

func (t *UpdateTaskTool) Name() string { return "update_task" }

func (t *UpdateTaskTool) Description() string {
	return "Update an existing task's title, status, or priority."
}

func (t *UpdateTaskTool) Schema() llm.ToolDefinition {
	return llm.ToolDefinition{
		Name:        t.Name(),
		Description: t.Description(),
		Parameters: jsonSchemaWithRequired("object", map[string]interface{}{
			"id":       jsonSchema("string", nil, "Task UUID"),
			"title":    jsonSchema("string", nil, "New title"),
			"status":   jsonSchemaEnum([]string{"pending", "in_progress", "completed", "archived"}, "New status"),
			"priority": jsonSchemaEnum([]string{"priority_1", "priority_2", "priority_3", "priority_4"}, "New priority: priority_1 (highest), priority_2, priority_3, priority_4 (lowest)"),
		}, []string{"id"}),
	}
}

func (t *UpdateTaskTool) ParseArgs(raw json.RawMessage) (any, error) {
	var args UpdateTaskArgs
	if err := json.Unmarshal(raw, &args); err != nil {
		return nil, fmt.Errorf("parse update_task args: %w", err)
	}
	return &args, nil
}

func (t *UpdateTaskTool) Execute(ctx context.Context, userID string, argsAny any) (any, error) {
	args := argsAny.(*UpdateTaskArgs)

	taskUUID, err := uuid.Parse(args.ID)
	if err != nil {
		return nil, fmt.Errorf("invalid task id: %w", err)
	}
	pgID := pgtype.UUID{Bytes: taskUUID, Valid: true}

	// Fetch the current task so we can fill in unchanged fields
	existing, err := t.queries.GetTaskByID(ctx, store.GetTaskByIDParams{
		ID:     pgID,
		UserID: userID,
	})
	if err != nil {
		return nil, fmt.Errorf("get task: %w", err)
	}

	title := existing.Title
	if args.Title != nil {
		title = pgtype.Text{String: *args.Title, Valid: true}
	}

	status := existing.Status
	if args.Status != nil {
		status = *args.Status
	}

	priority := existing.Priority
	if args.Priority != nil {
		priority = *args.Priority
	}

	completedAtSet, completedAt := taskstate.ComputeCompletedAtUpdate(ifaceToString(existing.Status), args.Status)

	err = t.queries.UpdateTask(ctx, store.UpdateTaskParams{
		ID:             pgID,
		UserID:         userID,
		Title:          title,
		Description:    existing.Description,
		Status:         status,
		Priority:       priority,
		Impact:         existing.Impact,
		Position:       existing.Position,
		CompletedAt:    completedAt,
		CompletedAtSet: completedAtSet,
	})
	if err != nil {
		return nil, fmt.Errorf("update task: %w", err)
	}

	return map[string]interface{}{
		"id":     args.ID,
		"title":  pgtextToString(title),
		"status": ifaceToString(status),
	}, nil
}

// ---------------------------------------------------------------------------
// DeleteTaskTool
// ---------------------------------------------------------------------------

// DeleteTaskArgs holds validated arguments for delete_task.
type DeleteTaskArgs struct {
	ID string `json:"id" validate:"required,uuid"`
}

// DeleteTaskTool implements the Tool interface for soft-deleting a task.
type DeleteTaskTool struct {
	queries store.Querier
}

// NewDeleteTaskTool returns a new DeleteTaskTool.
func NewDeleteTaskTool(queries store.Querier) *DeleteTaskTool {
	return &DeleteTaskTool{queries: queries}
}

func (t *DeleteTaskTool) Name() string { return "delete_task" }

func (t *DeleteTaskTool) Description() string {
	return "Soft-delete a task."
}

func (t *DeleteTaskTool) Schema() llm.ToolDefinition {
	return llm.ToolDefinition{
		Name:        t.Name(),
		Description: t.Description(),
		Parameters: jsonSchemaWithRequired("object", map[string]interface{}{
			"id": jsonSchema("string", nil, "Task UUID"),
		}, []string{"id"}),
	}
}

func (t *DeleteTaskTool) ParseArgs(raw json.RawMessage) (any, error) {
	var args DeleteTaskArgs
	if err := json.Unmarshal(raw, &args); err != nil {
		return nil, fmt.Errorf("parse delete_task args: %w", err)
	}
	return &args, nil
}

func (t *DeleteTaskTool) Execute(ctx context.Context, userID string, argsAny any) (any, error) {
	args := argsAny.(*DeleteTaskArgs)

	taskUUID, err := uuid.Parse(args.ID)
	if err != nil {
		return nil, fmt.Errorf("invalid task id: %w", err)
	}

	err = t.queries.SoftDeleteTask(ctx, store.SoftDeleteTaskParams{
		ID:     pgtype.UUID{Bytes: taskUUID, Valid: true},
		UserID: userID,
	})
	if err != nil {
		return nil, fmt.Errorf("delete task: %w", err)
	}

	return map[string]interface{}{"success": true}, nil
}

// ---------------------------------------------------------------------------
// GetTaskDetailTool
// ---------------------------------------------------------------------------

// GetTaskDetailArgs holds validated arguments for get_task_detail.
type GetTaskDetailArgs struct {
	ID string `json:"id" validate:"required,uuid"`
}

// GetTaskDetailTool implements the Tool interface for fetching full task details.
type GetTaskDetailTool struct {
	queries store.Querier
}

// NewGetTaskDetailTool returns a new GetTaskDetailTool.
func NewGetTaskDetailTool(queries store.Querier) *GetTaskDetailTool {
	return &GetTaskDetailTool{queries: queries}
}

func (t *GetTaskDetailTool) Name() string { return "get_task_detail" }

func (t *GetTaskDetailTool) Description() string {
	return "Get full details of a specific task by its UUID, including description, impact, project, and timestamps."
}

func (t *GetTaskDetailTool) Schema() llm.ToolDefinition {
	return llm.ToolDefinition{
		Name:        t.Name(),
		Description: t.Description(),
		Parameters: jsonSchemaWithRequired("object", map[string]interface{}{
			"id": jsonSchema("string", nil, "Task UUID"),
		}, []string{"id"}),
	}
}

func (t *GetTaskDetailTool) ParseArgs(raw json.RawMessage) (any, error) {
	var args GetTaskDetailArgs
	if err := json.Unmarshal(raw, &args); err != nil {
		return nil, fmt.Errorf("parse get_task_detail args: %w", err)
	}
	return &args, nil
}

func (t *GetTaskDetailTool) Execute(ctx context.Context, userID string, argsAny any) (any, error) {
	args := argsAny.(*GetTaskDetailArgs)

	taskUUID, err := uuid.Parse(args.ID)
	if err != nil {
		return nil, fmt.Errorf("invalid task id: %w", err)
	}
	pgID := pgtype.UUID{Bytes: taskUUID, Valid: true}

	g, err := t.queries.GetTaskByID(ctx, store.GetTaskByIDParams{
		ID:     pgID,
		UserID: userID,
	})
	if err != nil {
		return nil, fmt.Errorf("get task: %w", err)
	}

	var completedAt *string
	if g.CompletedAt.Valid {
		s := g.CompletedAt.Time.Format(time.RFC3339)
		completedAt = &s
	}

	var project *string
	if g.ProjectName.Valid {
		project = &g.ProjectName.String
	}

	return map[string]interface{}{
		"id":           uuidToString(g.ID),
		"title":        pgtextToString(g.Title),
		"description":  pgtextToString(g.Description),
		"status":       ifaceToString(g.Status),
		"priority":     ifaceToString(g.Priority),
		"impact":       ifaceToString(g.Impact),
		"project":      project,
		"created_at":   timestamptzToString(g.CreatedAt),
		"completed_at": completedAt,
	}, nil
}

// ---------------------------------------------------------------------------
// SearchTasksTool
// ---------------------------------------------------------------------------

// SearchTasksArgs holds validated arguments for search_tasks.
type SearchTasksArgs struct {
	Query string `json:"query" validate:"required,min=1"`
}

// SearchTasksTool implements the Tool interface for searching tasks by title.
type SearchTasksTool struct {
	queries store.Querier
}

// NewSearchTasksTool returns a new SearchTasksTool.
func NewSearchTasksTool(queries store.Querier) *SearchTasksTool {
	return &SearchTasksTool{queries: queries}
}

func (t *SearchTasksTool) Name() string { return "search_tasks" }

func (t *SearchTasksTool) Description() string {
	return "Search for tasks by title keyword. Returns up to 5 matching non-archived tasks."
}

func (t *SearchTasksTool) Schema() llm.ToolDefinition {
	return llm.ToolDefinition{
		Name:        t.Name(),
		Description: t.Description(),
		Parameters: jsonSchemaWithRequired("object", map[string]interface{}{
			"query": jsonSchema("string", nil, "Search keyword to match against task titles"),
		}, []string{"query"}),
	}
}

func (t *SearchTasksTool) ParseArgs(raw json.RawMessage) (any, error) {
	var args SearchTasksArgs
	if err := json.Unmarshal(raw, &args); err != nil {
		return nil, fmt.Errorf("parse search_tasks args: %w", err)
	}
	return &args, nil
}

func (t *SearchTasksTool) Execute(ctx context.Context, userID string, argsAny any) (any, error) {
	args := argsAny.(*SearchTasksArgs)

	rows, err := t.queries.SearchTasks(ctx, store.SearchTasksParams{
		UserID:  userID,
		Column2: pgtype.Text{String: args.Query, Valid: true},
	})
	if err != nil {
		return nil, fmt.Errorf("search tasks: %w", err)
	}

	type taskItem struct {
		ID       string `json:"id"`
		Title    string `json:"title"`
		Status   string `json:"status"`
		Priority string `json:"priority"`
	}

	tasks := make([]taskItem, 0, len(rows))
	for _, g := range rows {
		tasks = append(tasks, taskItem{
			ID:       uuidToString(g.ID),
			Title:    pgtextToString(g.Title),
			Status:   ifaceToString(g.Status),
			Priority: ifaceToString(g.Priority),
		})
	}

	return map[string]interface{}{"tasks": tasks}, nil
}
