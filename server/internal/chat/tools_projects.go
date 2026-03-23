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
// ListProjectsTool
// ---------------------------------------------------------------------------

// ListProjectsTool lists the user's projects.
type ListProjectsTool struct {
	queries store.Querier
}

// NewListProjectsTool returns a new ListProjectsTool.
func NewListProjectsTool(queries store.Querier) *ListProjectsTool {
	return &ListProjectsTool{queries: queries}
}

func (t *ListProjectsTool) Name() string { return "list_projects" }

func (t *ListProjectsTool) Description() string {
	return "List the user's projects."
}

func (t *ListProjectsTool) Schema() llm.ToolDefinition {
	return llm.ToolDefinition{
		Name:        t.Name(),
		Description: t.Description(),
		Parameters:  jsonSchema("object", nil, ""),
	}
}

func (t *ListProjectsTool) ParseArgs(_ json.RawMessage) (any, error) {
	return nil, nil
}

func (t *ListProjectsTool) Execute(ctx context.Context, userID string, _ any) (any, error) {
	rows, err := t.queries.ListProjects(ctx, store.ListProjectsParams{
		CreatedBy: userID,
		Column2:   false, // exclude archived
		Column3:   nil,   // no status filter
	})
	if err != nil {
		return nil, fmt.Errorf("list projects: %w", err)
	}

	type projectItem struct {
		ID    string `json:"id"`
		Name  string `json:"name"`
		Color string `json:"color"`
	}

	projects := make([]projectItem, 0, len(rows))
	for _, p := range rows {
		projects = append(projects, projectItem{
			ID:    uuidToString(p.ID),
			Name:  pgtextToString(p.Name),
			Color: "",
		})
	}

	return map[string]interface{}{"projects": projects}, nil
}

// ---------------------------------------------------------------------------
// CreateProjectTool
// ---------------------------------------------------------------------------

// CreateProjectArgs holds arguments for CreateProjectTool.
type CreateProjectArgs struct {
	Name  string  `json:"name"  validate:"required,min=1"`
	Color *string `json:"color"`
}

// CreateProjectTool creates a new project.
type CreateProjectTool struct {
	queries store.Querier
}

// NewCreateProjectTool returns a new CreateProjectTool.
func NewCreateProjectTool(queries store.Querier) *CreateProjectTool {
	return &CreateProjectTool{queries: queries}
}

func (t *CreateProjectTool) Name() string { return "create_project" }

func (t *CreateProjectTool) Description() string {
	return "Create a new project."
}

func (t *CreateProjectTool) Schema() llm.ToolDefinition {
	return llm.ToolDefinition{
		Name:        t.Name(),
		Description: t.Description(),
		Parameters: jsonSchemaWithRequired("object", map[string]interface{}{
			"name":  jsonSchema("string", nil, "Name of the project"),
			"color": jsonSchema("string", nil, "Optional color for the project"),
		}, []string{"name"}),
	}
}

func (t *CreateProjectTool) ParseArgs(raw json.RawMessage) (any, error) {
	var args CreateProjectArgs
	if err := json.Unmarshal(raw, &args); err != nil {
		return nil, fmt.Errorf("parse create_project args: %w", err)
	}
	return &args, nil
}

func (t *CreateProjectTool) Execute(ctx context.Context, userID string, argsAny any) (any, error) {
	args := argsAny.(*CreateProjectArgs)

	project, err := t.queries.CreateProject(ctx, store.CreateProjectParams{
		Name:      pgtype.Text{String: args.Name, Valid: true},
		Status:    "active",
		CreatedBy: userID,
	})
	if err != nil {
		return nil, fmt.Errorf("create project: %w", err)
	}

	color := ""
	if args.Color != nil {
		color = *args.Color
	}

	return map[string]interface{}{
		"id":    uuidToString(project.ID),
		"name":  pgtextToString(project.Name),
		"color": color,
	}, nil
}

// ---------------------------------------------------------------------------
// GetProjectStatsTool
// ---------------------------------------------------------------------------

// GetProjectStatsArgs holds validated arguments for get_project_stats.
type GetProjectStatsArgs struct {
	ID string `json:"id" validate:"required,uuid"`
}

// GetProjectStatsTool retrieves stats for a project.
type GetProjectStatsTool struct {
	queries store.Querier
}

// NewGetProjectStatsTool returns a new GetProjectStatsTool.
func NewGetProjectStatsTool(queries store.Querier) *GetProjectStatsTool {
	return &GetProjectStatsTool{queries: queries}
}

func (t *GetProjectStatsTool) Name() string { return "get_project_stats" }

func (t *GetProjectStatsTool) Description() string {
	return "Get stats for a project: goal counts by status and total journal count."
}

func (t *GetProjectStatsTool) Schema() llm.ToolDefinition {
	return llm.ToolDefinition{
		Name:        t.Name(),
		Description: t.Description(),
		Parameters: jsonSchemaWithRequired("object", map[string]interface{}{
			"id": jsonSchema("string", nil, "Project UUID"),
		}, []string{"id"}),
	}
}

func (t *GetProjectStatsTool) ParseArgs(raw json.RawMessage) (any, error) {
	var args GetProjectStatsArgs
	if err := json.Unmarshal(raw, &args); err != nil {
		return nil, fmt.Errorf("parse get_project_stats args: %w", err)
	}
	return &args, nil
}

func (t *GetProjectStatsTool) Execute(ctx context.Context, userID string, argsAny any) (any, error) {
	args := argsAny.(*GetProjectStatsArgs)

	projectUUID, err := uuid.Parse(args.ID)
	if err != nil {
		return nil, fmt.Errorf("invalid project id: %w", err)
	}
	pgID := pgtype.UUID{Bytes: projectUUID, Valid: true}

	project, err := t.queries.GetProjectByID(ctx, store.GetProjectByIDParams{
		ID:        pgID,
		CreatedBy: userID,
	})
	if err != nil {
		return nil, fmt.Errorf("get project: %w", err)
	}

	goalRows, err := t.queries.ListGoalStatsByProject(ctx, store.ListGoalStatsByProjectParams{
		ProjectID: pgID,
		UserID:    userID,
	})
	if err != nil {
		return nil, fmt.Errorf("list goal stats: %w", err)
	}

	statusMap := make(map[string]int)
	for _, row := range goalRows {
		status := ifaceToString(row.Status)
		statusMap[status]++
	}

	journalCount, err := t.queries.CountJournalsByProject(ctx, store.CountJournalsByProjectParams{
		ProjectID: pgID,
		UserID:    userID,
	})
	if err != nil {
		return nil, fmt.Errorf("count journals: %w", err)
	}

	return map[string]interface{}{
		"name":            pgtextToString(project.Name),
		"goals_by_status": statusMap,
		"journal_count":   journalCount,
	}, nil
}

// ---------------------------------------------------------------------------
// UpdateProjectTool
// ---------------------------------------------------------------------------

// UpdateProjectArgs holds validated arguments for update_project.
type UpdateProjectArgs struct {
	ID     string  `json:"id"     validate:"required,uuid"`
	Name   *string `json:"name"   validate:"omitempty,min=1"`
	Status *string `json:"status" validate:"omitempty,oneof=active paused completed archived"`
}

// UpdateProjectTool updates an existing project.
type UpdateProjectTool struct {
	queries store.Querier
}

// NewUpdateProjectTool returns a new UpdateProjectTool.
func NewUpdateProjectTool(queries store.Querier) *UpdateProjectTool {
	return &UpdateProjectTool{queries: queries}
}

func (t *UpdateProjectTool) Name() string { return "update_project" }

func (t *UpdateProjectTool) Description() string {
	return "Update an existing project's name or status."
}

func (t *UpdateProjectTool) Schema() llm.ToolDefinition {
	return llm.ToolDefinition{
		Name:        t.Name(),
		Description: t.Description(),
		Parameters: jsonSchemaWithRequired("object", map[string]interface{}{
			"id":     jsonSchema("string", nil, "Project UUID"),
			"name":   jsonSchema("string", nil, "New project name"),
			"status": jsonSchemaEnum([]string{"active", "paused", "completed", "archived"}, "New project status"),
		}, []string{"id"}),
	}
}

func (t *UpdateProjectTool) ParseArgs(raw json.RawMessage) (any, error) {
	var args UpdateProjectArgs
	if err := json.Unmarshal(raw, &args); err != nil {
		return nil, fmt.Errorf("parse update_project args: %w", err)
	}
	return &args, nil
}

func (t *UpdateProjectTool) Execute(ctx context.Context, userID string, argsAny any) (any, error) {
	args := argsAny.(*UpdateProjectArgs)

	projectUUID, err := uuid.Parse(args.ID)
	if err != nil {
		return nil, fmt.Errorf("invalid project id: %w", err)
	}
	pgID := pgtype.UUID{Bytes: projectUUID, Valid: true}

	var name pgtype.Text
	if args.Name != nil {
		name = pgtype.Text{String: *args.Name, Valid: true}
	}

	var status interface{}
	if args.Status != nil {
		status = *args.Status
	}

	updated, err := t.queries.UpdateProject(ctx, store.UpdateProjectParams{
		ID:            pgID,
		LastUpdatedBy: userID,
		Name:          name,
		Description:   pgtype.Text{},
		Status:        status,
	})
	if err != nil {
		return nil, fmt.Errorf("update project: %w", err)
	}

	return map[string]interface{}{
		"id":     uuidToString(updated.ID),
		"name":   pgtextToString(updated.Name),
		"status": ifaceToString(updated.Status),
	}, nil
}
