package chat

import (
	"context"
	"encoding/json"
	"fmt"
	"sort"
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

// NewListHabitsTool returns a new ListHabitsTool.
func NewListHabitsTool(queries store.Querier) *ListHabitsTool {
	return &ListHabitsTool{queries: queries}
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

// NewCreateHabitTool returns a new CreateHabitTool.
func NewCreateHabitTool(queries store.Querier) *CreateHabitTool {
	return &CreateHabitTool{queries: queries}
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

// NewToggleHabitTool returns a new ToggleHabitTool.
func NewToggleHabitTool(queries store.Querier) *ToggleHabitTool {
	return &ToggleHabitTool{queries: queries}
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

// ---------------------------------------------------------------------------
// GetHabitStatsTool
// ---------------------------------------------------------------------------

// GetHabitStatsArgs holds validated arguments for GetHabitStatsTool.
type GetHabitStatsArgs struct {
	Period    *string `json:"period"     validate:"omitempty,oneof=week month quarter"`
	StartDate *string `json:"start_date" validate:"omitempty"`
	EndDate   *string `json:"end_date"   validate:"omitempty"`
}

// GetHabitStatsTool computes habit completion stats, streaks and rates.
type GetHabitStatsTool struct {
	queries store.Querier
}

// NewGetHabitStatsTool returns a new GetHabitStatsTool.
func NewGetHabitStatsTool(queries store.Querier) *GetHabitStatsTool {
	return &GetHabitStatsTool{queries: queries}
}

func (t *GetHabitStatsTool) Name() string { return "get_habit_stats" }

func (t *GetHabitStatsTool) Description() string {
	return "Get habit completion statistics including completion rates and streaks for a given period."
}

func (t *GetHabitStatsTool) Schema() llm.ToolDefinition {
	return llm.ToolDefinition{
		Name:        t.Name(),
		Description: t.Description(),
		Parameters: jsonSchema("object", map[string]interface{}{
			"period":     jsonSchemaEnum([]string{"week", "month", "quarter"}, "Preset time period. Defaults to month."),
			"start_date": jsonSchema("string", nil, "Date in YYYY-MM-DD format"),
			"end_date":   jsonSchema("string", nil, "Date in YYYY-MM-DD format"),
		}),
	}
}

func (t *GetHabitStatsTool) ParseArgs(raw json.RawMessage) (any, error) {
	var args GetHabitStatsArgs
	if err := json.Unmarshal(raw, &args); err != nil {
		return nil, fmt.Errorf("parse get_habit_stats args: %w", err)
	}
	return &args, nil
}

func (t *GetHabitStatsTool) Execute(ctx context.Context, userID string, a any) (any, error) {
	args := a.(*GetHabitStatsArgs)

	// Resolve date range
	now := time.Now()
	var startDate, endDate time.Time
	endDate = now

	if args.StartDate != nil && args.EndDate != nil {
		var err error
		startDate, err = time.Parse("2006-01-02", *args.StartDate)
		if err != nil {
			return nil, fmt.Errorf("invalid start_date: %w", err)
		}
		endDate, err = time.Parse("2006-01-02", *args.EndDate)
		if err != nil {
			return nil, fmt.Errorf("invalid end_date: %w", err)
		}
	} else {
		days := 30 // default: month
		if args.Period != nil {
			switch *args.Period {
			case "week":
				days = 7
			case "month":
				days = 30
			case "quarter":
				days = 90
			}
		}
		startDate = now.AddDate(0, 0, -days)
	}

	pgStart := pgtype.Date{
		Time:  time.Date(startDate.Year(), startDate.Month(), startDate.Day(), 0, 0, 0, 0, startDate.Location()),
		Valid: true,
	}
	pgEnd := pgtype.Date{
		Time:  time.Date(endDate.Year(), endDate.Month(), endDate.Day(), 0, 0, 0, 0, endDate.Location()),
		Valid: true,
	}

	stats, err := t.queries.GetHabitCompletionStats(ctx, store.GetHabitCompletionStatsParams{
		StartDate: pgStart,
		EndDate:   pgEnd,
		UserID:    userID,
	})
	if err != nil {
		return nil, fmt.Errorf("get habit completion stats: %w", err)
	}

	trackers, err := t.queries.ListHabitTrackerRecords(ctx, userID)
	if err != nil {
		return nil, fmt.Errorf("list tracker records: %w", err)
	}

	// Group tracker dates by habit ID
	habitDates := make(map[string][]time.Time)
	for _, tr := range trackers {
		if tr.Date.Valid {
			hID := uuidToString(tr.HabitID)
			habitDates[hID] = append(habitDates[hID], tr.Date.Time)
		}
	}

	totalDays := int(endDate.Sub(startDate).Hours()/24) + 1

	type habitStat struct {
		Title         string  `json:"title"`
		Completions   int64   `json:"completions"`
		TotalDays     int     `json:"total_days"`
		Rate          float64 `json:"rate"`
		CurrentStreak int     `json:"current_streak"`
		LongestStreak int     `json:"longest_streak"`
	}

	habits := make([]habitStat, 0, len(stats))
	for _, s := range stats {
		hID := uuidToString(s.HabitID)
		dates := habitDates[hID]

		var rate float64
		if totalDays > 0 {
			rate = float64(s.CompletionCount) / float64(totalDays) * 100
		}

		habits = append(habits, habitStat{
			Title:         pgtextToString(s.HabitTitle),
			Completions:   s.CompletionCount,
			TotalDays:     totalDays,
			Rate:          rate,
			CurrentStreak: computeCurrentStreak(dates),
			LongestStreak: computeLongestStreak(dates),
		})
	}

	return map[string]interface{}{
		"period": map[string]string{
			"start": startDate.Format("2006-01-02"),
			"end":   endDate.Format("2006-01-02"),
		},
		"habits": habits,
	}, nil
}

// computeCurrentStreak counts consecutive days ending at today.
func computeCurrentStreak(dates []time.Time) int {
	if len(dates) == 0 {
		return 0
	}

	sort.Slice(dates, func(i, j int) bool {
		return dates[i].After(dates[j])
	})

	today := time.Now().Truncate(24 * time.Hour)
	streak := 0
	expected := today

	for _, d := range dates {
		day := d.Truncate(24 * time.Hour)
		if day.Equal(expected) {
			streak++
			expected = expected.AddDate(0, 0, -1)
		} else if day.Before(expected) {
			break
		}
	}
	return streak
}

// computeLongestStreak finds the longest run of consecutive days.
func computeLongestStreak(dates []time.Time) int {
	if len(dates) == 0 {
		return 0
	}

	sort.Slice(dates, func(i, j int) bool {
		return dates[i].Before(dates[j])
	})

	longest := 1
	current := 1

	for i := 1; i < len(dates); i++ {
		prevDay := dates[i-1].Truncate(24 * time.Hour)
		currDay := dates[i].Truncate(24 * time.Hour)
		diff := currDay.Sub(prevDay)

		if diff == 24*time.Hour {
			current++
			if current > longest {
				longest = current
			}
		} else if diff > 24*time.Hour {
			current = 1
		}
		// diff == 0 means same day, skip without resetting
	}

	return longest
}

// ---------------------------------------------------------------------------
// DeleteHabitTool
// ---------------------------------------------------------------------------

// DeleteHabitArgs holds validated arguments for DeleteHabitTool.
type DeleteHabitArgs struct {
	ID string `json:"id" validate:"required,uuid"`
}

// DeleteHabitTool deletes a habit for a user.
type DeleteHabitTool struct {
	queries store.Querier
}

// NewDeleteHabitTool returns a new DeleteHabitTool.
func NewDeleteHabitTool(queries store.Querier) *DeleteHabitTool {
	return &DeleteHabitTool{queries: queries}
}

func (t *DeleteHabitTool) Name() string { return "delete_habit" }

func (t *DeleteHabitTool) Description() string {
	return "Delete a habit by its ID."
}

func (t *DeleteHabitTool) Schema() llm.ToolDefinition {
	return llm.ToolDefinition{
		Name:        t.Name(),
		Description: t.Description(),
		Parameters: jsonSchemaWithRequired("object", map[string]interface{}{
			"id": jsonSchema("string", nil, "Habit UUID"),
		}, []string{"id"}),
	}
}

func (t *DeleteHabitTool) ParseArgs(raw json.RawMessage) (any, error) {
	var args DeleteHabitArgs
	if err := json.Unmarshal(raw, &args); err != nil {
		return nil, fmt.Errorf("parse delete_habit args: %w", err)
	}
	return &args, nil
}

func (t *DeleteHabitTool) Execute(ctx context.Context, userID string, a any) (any, error) {
	args := a.(*DeleteHabitArgs)

	habitUUID, err := uuid.Parse(args.ID)
	if err != nil {
		return nil, fmt.Errorf("invalid habit id: %w", err)
	}
	pgID := pgtype.UUID{Bytes: habitUUID, Valid: true}

	err = t.queries.DeleteHabit(ctx, store.DeleteHabitParams{
		ID:     pgID,
		UserID: userID,
	})
	if err != nil {
		return nil, fmt.Errorf("delete habit: %w", err)
	}

	return map[string]interface{}{"success": true}, nil
}

// ---------------------------------------------------------------------------
// UpdateHabitTool
// ---------------------------------------------------------------------------

// UpdateHabitArgs holds validated arguments for UpdateHabitTool.
type UpdateHabitArgs struct {
	ID        string  `json:"id"        validate:"required,uuid"`
	Title     *string `json:"title"     validate:"omitempty,min=1"`
	Frequency *string `json:"frequency" validate:"omitempty,oneof=daily weekly"`
}

// UpdateHabitTool updates an existing habit.
type UpdateHabitTool struct {
	queries store.Querier
}

// NewUpdateHabitTool returns a new UpdateHabitTool.
func NewUpdateHabitTool(queries store.Querier) *UpdateHabitTool {
	return &UpdateHabitTool{queries: queries}
}

func (t *UpdateHabitTool) Name() string { return "update_habit" }

func (t *UpdateHabitTool) Description() string {
	return "Update an existing habit's title or frequency."
}

func (t *UpdateHabitTool) Schema() llm.ToolDefinition {
	return llm.ToolDefinition{
		Name:        t.Name(),
		Description: t.Description(),
		Parameters: jsonSchemaWithRequired("object", map[string]interface{}{
			"id":        jsonSchema("string", nil, "Habit UUID"),
			"title":     jsonSchema("string", nil, "New title for the habit"),
			"frequency": jsonSchemaEnum([]string{"daily", "weekly"}, "New frequency for the habit"),
		}, []string{"id"}),
	}
}

func (t *UpdateHabitTool) ParseArgs(raw json.RawMessage) (any, error) {
	var args UpdateHabitArgs
	if err := json.Unmarshal(raw, &args); err != nil {
		return nil, fmt.Errorf("parse update_habit args: %w", err)
	}
	return &args, nil
}

func (t *UpdateHabitTool) Execute(ctx context.Context, userID string, a any) (any, error) {
	args := a.(*UpdateHabitArgs)

	habitUUID, err := uuid.Parse(args.ID)
	if err != nil {
		return nil, fmt.Errorf("invalid habit id: %w", err)
	}
	pgID := pgtype.UUID{Bytes: habitUUID, Valid: true}

	// Fetch existing habit to preserve unchanged fields
	existing, err := t.queries.GetHabitByID(ctx, store.GetHabitByIDParams{
		ID:     pgID,
		UserID: userID,
	})
	if err != nil {
		return nil, fmt.Errorf("get habit: %w", err)
	}

	newTitle := existing.Title
	if args.Title != nil {
		newTitle = pgtype.Text{String: *args.Title, Valid: true}
	}

	var newFrequency interface{} = existing.Frequency
	if args.Frequency != nil {
		newFrequency = *args.Frequency
	}

	err = t.queries.UpdateHabit(ctx, store.UpdateHabitParams{
		ID:          pgID,
		UserID:      userID,
		Title:       newTitle,
		Description: existing.Description,
		Frequency:   newFrequency,
	})
	if err != nil {
		return nil, fmt.Errorf("update habit: %w", err)
	}

	return map[string]interface{}{
		"id":        args.ID,
		"title":     pgtextToString(newTitle),
		"frequency": ifaceToString(newFrequency),
	}, nil
}

// ---------------------------------------------------------------------------
// SearchHabitsTool
// ---------------------------------------------------------------------------

// SearchHabitsArgs holds validated arguments for SearchHabitsTool.
type SearchHabitsArgs struct {
	Query string `json:"query" validate:"required,min=1"`
}

// SearchHabitsTool searches habits by title.
type SearchHabitsTool struct {
	queries store.Querier
}

// NewSearchHabitsTool returns a new SearchHabitsTool.
func NewSearchHabitsTool(queries store.Querier) *SearchHabitsTool {
	return &SearchHabitsTool{queries: queries}
}

func (t *SearchHabitsTool) Name() string { return "search_habits" }

func (t *SearchHabitsTool) Description() string {
	return "Search habits by title."
}

func (t *SearchHabitsTool) Schema() llm.ToolDefinition {
	return llm.ToolDefinition{
		Name:        t.Name(),
		Description: t.Description(),
		Parameters: jsonSchemaWithRequired("object", map[string]interface{}{
			"query": jsonSchema("string", nil, "Search query to match against habit titles"),
		}, []string{"query"}),
	}
}

func (t *SearchHabitsTool) ParseArgs(raw json.RawMessage) (any, error) {
	var args SearchHabitsArgs
	if err := json.Unmarshal(raw, &args); err != nil {
		return nil, fmt.Errorf("parse search_habits args: %w", err)
	}
	return &args, nil
}

func (t *SearchHabitsTool) Execute(ctx context.Context, userID string, a any) (any, error) {
	args := a.(*SearchHabitsArgs)

	habits, err := t.queries.SearchHabits(ctx, store.SearchHabitsParams{
		UserID:  userID,
		Column2: pgtype.Text{String: args.Query, Valid: true},
	})
	if err != nil {
		return nil, fmt.Errorf("search habits: %w", err)
	}

	type habitItem struct {
		ID        string `json:"id"`
		Title     string `json:"title"`
		Frequency string `json:"frequency"`
	}

	items := make([]habitItem, 0, len(habits))
	for _, h := range habits {
		items = append(items, habitItem{
			ID:        uuidToString(h.ID),
			Title:     pgtextToString(h.Title),
			Frequency: ifaceToString(h.Frequency),
		})
	}

	return map[string]interface{}{"habits": items}, nil
}
