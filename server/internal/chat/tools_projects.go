package chat

import (
	"context"
	"encoding/json"
	"fmt"

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
