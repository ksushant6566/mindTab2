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
)

// ---------------------------------------------------------------------------
// ListGoalsTool
// ---------------------------------------------------------------------------

// ListGoalsArgs holds validated arguments for list_goals.
type ListGoalsArgs struct {
	Status    *string `json:"status"     validate:"omitempty,oneof=pending in_progress completed archived"`
	ProjectID *string `json:"project_id" validate:"omitempty,uuid"`
}

// ListGoalsTool implements the Tool interface for listing goals.
type ListGoalsTool struct {
	queries store.Querier
}

// NewListGoalsTool returns a new ListGoalsTool.
func NewListGoalsTool(queries store.Querier) *ListGoalsTool {
	return &ListGoalsTool{queries: queries}
}

func (t *ListGoalsTool) Name() string { return "list_goals" }

func (t *ListGoalsTool) Description() string {
	return "List the user's goals, optionally filtered by status or project. Returns all non-archived goals by default. Omit status to get all goals."
}

func (t *ListGoalsTool) Schema() llm.ToolDefinition {
	return llm.ToolDefinition{
		Name:        t.Name(),
		Description: t.Description(),
		Parameters: jsonSchema("object", map[string]interface{}{
			"status":     jsonSchemaEnum([]string{"pending", "in_progress", "completed", "archived"}, "Filter by exact status. Omit to return all non-archived goals."),
			"project_id": jsonSchema("string", nil, "Filter by project UUID"),
		}),
	}
}

func (t *ListGoalsTool) ParseArgs(raw json.RawMessage) (any, error) {
	var args ListGoalsArgs
	if err := json.Unmarshal(raw, &args); err != nil {
		return nil, fmt.Errorf("parse list_goals args: %w", err)
	}
	return &args, nil
}

func (t *ListGoalsTool) Execute(ctx context.Context, userID string, argsAny any) (any, error) {
	args := argsAny.(*ListGoalsArgs)

	var projectID pgtype.UUID
	if args.ProjectID != nil {
		uid, err := uuid.Parse(*args.ProjectID)
		if err != nil {
			return nil, fmt.Errorf("invalid project_id: %w", err)
		}
		projectID = pgtype.UUID{Bytes: uid, Valid: true}
	}

	rows, err := t.queries.ListGoals(ctx, store.ListGoalsParams{
		UserID:  userID,
		Column2: false, // do not include archived by default
		Column3: projectID,
	})
	if err != nil {
		return nil, fmt.Errorf("list goals: %w", err)
	}

	type goalItem struct {
		ID       string  `json:"id"`
		Title    string  `json:"title"`
		Status   string  `json:"status"`
		Priority string  `json:"priority"`
		Project  *string `json:"project,omitempty"`
	}

	goals := make([]goalItem, 0, len(rows))
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
		goals = append(goals, goalItem{
			ID:       uuidToString(g.ID),
			Title:    pgtextToString(g.Title),
			Status:   status,
			Priority: ifaceToString(g.Priority),
			Project:  proj,
		})
	}

	return map[string]interface{}{"goals": goals}, nil
}

// ---------------------------------------------------------------------------
// CreateGoalTool
// ---------------------------------------------------------------------------

// CreateGoalArgs holds validated arguments for create_goal.
type CreateGoalArgs struct {
	Title     string  `json:"title"      validate:"required,min=1"`
	Priority  *string `json:"priority"   validate:"omitempty,oneof=priority_1 priority_2 priority_3 priority_4"`
	ProjectID *string `json:"project_id" validate:"omitempty,uuid"`
}

// CreateGoalTool implements the Tool interface for creating a goal.
type CreateGoalTool struct {
	queries store.Querier
}

// NewCreateGoalTool returns a new CreateGoalTool.
func NewCreateGoalTool(queries store.Querier) *CreateGoalTool {
	return &CreateGoalTool{queries: queries}
}

func (t *CreateGoalTool) Name() string { return "create_goal" }

func (t *CreateGoalTool) Description() string {
	return "Create a new goal for the user."
}

func (t *CreateGoalTool) Schema() llm.ToolDefinition {
	return llm.ToolDefinition{
		Name:        t.Name(),
		Description: t.Description(),
		Parameters: jsonSchemaWithRequired("object", map[string]interface{}{
			"title":      jsonSchema("string", nil, "Title of the goal"),
			"priority":   jsonSchemaEnum([]string{"priority_1", "priority_2", "priority_3", "priority_4"}, "Priority level: priority_1 (highest/critical), priority_2 (high), priority_3 (medium), priority_4 (low). Defaults to priority_3."),
			"project_id": jsonSchema("string", nil, "Optional project UUID to assign the goal to"),
		}, []string{"title"}),
	}
}

func (t *CreateGoalTool) ParseArgs(raw json.RawMessage) (any, error) {
	var args CreateGoalArgs
	if err := json.Unmarshal(raw, &args); err != nil {
		return nil, fmt.Errorf("parse create_goal args: %w", err)
	}
	return &args, nil
}

func (t *CreateGoalTool) Execute(ctx context.Context, userID string, argsAny any) (any, error) {
	args := argsAny.(*CreateGoalArgs)

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

	// Get count to determine position for the new goal
	count, err := t.queries.CountGoals(ctx, store.CountGoalsParams{
		UserID:  userID,
		Column2: false,
		Column3: projectID,
	})
	if err != nil {
		count = 0
	}

	err = t.queries.CreateGoal(ctx, store.CreateGoalParams{
		Title:     pgtype.Text{String: args.Title, Valid: true},
		Status:    "active",
		Priority:  priority,
		Impact:    "medium",
		Position:  count,
		UserID:    userID,
		ProjectID: projectID,
	})
	if err != nil {
		return nil, fmt.Errorf("create goal: %w", err)
	}

	return map[string]interface{}{
		"title":  args.Title,
		"status": "created",
	}, nil
}

// ---------------------------------------------------------------------------
// UpdateGoalTool
// ---------------------------------------------------------------------------

// UpdateGoalArgs holds validated arguments for update_goal.
type UpdateGoalArgs struct {
	ID       string  `json:"id"       validate:"required,uuid"`
	Title    *string `json:"title"    validate:"omitempty,min=1"`
	Status   *string `json:"status"   validate:"omitempty,oneof=pending in_progress completed archived"`
	Priority *string `json:"priority" validate:"omitempty,oneof=priority_1 priority_2 priority_3 priority_4"`
}

// UpdateGoalTool implements the Tool interface for updating a goal.
type UpdateGoalTool struct {
	queries store.Querier
}

// NewUpdateGoalTool returns a new UpdateGoalTool.
func NewUpdateGoalTool(queries store.Querier) *UpdateGoalTool {
	return &UpdateGoalTool{queries: queries}
}

func (t *UpdateGoalTool) Name() string { return "update_goal" }

func (t *UpdateGoalTool) Description() string {
	return "Update an existing goal's title, status, or priority."
}

func (t *UpdateGoalTool) Schema() llm.ToolDefinition {
	return llm.ToolDefinition{
		Name:        t.Name(),
		Description: t.Description(),
		Parameters: jsonSchemaWithRequired("object", map[string]interface{}{
			"id":       jsonSchema("string", nil, "Goal UUID"),
			"title":    jsonSchema("string", nil, "New title"),
			"status":   jsonSchemaEnum([]string{"pending", "in_progress", "completed", "archived"}, "New status"),
			"priority": jsonSchemaEnum([]string{"priority_1", "priority_2", "priority_3", "priority_4"}, "New priority: priority_1 (highest), priority_2, priority_3, priority_4 (lowest)"),
		}, []string{"id"}),
	}
}

func (t *UpdateGoalTool) ParseArgs(raw json.RawMessage) (any, error) {
	var args UpdateGoalArgs
	if err := json.Unmarshal(raw, &args); err != nil {
		return nil, fmt.Errorf("parse update_goal args: %w", err)
	}
	return &args, nil
}

func (t *UpdateGoalTool) Execute(ctx context.Context, userID string, argsAny any) (any, error) {
	args := argsAny.(*UpdateGoalArgs)

	goalUUID, err := uuid.Parse(args.ID)
	if err != nil {
		return nil, fmt.Errorf("invalid goal id: %w", err)
	}
	pgID := pgtype.UUID{Bytes: goalUUID, Valid: true}

	// Fetch the current goal so we can fill in unchanged fields
	existing, err := t.queries.GetGoalByID(ctx, store.GetGoalByIDParams{
		ID:     pgID,
		UserID: userID,
	})
	if err != nil {
		return nil, fmt.Errorf("get goal: %w", err)
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

	// Handle completed_at based on status change
	completedAt := existing.CompletedAt
	if args.Status != nil {
		if *args.Status == "completed" {
			now := time.Now()
			completedAt = pgtype.Timestamptz{Time: now, Valid: true}
		} else if *args.Status != "archived" {
			completedAt = pgtype.Timestamptz{} // clear it
		}
	}

	err = t.queries.UpdateGoal(ctx, store.UpdateGoalParams{
		ID:          pgID,
		UserID:      userID,
		Title:       title,
		Description: existing.Description,
		Status:      status,
		Priority:    priority,
		Impact:      existing.Impact,
		Position:    existing.Position,
		ProjectID:   existing.ProjectID,
		CompletedAt: completedAt,
	})
	if err != nil {
		return nil, fmt.Errorf("update goal: %w", err)
	}

	return map[string]interface{}{
		"id":     args.ID,
		"title":  pgtextToString(title),
		"status": ifaceToString(status),
	}, nil
}

// ---------------------------------------------------------------------------
// DeleteGoalTool
// ---------------------------------------------------------------------------

// DeleteGoalArgs holds validated arguments for delete_goal.
type DeleteGoalArgs struct {
	ID string `json:"id" validate:"required,uuid"`
}

// DeleteGoalTool implements the Tool interface for soft-deleting a goal.
type DeleteGoalTool struct {
	queries store.Querier
}

// NewDeleteGoalTool returns a new DeleteGoalTool.
func NewDeleteGoalTool(queries store.Querier) *DeleteGoalTool {
	return &DeleteGoalTool{queries: queries}
}

func (t *DeleteGoalTool) Name() string { return "delete_goal" }

func (t *DeleteGoalTool) Description() string {
	return "Soft-delete a goal."
}

func (t *DeleteGoalTool) Schema() llm.ToolDefinition {
	return llm.ToolDefinition{
		Name:        t.Name(),
		Description: t.Description(),
		Parameters: jsonSchemaWithRequired("object", map[string]interface{}{
			"id": jsonSchema("string", nil, "Goal UUID"),
		}, []string{"id"}),
	}
}

func (t *DeleteGoalTool) ParseArgs(raw json.RawMessage) (any, error) {
	var args DeleteGoalArgs
	if err := json.Unmarshal(raw, &args); err != nil {
		return nil, fmt.Errorf("parse delete_goal args: %w", err)
	}
	return &args, nil
}

func (t *DeleteGoalTool) Execute(ctx context.Context, userID string, argsAny any) (any, error) {
	args := argsAny.(*DeleteGoalArgs)

	goalUUID, err := uuid.Parse(args.ID)
	if err != nil {
		return nil, fmt.Errorf("invalid goal id: %w", err)
	}

	err = t.queries.SoftDeleteGoal(ctx, store.SoftDeleteGoalParams{
		ID:     pgtype.UUID{Bytes: goalUUID, Valid: true},
		UserID: userID,
	})
	if err != nil {
		return nil, fmt.Errorf("delete goal: %w", err)
	}

	return map[string]interface{}{"success": true}, nil
}
