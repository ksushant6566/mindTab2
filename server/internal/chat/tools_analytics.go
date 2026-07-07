package chat

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/ksushant6566/mindtab/server/internal/providers/llm"
	"github.com/ksushant6566/mindtab/server/internal/store"
)

// GetActivitySummaryArgs holds validated arguments for get_activity_summary.
type GetActivitySummaryArgs struct {
	Period    *string `json:"period"     validate:"omitempty,oneof=today week month"`
	StartDate *string `json:"start_date" validate:"omitempty"`
	EndDate   *string `json:"end_date"   validate:"omitempty"`
}

// GetActivitySummaryTool implements the Tool interface for getting activity summary.
type GetActivitySummaryTool struct {
	queries store.Querier
}

// NewGetActivitySummaryTool returns a new GetActivitySummaryTool.
func NewGetActivitySummaryTool(queries store.Querier) *GetActivitySummaryTool {
	return &GetActivitySummaryTool{queries: queries}
}

func (t *GetActivitySummaryTool) Name() string { return "get_activity_summary" }

func (t *GetActivitySummaryTool) Description() string {
	return "Get a summary of the user's activity (tasks created/completed and notes written) for a given period. Defaults to the past week."
}

func (t *GetActivitySummaryTool) Schema() llm.ToolDefinition {
	return llm.ToolDefinition{
		Name:        t.Name(),
		Description: t.Description(),
		Parameters: jsonSchema("object", map[string]interface{}{
			"period":     jsonSchemaEnum([]string{"today", "week", "month"}, "Preset period: today (1 day), week (7 days), month (30 days). Defaults to week."),
			"start_date": jsonSchema("string", nil, "Custom start date in YYYY-MM-DD format. Overrides period preset."),
			"end_date":   jsonSchema("string", nil, "Custom end date in YYYY-MM-DD format. Overrides period preset."),
		}),
	}
}

func (t *GetActivitySummaryTool) ParseArgs(raw json.RawMessage) (any, error) {
	var args GetActivitySummaryArgs
	if err := json.Unmarshal(raw, &args); err != nil {
		return nil, fmt.Errorf("parse get_activity_summary args: %w", err)
	}
	return &args, nil
}

func (t *GetActivitySummaryTool) Execute(ctx context.Context, userID string, argsAny any) (any, error) {
	args := argsAny.(*GetActivitySummaryArgs)

	now := time.Now()
	var startTime, endTime time.Time

	// Resolve date range: custom start/end take priority over period preset.
	if args.StartDate != nil && args.EndDate != nil {
		var err error
		startTime, err = time.Parse("2006-01-02", *args.StartDate)
		if err != nil {
			return nil, fmt.Errorf("invalid start_date: %w", err)
		}
		endTime, err = time.Parse("2006-01-02", *args.EndDate)
		if err != nil {
			return nil, fmt.Errorf("invalid end_date: %w", err)
		}
		// Include the full end day.
		endTime = endTime.Add(24*time.Hour - time.Nanosecond)
	} else {
		// Determine days back from period preset; default to "week".
		daysBack := 7
		if args.Period != nil {
			switch *args.Period {
			case "today":
				daysBack = 1
			case "week":
				daysBack = 7
			case "month":
				daysBack = 30
			}
		}
		startTime = now.AddDate(0, 0, -daysBack)
		endTime = now
	}

	startTimestamp := pgtype.Timestamptz{Time: startTime, Valid: true}
	// ---- Tasks ----
	taskRows, err := t.queries.GetTaskActivity(ctx, store.GetTaskActivityParams{
		UserID:    userID,
		CreatedAt: startTimestamp,
	})
	if err != nil {
		return nil, fmt.Errorf("get task activity: %w", err)
	}

	tasksCreated := 0
	tasksCompleted := 0
	for _, row := range taskRows {
		if row.CreatedAt.Valid && row.CreatedAt.Time.After(endTime) {
			continue
		}
		tasksCreated++
		if ifaceToString(row.Status) == "completed" {
			tasksCompleted++
		}
	}

	// ---- Notes ----
	noteRows, err := t.queries.GetNoteActivity(ctx, store.GetNoteActivityParams{
		UserID:    userID,
		CreatedAt: startTimestamp,
	})
	if err != nil {
		return nil, fmt.Errorf("get note activity: %w", err)
	}

	notesWritten := 0
	for _, row := range noteRows {
		if row.CreatedAt.Valid && row.CreatedAt.Time.After(endTime) {
			continue
		}
		notesWritten++
	}

	return map[string]interface{}{
		"period": map[string]string{
			"start": startTime.Format("2006-01-02"),
			"end":   endTime.Format("2006-01-02"),
		},
		"tasks_created":   tasksCreated,
		"tasks_completed": tasksCompleted,
		"notes_written":   notesWritten,
	}, nil
}

// ---------------------------------------------------------------------------
// GetUserProfileTool
// ---------------------------------------------------------------------------

// GetUserProfileTool implements the Tool interface for retrieving user profile info.
type GetUserProfileTool struct {
	queries store.Querier
}

// NewGetUserProfileTool returns a new GetUserProfileTool.
func NewGetUserProfileTool(queries store.Querier) *GetUserProfileTool {
	return &GetUserProfileTool{queries: queries}
}

func (t *GetUserProfileTool) Name() string { return "get_user_profile" }

func (t *GetUserProfileTool) Description() string {
	return "Get the user's profile including name and email."
}

func (t *GetUserProfileTool) Schema() llm.ToolDefinition {
	return llm.ToolDefinition{
		Name:        t.Name(),
		Description: t.Description(),
		Parameters:  jsonSchema("object", nil),
	}
}

func (t *GetUserProfileTool) ParseArgs(_ json.RawMessage) (any, error) {
	return nil, nil
}

func (t *GetUserProfileTool) Execute(ctx context.Context, userID string, _ any) (any, error) {
	user, err := t.queries.GetUserByID(ctx, userID)
	if err != nil {
		return nil, fmt.Errorf("get user by id: %w", err)
	}

	return map[string]interface{}{
		"name":  pgtextToString(user.Name),
		"email": user.Email,
	}, nil
}
