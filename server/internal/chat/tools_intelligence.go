package chat

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/ksushant6566/mindtab/server/internal/providers/llm"
	"github.com/ksushant6566/mindtab/server/internal/search"
	"github.com/ksushant6566/mindtab/server/internal/store"
)

// GetDailyBriefingTool provides a task, note, project, and vault briefing.
type GetDailyBriefingTool struct {
	queries store.Querier
}

func NewGetDailyBriefingTool(queries store.Querier) *GetDailyBriefingTool {
	return &GetDailyBriefingTool{queries: queries}
}

func (t *GetDailyBriefingTool) Name() string { return "get_daily_briefing" }

func (t *GetDailyBriefingTool) Description() string {
	return "Get a concise daily briefing with active tasks, recent notes, active projects, and recent vault items."
}

func (t *GetDailyBriefingTool) Schema() llm.ToolDefinition {
	return llm.ToolDefinition{Name: t.Name(), Description: t.Description(), Parameters: jsonSchema("object", nil)}
}

func (t *GetDailyBriefingTool) ParseArgs(_ json.RawMessage) (any, error) { return nil, nil }

func (t *GetDailyBriefingTool) Execute(ctx context.Context, userID string, _ any) (any, error) {
	tasks, err := t.queries.ListTasks(ctx, store.ListTasksParams{UserID: userID, Column2: false})
	if err != nil {
		return nil, fmt.Errorf("daily briefing: list tasks: %w", err)
	}
	notes, err := t.queries.ListNotes(ctx, store.ListNotesParams{UserID: userID})
	if err != nil {
		return nil, fmt.Errorf("daily briefing: list notes: %w", err)
	}
	projects, err := t.queries.ListProjects(ctx, store.ListProjectsParams{CreatedBy: userID, Column2: false})
	if err != nil {
		return nil, fmt.Errorf("daily briefing: list projects: %w", err)
	}
	vault, err := t.queries.ListContent(ctx, store.ListContentParams{UserID: userID, Limit: 5, Offset: 0})
	if err != nil {
		return nil, fmt.Errorf("daily briefing: list vault: %w", err)
	}

	taskItems := make([]map[string]any, 0, min(len(tasks), 8))
	for _, task := range tasks {
		status := ifaceToString(task.Status)
		if status == "completed" || status == "archived" {
			continue
		}
		taskItems = append(taskItems, map[string]any{
			"id":       uuidToString(task.ID),
			"title":    pgtextToString(task.Title),
			"status":   status,
			"priority": ifaceToString(task.Priority),
			"project":  pgtextToString(task.ProjectName),
		})
		if len(taskItems) >= 8 {
			break
		}
	}

	noteItems := make([]map[string]any, 0, min(len(notes), 5))
	for _, note := range notes {
		noteItems = append(noteItems, map[string]any{
			"id":         uuidToString(note.ID),
			"title":      note.Title,
			"updated_at": timestamptzToString(note.UpdatedAt),
			"project":    pgtextToString(note.ProjectName),
		})
		if len(noteItems) >= 5 {
			break
		}
	}

	projectItems := make([]map[string]any, 0, len(projects))
	for _, project := range projects {
		projectItems = append(projectItems, map[string]any{
			"id":     uuidToString(project.ID),
			"name":   pgtextToString(project.Name),
			"status": ifaceToString(project.Status),
		})
	}

	vaultItems := make([]map[string]any, 0, len(vault))
	for _, item := range vault {
		vaultItems = append(vaultItems, map[string]any{
			"id":                uuidToString(item.ID),
			"title":             pgtextToString(item.SourceTitle),
			"source_type":       item.SourceType,
			"processing_status": item.ProcessingStatus,
			"updated_at":        timestamptzToString(item.UpdatedAt),
		})
	}

	return map[string]any{
		"date":            time.Now().Format("2006-01-02"),
		"active_tasks":    taskItems,
		"recent_notes":    noteItems,
		"active_projects": projectItems,
		"recent_vault":    vaultItems,
	}, nil
}

// SearchEverythingTool searches tasks, notes, and optionally vault items.
type SearchEverythingTool struct {
	queries store.Querier
	search  *search.SemanticSearch
}

type SearchEverythingArgs struct {
	Query string `json:"query" validate:"required,min=1"`
	Limit *int   `json:"limit" validate:"omitempty,min=1,max=20"`
}

func NewSearchEverythingTool(queries store.Querier, search *search.SemanticSearch) *SearchEverythingTool {
	return &SearchEverythingTool{queries: queries, search: search}
}

func (t *SearchEverythingTool) Name() string { return "search_everything" }

func (t *SearchEverythingTool) Description() string {
	return "Search across tasks, notes, and saved vault items."
}

func (t *SearchEverythingTool) Schema() llm.ToolDefinition {
	return llm.ToolDefinition{
		Name:        t.Name(),
		Description: t.Description(),
		Parameters: jsonSchemaWithRequired("object", map[string]any{
			"query": jsonSchema("string", nil, "Search query"),
			"limit": jsonSchema("integer", nil, "Maximum results per domain"),
		}, []string{"query"}),
	}
}

func (t *SearchEverythingTool) ParseArgs(raw json.RawMessage) (any, error) {
	var args SearchEverythingArgs
	if err := json.Unmarshal(raw, &args); err != nil {
		return nil, fmt.Errorf("parse search_everything args: %w", err)
	}
	return &args, nil
}

func (t *SearchEverythingTool) Execute(ctx context.Context, userID string, argsAny any) (any, error) {
	args := argsAny.(*SearchEverythingArgs)
	limit := int32(5)
	if args.Limit != nil && *args.Limit > 0 {
		limit = int32(*args.Limit)
	}
	query := pgtype.Text{String: args.Query, Valid: true}

	tasks, err := t.queries.SearchTasks(ctx, store.SearchTasksParams{UserID: userID, Column2: query})
	if err != nil {
		return nil, fmt.Errorf("search tasks: %w", err)
	}
	notes, err := t.queries.SearchNotes(ctx, store.SearchNotesParams{UserID: userID, Column2: query})
	if err != nil {
		return nil, fmt.Errorf("search notes: %w", err)
	}

	taskItems := make([]map[string]any, 0, len(tasks))
	for _, task := range tasks {
		taskItems = append(taskItems, map[string]any{
			"id":       uuidToString(task.ID),
			"title":    pgtextToString(task.Title),
			"status":   ifaceToString(task.Status),
			"priority": ifaceToString(task.Priority),
		})
	}

	noteItems := make([]map[string]any, 0, len(notes))
	for _, note := range notes {
		noteItems = append(noteItems, map[string]any{
			"id":      uuidToString(note.ID),
			"title":   note.Title,
			"snippet": truncateString(note.Content, 220),
		})
	}

	var vaultItems []map[string]any
	if t.search != nil {
		results, err := t.search.Search(ctx, userID, args.Query, int(limit))
		if err != nil {
			return nil, fmt.Errorf("search vault: %w", err)
		}
		vaultItems = make([]map[string]any, 0, len(results))
		for _, result := range results {
			title := ""
			if result.SourceTitle != nil {
				title = *result.SourceTitle
			}
			vaultItems = append(vaultItems, map[string]any{
				"id":         result.ID.String(),
				"title":      title,
				"similarity": result.Similarity,
			})
		}
	}

	return map[string]any{"tasks": taskItems, "notes": noteItems, "vault": vaultItems}, nil
}

// ComparePeriodsTool compares task and note activity between two date ranges.
type ComparePeriodsTool struct {
	queries store.Querier
}

type ComparePeriodsArgs struct {
	Start1 string `json:"start1" validate:"required"`
	End1   string `json:"end1"   validate:"required"`
	Start2 string `json:"start2" validate:"required"`
	End2   string `json:"end2"   validate:"required"`
}

func NewComparePeriodsTool(queries store.Querier) *ComparePeriodsTool {
	return &ComparePeriodsTool{queries: queries}
}

func (t *ComparePeriodsTool) Name() string { return "compare_periods" }

func (t *ComparePeriodsTool) Description() string {
	return "Compare task and note activity between two date ranges."
}

func (t *ComparePeriodsTool) Schema() llm.ToolDefinition {
	return llm.ToolDefinition{
		Name:        t.Name(),
		Description: t.Description(),
		Parameters: jsonSchemaWithRequired("object", map[string]any{
			"start1": jsonSchema("string", nil, "First range start date YYYY-MM-DD"),
			"end1":   jsonSchema("string", nil, "First range end date YYYY-MM-DD"),
			"start2": jsonSchema("string", nil, "Second range start date YYYY-MM-DD"),
			"end2":   jsonSchema("string", nil, "Second range end date YYYY-MM-DD"),
		}, []string{"start1", "end1", "start2", "end2"}),
	}
}

func (t *ComparePeriodsTool) ParseArgs(raw json.RawMessage) (any, error) {
	var args ComparePeriodsArgs
	if err := json.Unmarshal(raw, &args); err != nil {
		return nil, fmt.Errorf("parse compare_periods args: %w", err)
	}
	return &args, nil
}

func (t *ComparePeriodsTool) Execute(ctx context.Context, userID string, argsAny any) (any, error) {
	args := argsAny.(*ComparePeriodsArgs)
	left, err := t.periodStats(ctx, userID, args.Start1, args.End1)
	if err != nil {
		return nil, err
	}
	right, err := t.periodStats(ctx, userID, args.Start2, args.End2)
	if err != nil {
		return nil, err
	}
	return map[string]any{"range1": left, "range2": right}, nil
}

func (t *ComparePeriodsTool) periodStats(ctx context.Context, userID, startValue, endValue string) (map[string]int, error) {
	start, err := time.Parse("2006-01-02", startValue)
	if err != nil {
		return nil, fmt.Errorf("invalid start date: %w", err)
	}
	end, err := time.Parse("2006-01-02", endValue)
	if err != nil {
		return nil, fmt.Errorf("invalid end date: %w", err)
	}
	end = end.Add(24*time.Hour - time.Nanosecond)

	taskRows, err := t.queries.GetTaskActivity(ctx, store.GetTaskActivityParams{UserID: userID, CreatedAt: pgtype.Timestamptz{Time: start, Valid: true}})
	if err != nil {
		return nil, fmt.Errorf("get task activity: %w", err)
	}
	noteRows, err := t.queries.GetNoteActivity(ctx, store.GetNoteActivityParams{UserID: userID, CreatedAt: pgtype.Timestamptz{Time: start, Valid: true}})
	if err != nil {
		return nil, fmt.Errorf("get note activity: %w", err)
	}

	stats := map[string]int{"tasks_created": 0, "tasks_completed": 0, "notes_created": 0}
	for _, row := range taskRows {
		if row.CreatedAt.Valid && row.CreatedAt.Time.After(end) {
			continue
		}
		stats["tasks_created"]++
		if ifaceToString(row.Status) == "completed" {
			stats["tasks_completed"]++
		}
	}
	for _, row := range noteRows {
		if row.CreatedAt.Valid && row.CreatedAt.Time.After(end) {
			continue
		}
		stats["notes_created"]++
	}
	return stats, nil
}

// GetStaleItemsTool surfaces tasks and projects with old activity.
type GetStaleItemsTool struct {
	queries store.Querier
}

type GetStaleItemsArgs struct {
	ThresholdDays *int `json:"threshold_days" validate:"omitempty,min=1,max=365"`
}

func NewGetStaleItemsTool(queries store.Querier) *GetStaleItemsTool {
	return &GetStaleItemsTool{queries: queries}
}

func (t *GetStaleItemsTool) Name() string { return "get_stale_items" }

func (t *GetStaleItemsTool) Description() string {
	return "Find active tasks and projects that have not been updated recently."
}

func (t *GetStaleItemsTool) Schema() llm.ToolDefinition {
	return llm.ToolDefinition{
		Name:        t.Name(),
		Description: t.Description(),
		Parameters: jsonSchema("object", map[string]any{
			"threshold_days": jsonSchema("integer", nil, "Days without updates before an item is considered stale. Default 14."),
		}),
	}
}

func (t *GetStaleItemsTool) ParseArgs(raw json.RawMessage) (any, error) {
	var args GetStaleItemsArgs
	if err := json.Unmarshal(raw, &args); err != nil {
		return nil, fmt.Errorf("parse get_stale_items args: %w", err)
	}
	return &args, nil
}

func (t *GetStaleItemsTool) Execute(ctx context.Context, userID string, argsAny any) (any, error) {
	args := argsAny.(*GetStaleItemsArgs)
	threshold := 14
	if args.ThresholdDays != nil {
		threshold = *args.ThresholdDays
	}
	cutoff := time.Now().AddDate(0, 0, -threshold)

	tasks, err := t.queries.ListTasks(ctx, store.ListTasksParams{UserID: userID, Column2: false})
	if err != nil {
		return nil, fmt.Errorf("stale items: list tasks: %w", err)
	}
	projects, err := t.queries.ListProjects(ctx, store.ListProjectsParams{CreatedBy: userID, Column2: false})
	if err != nil {
		return nil, fmt.Errorf("stale items: list projects: %w", err)
	}

	staleTasks := make([]map[string]any, 0)
	for _, task := range tasks {
		if ifaceToString(task.Status) == "completed" || ifaceToString(task.Status) == "archived" {
			continue
		}
		updatedAt := task.UpdatedAt
		if !updatedAt.Valid {
			updatedAt = task.CreatedAt
		}
		if updatedAt.Valid && updatedAt.Time.Before(cutoff) {
			staleTasks = append(staleTasks, map[string]any{
				"id":         uuidToString(task.ID),
				"title":      pgtextToString(task.Title),
				"updated_at": timestamptzToString(updatedAt),
				"project":    pgtextToString(task.ProjectName),
			})
		}
	}

	staleProjects := make([]map[string]any, 0)
	for _, project := range projects {
		updatedAt := project.UpdatedAt
		if !updatedAt.Valid {
			updatedAt = project.CreatedAt
		}
		if updatedAt.Valid && updatedAt.Time.Before(cutoff) {
			staleProjects = append(staleProjects, map[string]any{
				"id":         uuidToString(project.ID),
				"name":       pgtextToString(project.Name),
				"updated_at": timestamptzToString(updatedAt),
			})
		}
	}

	return map[string]any{"threshold_days": threshold, "tasks": staleTasks, "projects": staleProjects}, nil
}

func truncateString(value string, maxLength int) string {
	if len(value) <= maxLength {
		return value
	}
	return value[:maxLength] + "..."
}
