package chat

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/ksushant6566/mindtab/server/internal/providers/llm"
	"github.com/ksushant6566/mindtab/server/internal/search"
	"github.com/ksushant6566/mindtab/server/internal/store"
)

// ToolRegistry holds all available chat tools the LLM can call.
type ToolRegistry struct {
	queries store.Querier
	search  *search.SemanticSearch // can be nil if saves feature disabled
}

// NewToolRegistry creates a new ToolRegistry with the given dependencies.
func NewToolRegistry(queries store.Querier, search *search.SemanticSearch) *ToolRegistry {
	return &ToolRegistry{
		queries: queries,
		search:  search,
	}
}

// Definitions returns LLM tool definitions for all registered tools.
func (r *ToolRegistry) Definitions() []llm.ToolDefinition {
	defs := []llm.ToolDefinition{
		{
			Name:        "list_goals",
			Description: "List the user's goals, optionally filtered by status or project.",
			Parameters: jsonSchema("object", map[string]interface{}{
				"status":     jsonSchema("string", nil, "Filter by status (e.g. active, completed, archived)"),
				"project_id": jsonSchema("string", nil, "Filter by project UUID"),
			}),
		},
		{
			Name:        "create_goal",
			Description: "Create a new goal for the user.",
			Parameters: jsonSchemaWithRequired("object", map[string]interface{}{
				"title":      jsonSchema("string", nil, "Title of the goal"),
				"priority":   jsonSchema("string", nil, "Priority: low, medium, high, critical"),
				"project_id": jsonSchema("string", nil, "Optional project UUID to assign the goal to"),
			}, []string{"title"}),
		},
		{
			Name:        "update_goal",
			Description: "Update an existing goal's title, status, or priority.",
			Parameters: jsonSchemaWithRequired("object", map[string]interface{}{
				"id":       jsonSchema("string", nil, "Goal UUID"),
				"title":    jsonSchema("string", nil, "New title"),
				"status":   jsonSchema("string", nil, "New status (e.g. active, completed, archived)"),
				"priority": jsonSchema("string", nil, "New priority: low, medium, high, critical"),
			}, []string{"id"}),
		},
		{
			Name:        "delete_goal",
			Description: "Soft-delete a goal.",
			Parameters: jsonSchemaWithRequired("object", map[string]interface{}{
				"id": jsonSchema("string", nil, "Goal UUID"),
			}, []string{"id"}),
		},
		{
			Name:        "list_habits",
			Description: "List the user's habits along with whether each was completed today.",
			Parameters: jsonSchema("object", nil, ""),
		},
		{
			Name:        "create_habit",
			Description: "Create a new habit for the user.",
			Parameters: jsonSchemaWithRequired("object", map[string]interface{}{
				"title":     jsonSchema("string", nil, "Title of the habit"),
				"frequency": jsonSchema("string", nil, "Frequency: daily, weekly, monthly"),
			}, []string{"title"}),
		},
		{
			Name:        "toggle_habit",
			Description: "Toggle today's completion status for a habit. If not tracked today, marks it complete; if already tracked, unmarks it.",
			Parameters: jsonSchemaWithRequired("object", map[string]interface{}{
				"id": jsonSchema("string", nil, "Habit UUID"),
			}, []string{"id"}),
		},
		{
			Name:        "list_journals",
			Description: "List journal entries, optionally filtered by project.",
			Parameters: jsonSchema("object", map[string]interface{}{
				"project_id": jsonSchema("string", nil, "Filter by project UUID"),
			}),
		},
		{
			Name:        "create_journal",
			Description: "Create a new journal entry.",
			Parameters: jsonSchemaWithRequired("object", map[string]interface{}{
				"title":   jsonSchema("string", nil, "Title of the journal entry"),
				"content": jsonSchema("string", nil, "Content/body of the journal entry"),
			}, []string{"title", "content"}),
		},
		{
			Name:        "update_journal",
			Description: "Update a journal entry's title or content.",
			Parameters: jsonSchemaWithRequired("object", map[string]interface{}{
				"id":      jsonSchema("string", nil, "Journal UUID"),
				"title":   jsonSchema("string", nil, "New title"),
				"content": jsonSchema("string", nil, "New content"),
			}, []string{"id"}),
		},
		{
			Name:        "delete_journal",
			Description: "Soft-delete a journal entry.",
			Parameters: jsonSchemaWithRequired("object", map[string]interface{}{
				"id": jsonSchema("string", nil, "Journal UUID"),
			}, []string{"id"}),
		},
		{
			Name:        "list_projects",
			Description: "List the user's projects.",
			Parameters: jsonSchema("object", nil, ""),
		},
		{
			Name:        "create_project",
			Description: "Create a new project.",
			Parameters: jsonSchemaWithRequired("object", map[string]interface{}{
				"name":  jsonSchema("string", nil, "Name of the project"),
				"color": jsonSchema("string", nil, "Optional color for the project"),
			}, []string{"name"}),
		},
		{
			Name:        "search_vault",
			Description: "Semantic search over saved content (vault/saves). Returns items ranked by relevance.",
			Parameters: jsonSchemaWithRequired("object", map[string]interface{}{
				"query": jsonSchema("string", nil, "Search query text"),
				"limit": jsonSchema("integer", nil, "Max number of results (default 10)"),
			}, []string{"query"}),
		},
		{
			Name:        "get_vault_item",
			Description: "Get full details of a saved vault item by ID.",
			Parameters: jsonSchemaWithRequired("object", map[string]interface{}{
				"id": jsonSchema("string", nil, "Vault item UUID"),
			}, []string{"id"}),
		},
	}
	return defs
}

// Execute runs a tool by name with the given args, scoped to userID.
func (r *ToolRegistry) Execute(ctx context.Context, userID string, toolName string, argsJSON string) (interface{}, error) {
	switch toolName {
	case "list_goals":
		return r.listGoals(ctx, userID, argsJSON)
	case "create_goal":
		return r.createGoal(ctx, userID, argsJSON)
	case "update_goal":
		return r.updateGoal(ctx, userID, argsJSON)
	case "delete_goal":
		return r.deleteGoal(ctx, userID, argsJSON)
	case "list_habits":
		return r.listHabits(ctx, userID)
	case "create_habit":
		return r.createHabit(ctx, userID, argsJSON)
	case "toggle_habit":
		return r.toggleHabit(ctx, userID, argsJSON)
	case "list_journals":
		return r.listJournals(ctx, userID, argsJSON)
	case "create_journal":
		return r.createJournal(ctx, userID, argsJSON)
	case "update_journal":
		return r.updateJournal(ctx, userID, argsJSON)
	case "delete_journal":
		return r.deleteJournal(ctx, userID, argsJSON)
	case "list_projects":
		return r.listProjects(ctx, userID)
	case "create_project":
		return r.createProject(ctx, userID, argsJSON)
	case "search_vault":
		return r.searchVault(ctx, userID, argsJSON)
	case "get_vault_item":
		return r.getVaultItem(ctx, userID, argsJSON)
	default:
		return nil, fmt.Errorf("unknown tool: %s", toolName)
	}
}

// ---------------------------------------------------------------------------
// Tool argument structs
// ---------------------------------------------------------------------------

type listGoalsArgs struct {
	Status    *string `json:"status"`
	ProjectID *string `json:"project_id"`
}

type createGoalArgs struct {
	Title     string  `json:"title"`
	Priority  *string `json:"priority"`
	ProjectID *string `json:"project_id"`
}

type updateGoalArgs struct {
	ID       string  `json:"id"`
	Title    *string `json:"title"`
	Status   *string `json:"status"`
	Priority *string `json:"priority"`
}

type deleteGoalArgs struct {
	ID string `json:"id"`
}

type createHabitArgs struct {
	Title     string  `json:"title"`
	Frequency *string `json:"frequency"`
}

type toggleHabitArgs struct {
	ID string `json:"id"`
}

type listJournalsArgs struct {
	ProjectID *string `json:"project_id"`
}

type createJournalArgs struct {
	Title   string `json:"title"`
	Content string `json:"content"`
}

type updateJournalArgs struct {
	ID      string  `json:"id"`
	Title   *string `json:"title"`
	Content *string `json:"content"`
}

type deleteJournalArgs struct {
	ID string `json:"id"`
}

type createProjectArgs struct {
	Name  string  `json:"name"`
	Color *string `json:"color"`
}

type searchVaultArgs struct {
	Query string `json:"query"`
	Limit *int   `json:"limit"`
}

type getVaultItemArgs struct {
	ID string `json:"id"`
}

// ---------------------------------------------------------------------------
// Tool implementations
// ---------------------------------------------------------------------------

func (r *ToolRegistry) listGoals(ctx context.Context, userID string, argsJSON string) (interface{}, error) {
	var args listGoalsArgs
	if err := json.Unmarshal([]byte(argsJSON), &args); err != nil {
		return nil, fmt.Errorf("parse list_goals args: %w", err)
	}

	var projectID pgtype.UUID
	if args.ProjectID != nil {
		uid, err := uuid.Parse(*args.ProjectID)
		if err != nil {
			return nil, fmt.Errorf("invalid project_id: %w", err)
		}
		projectID = pgtype.UUID{Bytes: uid, Valid: true}
	}

	rows, err := r.queries.ListGoals(ctx, store.ListGoalsParams{
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
		if args.Status != nil && status != *args.Status {
			continue
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

func (r *ToolRegistry) createGoal(ctx context.Context, userID string, argsJSON string) (interface{}, error) {
	var args createGoalArgs
	if err := json.Unmarshal([]byte(argsJSON), &args); err != nil {
		return nil, fmt.Errorf("parse create_goal args: %w", err)
	}

	if args.Title == "" {
		return nil, fmt.Errorf("title is required")
	}

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
	count, err := r.queries.CountGoals(ctx, store.CountGoalsParams{
		UserID:  userID,
		Column2: false,
		Column3: projectID,
	})
	if err != nil {
		count = 0
	}

	err = r.queries.CreateGoal(ctx, store.CreateGoalParams{
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

func (r *ToolRegistry) updateGoal(ctx context.Context, userID string, argsJSON string) (interface{}, error) {
	var args updateGoalArgs
	if err := json.Unmarshal([]byte(argsJSON), &args); err != nil {
		return nil, fmt.Errorf("parse update_goal args: %w", err)
	}

	goalUUID, err := uuid.Parse(args.ID)
	if err != nil {
		return nil, fmt.Errorf("invalid goal id: %w", err)
	}
	pgID := pgtype.UUID{Bytes: goalUUID, Valid: true}

	// Fetch the current goal so we can fill in unchanged fields
	existing, err := r.queries.GetGoalByID(ctx, store.GetGoalByIDParams{
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

	err = r.queries.UpdateGoal(ctx, store.UpdateGoalParams{
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

func (r *ToolRegistry) deleteGoal(ctx context.Context, userID string, argsJSON string) (interface{}, error) {
	var args deleteGoalArgs
	if err := json.Unmarshal([]byte(argsJSON), &args); err != nil {
		return nil, fmt.Errorf("parse delete_goal args: %w", err)
	}

	goalUUID, err := uuid.Parse(args.ID)
	if err != nil {
		return nil, fmt.Errorf("invalid goal id: %w", err)
	}

	err = r.queries.SoftDeleteGoal(ctx, store.SoftDeleteGoalParams{
		ID:     pgtype.UUID{Bytes: goalUUID, Valid: true},
		UserID: userID,
	})
	if err != nil {
		return nil, fmt.Errorf("delete goal: %w", err)
	}

	return map[string]interface{}{"success": true}, nil
}

func (r *ToolRegistry) listHabits(ctx context.Context, userID string) (interface{}, error) {
	habits, err := r.queries.ListHabits(ctx, userID)
	if err != nil {
		return nil, fmt.Errorf("list habits: %w", err)
	}

	// Get today's tracker records to determine completion status
	trackers, err := r.queries.ListHabitTrackerRecords(ctx, userID)
	if err != nil {
		return nil, fmt.Errorf("list tracker records: %w", err)
	}

	today := time.Now().Format("2006-01-02")
	completedToday := make(map[string]bool)
	for _, t := range trackers {
		if t.Date.Valid {
			dateStr := t.Date.Time.Format("2006-01-02")
			if dateStr == today {
				completedToday[uuidToString(t.HabitID)] = true
			}
		}
	}

	type habitItem struct {
		ID             string `json:"id"`
		Title          string `json:"title"`
		CompletedToday bool   `json:"completed_today"`
	}

	items := make([]habitItem, 0, len(habits))
	for _, h := range habits {
		hID := uuidToString(h.ID)
		items = append(items, habitItem{
			ID:             hID,
			Title:          pgtextToString(h.Title),
			CompletedToday: completedToday[hID],
		})
	}

	return map[string]interface{}{"habits": items}, nil
}

func (r *ToolRegistry) createHabit(ctx context.Context, userID string, argsJSON string) (interface{}, error) {
	var args createHabitArgs
	if err := json.Unmarshal([]byte(argsJSON), &args); err != nil {
		return nil, fmt.Errorf("parse create_habit args: %w", err)
	}

	if args.Title == "" {
		return nil, fmt.Errorf("title is required")
	}

	var frequency interface{} = "daily"
	if args.Frequency != nil {
		frequency = *args.Frequency
	}

	err := r.queries.CreateHabit(ctx, store.CreateHabitParams{
		Title:     pgtype.Text{String: args.Title, Valid: true},
		Frequency: frequency,
		UserID:    userID,
	})
	if err != nil {
		return nil, fmt.Errorf("create habit: %w", err)
	}

	return map[string]interface{}{
		"title":  args.Title,
		"status": "created",
	}, nil
}

func (r *ToolRegistry) toggleHabit(ctx context.Context, userID string, argsJSON string) (interface{}, error) {
	var args toggleHabitArgs
	if err := json.Unmarshal([]byte(argsJSON), &args); err != nil {
		return nil, fmt.Errorf("parse toggle_habit args: %w", err)
	}

	habitUUID, err := uuid.Parse(args.ID)
	if err != nil {
		return nil, fmt.Errorf("invalid habit id: %w", err)
	}
	pgID := pgtype.UUID{Bytes: habitUUID, Valid: true}

	now := time.Now()
	todayDate := pgtype.Date{
		Time:  time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location()),
		Valid: true,
	}

	// Check if already tracked today by listing all records and checking
	trackers, err := r.queries.ListHabitTrackerRecords(ctx, userID)
	if err != nil {
		return nil, fmt.Errorf("list tracker records: %w", err)
	}

	today := now.Format("2006-01-02")
	alreadyTracked := false
	for _, t := range trackers {
		if uuidToString(t.HabitID) == args.ID && t.Date.Valid && t.Date.Time.Format("2006-01-02") == today {
			alreadyTracked = true
			break
		}
	}

	if alreadyTracked {
		// Untrack
		err = r.queries.UntrackHabit(ctx, store.UntrackHabitParams{
			HabitID: pgID,
			UserID:  userID,
			Date:    todayDate,
		})
		if err != nil {
			return nil, fmt.Errorf("untrack habit: %w", err)
		}
		return map[string]interface{}{
			"id":        args.ID,
			"completed": false,
		}, nil
	}

	// Track
	_, err = r.queries.TrackHabit(ctx, store.TrackHabitParams{
		HabitID: pgID,
		UserID:  userID,
		Date:    todayDate,
	})
	if err != nil {
		return nil, fmt.Errorf("track habit: %w", err)
	}

	return map[string]interface{}{
		"id":        args.ID,
		"completed": true,
	}, nil
}

func (r *ToolRegistry) listJournals(ctx context.Context, userID string, argsJSON string) (interface{}, error) {
	var args listJournalsArgs
	if err := json.Unmarshal([]byte(argsJSON), &args); err != nil {
		return nil, fmt.Errorf("parse list_journals args: %w", err)
	}

	var projectID pgtype.UUID
	if args.ProjectID != nil {
		uid, err := uuid.Parse(*args.ProjectID)
		if err != nil {
			return nil, fmt.Errorf("invalid project_id: %w", err)
		}
		projectID = pgtype.UUID{Bytes: uid, Valid: true}
	}

	rows, err := r.queries.ListJournals(ctx, store.ListJournalsParams{
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

func (r *ToolRegistry) createJournal(ctx context.Context, userID string, argsJSON string) (interface{}, error) {
	var args createJournalArgs
	if err := json.Unmarshal([]byte(argsJSON), &args); err != nil {
		return nil, fmt.Errorf("parse create_journal args: %w", err)
	}

	if args.Title == "" {
		return nil, fmt.Errorf("title is required")
	}
	if args.Content == "" {
		return nil, fmt.Errorf("content is required")
	}

	err := r.queries.CreateJournal(ctx, store.CreateJournalParams{
		Title:   args.Title,
		Content: args.Content,
		UserID:  userID,
	})
	if err != nil {
		return nil, fmt.Errorf("create journal: %w", err)
	}

	return map[string]interface{}{
		"title":  args.Title,
		"status": "created",
	}, nil
}

func (r *ToolRegistry) updateJournal(ctx context.Context, userID string, argsJSON string) (interface{}, error) {
	var args updateJournalArgs
	if err := json.Unmarshal([]byte(argsJSON), &args); err != nil {
		return nil, fmt.Errorf("parse update_journal args: %w", err)
	}

	journalUUID, err := uuid.Parse(args.ID)
	if err != nil {
		return nil, fmt.Errorf("invalid journal id: %w", err)
	}
	pgID := pgtype.UUID{Bytes: journalUUID, Valid: true}

	// Fetch existing journal to fill in unchanged fields
	existing, err := r.queries.GetJournalByID(ctx, store.GetJournalByIDParams{
		ID:     pgID,
		UserID: userID,
	})
	if err != nil {
		return nil, fmt.Errorf("get journal: %w", err)
	}

	title := existing.Title
	if args.Title != nil {
		title = *args.Title
	}

	content := existing.Content
	if args.Content != nil {
		content = *args.Content
	}

	err = r.queries.UpdateJournal(ctx, store.UpdateJournalParams{
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
		"id":    args.ID,
		"title": title,
	}, nil
}

func (r *ToolRegistry) deleteJournal(ctx context.Context, userID string, argsJSON string) (interface{}, error) {
	var args deleteJournalArgs
	if err := json.Unmarshal([]byte(argsJSON), &args); err != nil {
		return nil, fmt.Errorf("parse delete_journal args: %w", err)
	}

	journalUUID, err := uuid.Parse(args.ID)
	if err != nil {
		return nil, fmt.Errorf("invalid journal id: %w", err)
	}

	err = r.queries.DeleteJournal(ctx, store.DeleteJournalParams{
		ID:     pgtype.UUID{Bytes: journalUUID, Valid: true},
		UserID: userID,
	})
	if err != nil {
		return nil, fmt.Errorf("delete journal: %w", err)
	}

	return map[string]interface{}{"success": true}, nil
}

func (r *ToolRegistry) listProjects(ctx context.Context, userID string) (interface{}, error) {
	rows, err := r.queries.ListProjects(ctx, store.ListProjectsParams{
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

func (r *ToolRegistry) createProject(ctx context.Context, userID string, argsJSON string) (interface{}, error) {
	var args createProjectArgs
	if err := json.Unmarshal([]byte(argsJSON), &args); err != nil {
		return nil, fmt.Errorf("parse create_project args: %w", err)
	}

	if args.Name == "" {
		return nil, fmt.Errorf("name is required")
	}

	project, err := r.queries.CreateProject(ctx, store.CreateProjectParams{
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

func (r *ToolRegistry) searchVault(ctx context.Context, userID string, argsJSON string) (interface{}, error) {
	if r.search == nil {
		return nil, fmt.Errorf("vault search is not available")
	}

	var args searchVaultArgs
	if err := json.Unmarshal([]byte(argsJSON), &args); err != nil {
		return nil, fmt.Errorf("parse search_vault args: %w", err)
	}

	if args.Query == "" {
		return nil, fmt.Errorf("query is required")
	}

	limit := 10
	if args.Limit != nil && *args.Limit > 0 {
		limit = *args.Limit
	}

	results, err := r.search.Search(ctx, userID, args.Query, limit)
	if err != nil {
		return nil, fmt.Errorf("search vault: %w", err)
	}

	type resultItem struct {
		ID         string  `json:"id"`
		Title      string  `json:"title"`
		Summary    string  `json:"summary"`
		Similarity float64 `json:"similarity"`
	}

	items := make([]resultItem, 0, len(results))
	for _, sr := range results {
		title := ""
		if sr.SourceTitle != nil {
			title = *sr.SourceTitle
		}
		summary := ""
		if sr.Summary != nil {
			summary = *sr.Summary
		}
		items = append(items, resultItem{
			ID:         sr.ID.String(),
			Title:      title,
			Summary:    summary,
			Similarity: sr.Similarity,
		})
	}

	return map[string]interface{}{"results": items}, nil
}

func (r *ToolRegistry) getVaultItem(ctx context.Context, userID string, argsJSON string) (interface{}, error) {
	var args getVaultItemArgs
	if err := json.Unmarshal([]byte(argsJSON), &args); err != nil {
		return nil, fmt.Errorf("parse get_vault_item args: %w", err)
	}

	itemUUID, err := uuid.Parse(args.ID)
	if err != nil {
		return nil, fmt.Errorf("invalid vault item id: %w", err)
	}

	content, err := r.queries.GetContentByID(ctx, store.GetContentByIDParams{
		ID:     pgtype.UUID{Bytes: itemUUID, Valid: true},
		UserID: userID,
	})
	if err != nil {
		return nil, fmt.Errorf("get vault item: %w", err)
	}

	// Build a clean content string from available text
	bodyText := pgtextToString(content.Summary)
	if bodyText == "" {
		bodyText = pgtextToString(content.ExtractedText)
	}

	return map[string]interface{}{
		"id":      uuidToString(content.ID),
		"title":   pgtextToString(content.SourceTitle),
		"summary": pgtextToString(content.Summary),
		"tags":    content.Tags,
		"content": bodyText,
	}, nil
}

// ---------------------------------------------------------------------------
// JSON Schema helpers
// ---------------------------------------------------------------------------

// jsonSchema builds a JSON Schema map for a ToolDefinition.Parameters entry.
func jsonSchema(typ string, properties map[string]interface{}, description ...string) map[string]interface{} {
	m := map[string]interface{}{
		"type": typ,
	}
	if len(description) > 0 && description[0] != "" {
		m["description"] = description[0]
	}
	if properties != nil {
		m["properties"] = properties
	}
	return m
}

// jsonSchemaWithRequired builds a JSON Schema object with required fields.
func jsonSchemaWithRequired(typ string, properties map[string]interface{}, required []string) map[string]interface{} {
	m := map[string]interface{}{
		"type": typ,
	}
	if properties != nil {
		m["properties"] = properties
	}
	if len(required) > 0 {
		m["required"] = required
	}
	return m
}

// ---------------------------------------------------------------------------
// pgtype conversion helpers
// ---------------------------------------------------------------------------

func uuidToString(u pgtype.UUID) string {
	if !u.Valid {
		return ""
	}
	return uuid.UUID(u.Bytes).String()
}

func pgtextToString(t pgtype.Text) string {
	if !t.Valid {
		return ""
	}
	return t.String
}

func timestamptzToString(t pgtype.Timestamptz) string {
	if !t.Valid {
		return ""
	}
	return t.Time.Format(time.RFC3339)
}

func ifaceToString(v interface{}) string {
	if v == nil {
		return ""
	}
	return fmt.Sprintf("%v", v)
}
