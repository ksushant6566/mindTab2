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
// GetDailyBriefingTool
// ---------------------------------------------------------------------------

// GetDailyBriefingTool provides a comprehensive daily briefing including habits,
// goals, activity summaries, and proactive alerts. Designed to answer
// "What should I do today?" in a single call.
type GetDailyBriefingTool struct {
	queries store.Querier
}

// NewGetDailyBriefingTool returns a new GetDailyBriefingTool.
func NewGetDailyBriefingTool(queries store.Querier) *GetDailyBriefingTool {
	return &GetDailyBriefingTool{queries: queries}
}

func (t *GetDailyBriefingTool) Name() string { return "get_daily_briefing" }

func (t *GetDailyBriefingTool) Description() string {
	return "Get a comprehensive daily briefing including today's habits status, active goals, recent activity, and proactive alerts. Use this as the first tool call when the user asks what they should do today or wants a summary of their current state."
}

func (t *GetDailyBriefingTool) Schema() llm.ToolDefinition {
	return llm.ToolDefinition{
		Name:        t.Name(),
		Description: t.Description(),
		Parameters:  jsonSchema("object", nil, ""),
	}
}

func (t *GetDailyBriefingTool) ParseArgs(_ json.RawMessage) (any, error) {
	return nil, nil
}

func (t *GetDailyBriefingTool) Execute(ctx context.Context, userID string, _ any) (any, error) {
	now := time.Now()
	today := now.Format("2006-01-02")

	// -----------------------------------------------------------------
	// 1. Habits section
	// -----------------------------------------------------------------
	habits, err := t.queries.ListHabits(ctx, userID)
	if err != nil {
		return nil, fmt.Errorf("daily briefing: list habits: %w", err)
	}

	trackers, err := t.queries.ListHabitTrackerRecords(ctx, userID)
	if err != nil {
		return nil, fmt.Errorf("daily briefing: list tracker records: %w", err)
	}

	// Build a map of habit ID -> title for easy lookup.
	habitTitleByID := make(map[string]string, len(habits))
	for _, h := range habits {
		habitTitleByID[uuidToString(h.ID)] = pgtextToString(h.Title)
	}

	// Group tracker dates by habit ID (for streaks) and filter today's completions.
	habitDates := make(map[string][]time.Time)
	todayCompletedSet := make(map[string]bool)
	yesterdayCompletedSet := make(map[string]bool)
	yesterday := now.AddDate(0, 0, -1).Format("2006-01-02")

	for _, tr := range trackers {
		if !tr.Date.Valid {
			continue
		}
		hID := uuidToString(tr.HabitID)
		habitDates[hID] = append(habitDates[hID], tr.Date.Time)
		dateStr := tr.Date.Time.Format("2006-01-02")
		if dateStr == today {
			todayCompletedSet[hID] = true
		}
		if dateStr == yesterday {
			yesterdayCompletedSet[hID] = true
		}
	}

	todayHabitCompletions := len(todayCompletedSet)

	type habitBriefItem struct {
		ID             string `json:"id"`
		Title          string `json:"title"`
		CompletedToday bool   `json:"completed_today"`
	}

	completedHabits := make([]habitBriefItem, 0)
	incompleteHabits := make([]habitBriefItem, 0)
	for _, h := range habits {
		hID := uuidToString(h.ID)
		item := habitBriefItem{
			ID:             hID,
			Title:          pgtextToString(h.Title),
			CompletedToday: todayCompletedSet[hID],
		}
		if todayCompletedSet[hID] {
			completedHabits = append(completedHabits, item)
		} else {
			incompleteHabits = append(incompleteHabits, item)
		}
	}

	habitSection := map[string]any{
		"total":      len(habits),
		"completed":  todayHabitCompletions,
		"incomplete": incompleteHabits,
		"completed_list": completedHabits,
	}

	// -----------------------------------------------------------------
	// 2. Goals section
	// -----------------------------------------------------------------
	goals, err := t.queries.ListGoals(ctx, store.ListGoalsParams{
		UserID:  userID,
		Column2: false,            // non-archived
		Column3: pgtype.UUID{},    // no project filter
	})
	if err != nil {
		return nil, fmt.Errorf("daily briefing: list goals: %w", err)
	}

	type goalBriefItem struct {
		ID           string `json:"id"`
		Title        string `json:"title"`
		Status       string `json:"status"`
		Priority     string `json:"priority"`
		DaysInStatus int    `json:"days_in_status"`
	}

	inProgressGoals := make([]goalBriefItem, 0)
	pendingGoals := make([]goalBriefItem, 0)
	todayGoalCompletions := 0

	for _, g := range goals {
		status := ifaceToString(g.Status)
		daysInStatus := 0
		if g.UpdatedAt.Valid {
			daysInStatus = int(now.Sub(g.UpdatedAt.Time).Hours() / 24)
		}

		item := goalBriefItem{
			ID:           uuidToString(g.ID),
			Title:        pgtextToString(g.Title),
			Status:       status,
			Priority:     ifaceToString(g.Priority),
			DaysInStatus: daysInStatus,
		}

		switch status {
		case "in_progress":
			inProgressGoals = append(inProgressGoals, item)
		case "pending":
			pendingGoals = append(pendingGoals, item)
		case "completed":
			if g.CompletedAt.Valid && g.CompletedAt.Time.Format("2006-01-02") == today {
				todayGoalCompletions++
			}
		}
	}

	goalSection := map[string]any{
		"in_progress":        inProgressGoals,
		"pending":            pendingGoals,
		"completed_today":    todayGoalCompletions,
	}

	// -----------------------------------------------------------------
	// 3. Activity today
	// -----------------------------------------------------------------
	todayStart := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())
	todayTimestamp := pgtype.Timestamptz{Time: todayStart, Valid: true}

	journalRowsToday, err := t.queries.GetJournalActivity(ctx, store.GetJournalActivityParams{
		UserID:    userID,
		CreatedAt: todayTimestamp,
	})
	if err != nil {
		return nil, fmt.Errorf("daily briefing: get journal activity today: %w", err)
	}

	activityToday := map[string]any{
		"habit_completions": todayHabitCompletions,
		"goal_completions":  todayGoalCompletions,
		"journal_entries":   len(journalRowsToday),
	}

	// -----------------------------------------------------------------
	// 4. Activity this week
	// -----------------------------------------------------------------
	weekStart := now.AddDate(0, 0, -7)
	weekStartTimestamp := pgtype.Timestamptz{Time: weekStart, Valid: true}
	weekStartDate := pgtype.Date{
		Time:  time.Date(weekStart.Year(), weekStart.Month(), weekStart.Day(), 0, 0, 0, 0, weekStart.Location()),
		Valid: true,
	}

	// Count habit completions in the last 7 days from tracker records.
	weekHabitCompletions := 0
	for _, tr := range trackers {
		if tr.Date.Valid && !tr.Date.Time.Before(weekStart.Truncate(24*time.Hour)) {
			weekHabitCompletions++
		}
	}

	weekHabitDates, err := t.queries.GetHabitTrackerActivity(ctx, store.GetHabitTrackerActivityParams{
		UserID:  userID,
		Column2: weekStartDate,
	})
	if err != nil {
		return nil, fmt.Errorf("daily briefing: get habit tracker activity week: %w", err)
	}
	// Use the query result for week count to be consistent.
	weekHabitCompletions = len(weekHabitDates)

	goalRowsWeek, err := t.queries.GetGoalActivity(ctx, store.GetGoalActivityParams{
		UserID:    userID,
		CreatedAt: weekStartTimestamp,
	})
	if err != nil {
		return nil, fmt.Errorf("daily briefing: get goal activity week: %w", err)
	}
	weekGoalCompletions := 0
	for _, row := range goalRowsWeek {
		if ifaceToString(row.Status) == "completed" {
			weekGoalCompletions++
		}
	}

	journalRowsWeek, err := t.queries.GetJournalActivity(ctx, store.GetJournalActivityParams{
		UserID:    userID,
		CreatedAt: weekStartTimestamp,
	})
	if err != nil {
		return nil, fmt.Errorf("daily briefing: get journal activity week: %w", err)
	}

	avgDailyHabits := float64(weekHabitCompletions) / 7.0

	activityWeek := map[string]any{
		"habit_completions":  weekHabitCompletions,
		"goal_completions":   weekGoalCompletions,
		"journal_entries":    len(journalRowsWeek),
		"avg_daily_habits":   math.Round(avgDailyHabits*100) / 100,
	}

	// -----------------------------------------------------------------
	// 5. Alerts
	// -----------------------------------------------------------------
	alerts := make([]string, 0)

	// Alert: Goal pending > 14 days
	for _, g := range pendingGoals {
		if g.DaysInStatus > 14 {
			alerts = append(alerts, fmt.Sprintf("Goal '%s' has been pending for %d days", g.Title, g.DaysInStatus))
		}
	}

	// Alert: Goal in_progress > 30 days
	for _, g := range inProgressGoals {
		if g.DaysInStatus > 30 {
			alerts = append(alerts, fmt.Sprintf("Goal '%s' has been in progress for %d days", g.Title, g.DaysInStatus))
		}
	}

	// Alert: This week's habit rate < last 30 days average
	if len(habits) > 0 {
		weekRate := float64(weekHabitCompletions) / (7.0 * float64(len(habits))) * 100

		// Compute last 30 days average for comparison.
		monthStart := now.AddDate(0, 0, -30)
		monthStartDate := pgtype.Date{
			Time:  time.Date(monthStart.Year(), monthStart.Month(), monthStart.Day(), 0, 0, 0, 0, monthStart.Location()),
			Valid: true,
		}
		monthHabitDates, err := t.queries.GetHabitTrackerActivity(ctx, store.GetHabitTrackerActivityParams{
			UserID:  userID,
			Column2: monthStartDate,
		})
		if err == nil && len(monthHabitDates) > 0 {
			monthRate := float64(len(monthHabitDates)) / (30.0 * float64(len(habits))) * 100
			if monthRate > 0 && weekRate < monthRate {
				alerts = append(alerts, fmt.Sprintf(
					"Your habit completion rate this week (%.0f%%) is below your monthly average (%.0f%%)",
					weekRate, monthRate,
				))
			}
		}
	}

	// Alert: Streak at risk — completed yesterday but not today, streak >= 3
	for _, h := range habits {
		hID := uuidToString(h.ID)
		if !yesterdayCompletedSet[hID] || todayCompletedSet[hID] {
			continue
		}
		// Compute streak as of yesterday (include yesterday, check consecutive days ending yesterday).
		dates := habitDates[hID]
		streak := computeCurrentStreak(dates)
		// computeCurrentStreak counts from today backwards. Since today is not completed,
		// the streak from today is 0. We need the streak as of yesterday.
		// Temporarily compute by checking yesterday-rooted streak.
		yesterdayStreak := computeStreakAsOfYesterday(dates)
		if yesterdayStreak >= 3 {
			title := pgtextToString(h.Title)
			alerts = append(alerts, fmt.Sprintf("Your %s streak (%d days) is at risk", title, yesterdayStreak))
		}
		_ = streak // used computeCurrentStreak for reference only
	}

	// Alert: All habits completed today
	if len(habits) > 0 && todayHabitCompletions == len(habits) {
		alerts = append(alerts, "All habits completed today!")
	}

	// -----------------------------------------------------------------
	// Assemble final briefing
	// -----------------------------------------------------------------
	briefing := map[string]any{
		"date":           today,
		"habits":         habitSection,
		"goals":          goalSection,
		"activity_today": activityToday,
		"activity_week":  activityWeek,
		"alerts":         alerts,
	}

	return briefing, nil
}

// computeStreakAsOfYesterday counts consecutive days ending at yesterday.
func computeStreakAsOfYesterday(dates []time.Time) int {
	if len(dates) == 0 {
		return 0
	}

	yesterday := time.Now().AddDate(0, 0, -1).Truncate(24 * time.Hour)
	streak := 0
	expected := yesterday

	// Sort descending (most recent first).
	sorted := make([]time.Time, len(dates))
	copy(sorted, dates)
	for i := 0; i < len(sorted); i++ {
		for j := i + 1; j < len(sorted); j++ {
			if sorted[j].After(sorted[i]) {
				sorted[i], sorted[j] = sorted[j], sorted[i]
			}
		}
	}

	for _, d := range sorted {
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
