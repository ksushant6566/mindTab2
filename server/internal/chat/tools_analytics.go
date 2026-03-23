package chat

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/ksushant6566/mindtab/server/internal/providers/llm"
	"github.com/ksushant6566/mindtab/server/internal/store"
)

// ---------------------------------------------------------------------------
// Level helpers
// ---------------------------------------------------------------------------

var levelThresholds = []int{0, 100, 250, 500, 800, 1200, 1700, 2300, 3000, 4000}

func getLevelForXP(xp int) int {
	for i := len(levelThresholds) - 1; i >= 0; i-- {
		if xp >= levelThresholds[i] {
			return i + 1
		}
	}
	return 1
}

func getXPForLevel(level int) int {
	if level <= 1 {
		return 0
	}
	if level-1 < len(levelThresholds) {
		return levelThresholds[level-1]
	}
	return int(math.Round(50 * math.Pow(float64(level-1), 1.5)))
}

// ---------------------------------------------------------------------------
// GetActivitySummaryTool
// ---------------------------------------------------------------------------

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
	return "Get a summary of the user's activity (goals created/completed, habits tracked, journals written) for a given period. Defaults to the past week."
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
	startDate := pgtype.Date{Time: startTime, Valid: true}

	// ---- Goals ----
	goalRows, err := t.queries.GetGoalActivity(ctx, store.GetGoalActivityParams{
		UserID:    userID,
		CreatedAt: startTimestamp,
	})
	if err != nil {
		return nil, fmt.Errorf("get goal activity: %w", err)
	}

	goalsCreated := 0
	goalsCompleted := 0
	for _, row := range goalRows {
		if row.CreatedAt.Valid && row.CreatedAt.Time.After(endTime) {
			continue
		}
		goalsCreated++
		if ifaceToString(row.Status) == "completed" {
			goalsCompleted++
		}
	}

	// ---- Habit tracker ----
	habitDates, err := t.queries.GetHabitTrackerActivity(ctx, store.GetHabitTrackerActivityParams{
		UserID:  userID,
		Column2: startDate,
	})
	if err != nil {
		return nil, fmt.Errorf("get habit tracker activity: %w", err)
	}

	habitsCompleted := 0
	for _, d := range habitDates {
		if !d.Valid {
			continue
		}
		t := d.Time
		if t.After(endTime) {
			continue
		}
		habitsCompleted++
	}

	// ---- Journals ----
	journalRows, err := t.queries.GetJournalActivity(ctx, store.GetJournalActivityParams{
		UserID:    userID,
		CreatedAt: startTimestamp,
	})
	if err != nil {
		return nil, fmt.Errorf("get journal activity: %w", err)
	}

	journalsWritten := 0
	for _, row := range journalRows {
		if row.CreatedAt.Valid && row.CreatedAt.Time.After(endTime) {
			continue
		}
		journalsWritten++
	}

	return map[string]interface{}{
		"period": map[string]string{
			"start": startTime.Format("2006-01-02"),
			"end":   endTime.Format("2006-01-02"),
		},
		"goals_created":   goalsCreated,
		"goals_completed": goalsCompleted,
		"habits_completed": habitsCompleted,
		"journals_written": journalsWritten,
	}, nil
}

// ---------------------------------------------------------------------------
// GetUserProfileTool
// ---------------------------------------------------------------------------

// GetUserProfileTool implements the Tool interface for retrieving user profile and XP info.
type GetUserProfileTool struct {
	queries store.Querier
}

// NewGetUserProfileTool returns a new GetUserProfileTool.
func NewGetUserProfileTool(queries store.Querier) *GetUserProfileTool {
	return &GetUserProfileTool{queries: queries}
}

func (t *GetUserProfileTool) Name() string { return "get_user_profile" }

func (t *GetUserProfileTool) Description() string {
	return "Get the user's profile including name, email, current XP, level, and XP needed to reach the next level."
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

	xp := int(user.Xp)
	level := getLevelForXP(xp)
	xpToNextLevel := getXPForLevel(level+1) - xp

	return map[string]interface{}{
		"name":            pgtextToString(user.Name),
		"email":           user.Email,
		"xp":              xp,
		"level":           level,
		"xp_to_next_level": xpToNextLevel,
	}, nil
}
