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
// ListHabitsTool
// ---------------------------------------------------------------------------

// ListHabitsTool lists all habits for a user along with today's completion status.
type ListHabitsTool struct {
	queries store.Querier
}

func (t *ListHabitsTool) Name() string { return "list_habits" }

func (t *ListHabitsTool) Description() string {
	return "List the user's habits along with whether each was completed today."
}

func (t *ListHabitsTool) Schema() llm.ToolDefinition {
	return llm.ToolDefinition{
		Name:        t.Name(),
		Description: t.Description(),
		Parameters:  jsonSchema("object", nil, ""),
	}
}

func (t *ListHabitsTool) ParseArgs(_ json.RawMessage) (any, error) {
	return nil, nil
}

func (t *ListHabitsTool) Execute(ctx context.Context, userID string, _ any) (any, error) {
	habits, err := t.queries.ListHabits(ctx, userID)
	if err != nil {
		return nil, fmt.Errorf("list habits: %w", err)
	}

	trackers, err := t.queries.ListHabitTrackerRecords(ctx, userID)
	if err != nil {
		return nil, fmt.Errorf("list tracker records: %w", err)
	}

	today := time.Now().Format("2006-01-02")
	completedToday := make(map[string]bool)
	for _, tr := range trackers {
		if tr.Date.Valid {
			if tr.Date.Time.Format("2006-01-02") == today {
				completedToday[uuidToString(tr.HabitID)] = true
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

// ---------------------------------------------------------------------------
// CreateHabitTool
// ---------------------------------------------------------------------------

// CreateHabitArgs holds validated arguments for CreateHabitTool.
type CreateHabitArgs struct {
	Title     string  `json:"title"     validate:"required,min=1"`
	Frequency *string `json:"frequency" validate:"omitempty,oneof=daily weekly"`
}

// CreateHabitTool creates a new habit for a user.
type CreateHabitTool struct {
	queries store.Querier
}

func (t *CreateHabitTool) Name() string { return "create_habit" }

func (t *CreateHabitTool) Description() string {
	return "Create a new habit for the user."
}

func (t *CreateHabitTool) Schema() llm.ToolDefinition {
	return llm.ToolDefinition{
		Name:        t.Name(),
		Description: t.Description(),
		Parameters: jsonSchemaWithRequired("object", map[string]interface{}{
			"title":     jsonSchema("string", nil, "Title of the habit"),
			"frequency": jsonSchemaEnum([]string{"daily", "weekly"}, "Frequency of the habit. Defaults to daily."),
		}, []string{"title"}),
	}
}

func (t *CreateHabitTool) ParseArgs(raw json.RawMessage) (any, error) {
	var args CreateHabitArgs
	if err := json.Unmarshal(raw, &args); err != nil {
		return nil, fmt.Errorf("parse create_habit args: %w", err)
	}
	return &args, nil
}

func (t *CreateHabitTool) Execute(ctx context.Context, userID string, a any) (any, error) {
	args := a.(*CreateHabitArgs)

	var frequency interface{} = "daily"
	if args.Frequency != nil {
		frequency = *args.Frequency
	}

	err := t.queries.CreateHabit(ctx, store.CreateHabitParams{
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

// ---------------------------------------------------------------------------
// ToggleHabitTool
// ---------------------------------------------------------------------------

// ToggleHabitArgs holds validated arguments for ToggleHabitTool.
type ToggleHabitArgs struct {
	ID string `json:"id" validate:"required,uuid"`
}

// ToggleHabitTool toggles today's completion status for a habit.
type ToggleHabitTool struct {
	queries store.Querier
}

func (t *ToggleHabitTool) Name() string { return "toggle_habit" }

func (t *ToggleHabitTool) Description() string {
	return "Toggle today's completion status for a habit. If not tracked today, marks it complete; if already tracked, unmarks it."
}

func (t *ToggleHabitTool) Schema() llm.ToolDefinition {
	return llm.ToolDefinition{
		Name:        t.Name(),
		Description: t.Description(),
		Parameters: jsonSchemaWithRequired("object", map[string]interface{}{
			"id": jsonSchema("string", nil, "Habit UUID"),
		}, []string{"id"}),
	}
}

func (t *ToggleHabitTool) ParseArgs(raw json.RawMessage) (any, error) {
	var args ToggleHabitArgs
	if err := json.Unmarshal(raw, &args); err != nil {
		return nil, fmt.Errorf("parse toggle_habit args: %w", err)
	}
	return &args, nil
}

func (t *ToggleHabitTool) Execute(ctx context.Context, userID string, a any) (any, error) {
	args := a.(*ToggleHabitArgs)

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

	trackers, err := t.queries.ListHabitTrackerRecords(ctx, userID)
	if err != nil {
		return nil, fmt.Errorf("list tracker records: %w", err)
	}

	today := now.Format("2006-01-02")
	alreadyTracked := false
	for _, tr := range trackers {
		if uuidToString(tr.HabitID) == args.ID && tr.Date.Valid && tr.Date.Time.Format("2006-01-02") == today {
			alreadyTracked = true
			break
		}
	}

	if alreadyTracked {
		err = t.queries.UntrackHabit(ctx, store.UntrackHabitParams{
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

	_, err = t.queries.TrackHabit(ctx, store.TrackHabitParams{
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
