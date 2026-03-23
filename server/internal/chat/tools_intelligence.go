package chat

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"sync"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/ksushant6566/mindtab/server/internal/providers/llm"
	"github.com/ksushant6566/mindtab/server/internal/search"
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

// ---------------------------------------------------------------------------
// SearchEverythingTool
// ---------------------------------------------------------------------------

// SearchEverythingArgs holds validated arguments for search_everything.
type SearchEverythingArgs struct {
	Query string `json:"query" validate:"required,min=1"`
}

// SearchEverythingTool searches across goals, journals, habits, and vault items.
type SearchEverythingTool struct {
	queries store.Querier
	search  *search.SemanticSearch // may be nil
}

// NewSearchEverythingTool returns a new SearchEverythingTool.
func NewSearchEverythingTool(queries store.Querier, s *search.SemanticSearch) *SearchEverythingTool {
	return &SearchEverythingTool{queries: queries, search: s}
}

func (t *SearchEverythingTool) Name() string { return "search_everything" }

func (t *SearchEverythingTool) Description() string {
	return "Search across all user data — goals, journals, habits, and saved vault items — using a keyword query. Returns the top matches from each domain. Use this when the user asks to find something or wants to search their data."
}

func (t *SearchEverythingTool) Schema() llm.ToolDefinition {
	return llm.ToolDefinition{
		Name:        t.Name(),
		Description: t.Description(),
		Parameters: jsonSchemaWithRequired("object", map[string]interface{}{
			"query": jsonSchema("string", nil, "The search query string"),
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
	query := args.Query

	searchParam := pgtype.Text{String: query, Valid: true}

	// Run keyword searches concurrently.
	var (
		wg       sync.WaitGroup
		mu       sync.Mutex
		errs     []error
		goals    []store.MindmapGoal
		journals []store.MindmapJournal
		habits   []store.MindmapHabit
		vault    []search.SearchResult
	)

	wg.Add(3)

	go func() {
		defer wg.Done()
		res, err := t.queries.SearchGoals(ctx, store.SearchGoalsParams{
			UserID:  userID,
			Column2: searchParam,
		})
		mu.Lock()
		defer mu.Unlock()
		if err != nil {
			errs = append(errs, fmt.Errorf("search goals: %w", err))
		} else {
			goals = res
		}
	}()

	go func() {
		defer wg.Done()
		res, err := t.queries.SearchJournals(ctx, store.SearchJournalsParams{
			UserID:  userID,
			Column2: searchParam,
		})
		mu.Lock()
		defer mu.Unlock()
		if err != nil {
			errs = append(errs, fmt.Errorf("search journals: %w", err))
		} else {
			journals = res
		}
	}()

	go func() {
		defer wg.Done()
		res, err := t.queries.SearchHabits(ctx, store.SearchHabitsParams{
			UserID:  userID,
			Column2: searchParam,
		})
		mu.Lock()
		defer mu.Unlock()
		if err != nil {
			errs = append(errs, fmt.Errorf("search habits: %w", err))
		} else {
			habits = res
		}
	}()

	// Semantic vault search (optional).
	if t.search != nil {
		wg.Add(1)
		go func() {
			defer wg.Done()
			res, err := t.search.Search(ctx, userID, query, 5)
			mu.Lock()
			defer mu.Unlock()
			if err != nil {
				errs = append(errs, fmt.Errorf("search vault: %w", err))
			} else {
				vault = res
			}
		}()
	}

	wg.Wait()

	if len(errs) > 0 {
		return nil, errs[0]
	}

	// Shape goal results.
	type goalItem struct {
		ID       string `json:"id"`
		Title    string `json:"title"`
		Status   string `json:"status"`
		Priority string `json:"priority"`
	}
	goalItems := make([]goalItem, 0, len(goals))
	for _, g := range goals {
		goalItems = append(goalItems, goalItem{
			ID:       uuidToString(g.ID),
			Title:    pgtextToString(g.Title),
			Status:   ifaceToString(g.Status),
			Priority: ifaceToString(g.Priority),
		})
	}

	// Shape journal results.
	type journalItem struct {
		ID    string `json:"id"`
		Title string `json:"title"`
	}
	journalItems := make([]journalItem, 0, len(journals))
	for _, j := range journals {
		journalItems = append(journalItems, journalItem{
			ID:    uuidToString(j.ID),
			Title: j.Title,
		})
	}

	// Shape habit results.
	type habitItem struct {
		ID    string `json:"id"`
		Title string `json:"title"`
	}
	habitItems := make([]habitItem, 0, len(habits))
	for _, h := range habits {
		habitItems = append(habitItems, habitItem{
			ID:    uuidToString(h.ID),
			Title: pgtextToString(h.Title),
		})
	}

	return map[string]any{
		"query":    query,
		"goals":    goalItems,
		"journals": journalItems,
		"habits":   habitItems,
		"vault":    vault,
	}, nil
}

// ---------------------------------------------------------------------------
// GetHabitPatternsTool
// ---------------------------------------------------------------------------

// GetHabitPatternsTool analyses habit completion patterns over the last 90 days.
type GetHabitPatternsTool struct {
	queries store.Querier
}

// NewGetHabitPatternsTool returns a new GetHabitPatternsTool.
func NewGetHabitPatternsTool(queries store.Querier) *GetHabitPatternsTool {
	return &GetHabitPatternsTool{queries: queries}
}

func (t *GetHabitPatternsTool) Name() string { return "get_habit_patterns" }

func (t *GetHabitPatternsTool) Description() string {
	return "Analyse habit completion patterns over the last 90 days. Returns best/worst days of the week globally and per habit, along with completion rates. Use when the user asks about their habit trends, patterns, or best days."
}

func (t *GetHabitPatternsTool) Schema() llm.ToolDefinition {
	return llm.ToolDefinition{
		Name:        t.Name(),
		Description: t.Description(),
		Parameters:  jsonSchema("object", nil, ""),
	}
}

func (t *GetHabitPatternsTool) ParseArgs(_ json.RawMessage) (any, error) {
	return nil, nil
}

var weekdayNames = [7]string{"Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"}

func (t *GetHabitPatternsTool) Execute(ctx context.Context, userID string, _ any) (any, error) {
	habits, err := t.queries.ListHabits(ctx, userID)
	if err != nil {
		return nil, fmt.Errorf("get habit patterns: list habits: %w", err)
	}

	records, err := t.queries.ListHabitTrackerRecords(ctx, userID)
	if err != nil {
		return nil, fmt.Errorf("get habit patterns: list records: %w", err)
	}

	// Filter to last 90 days.
	cutoff := time.Now().AddDate(0, 0, -90).Truncate(24 * time.Hour)
	var recentRecords []store.MindmapHabitTracker
	for _, r := range records {
		if r.Date.Valid && !r.Date.Time.Before(cutoff) {
			recentRecords = append(recentRecords, r)
		}
	}

	// Global day-of-week completion counts.
	// dayCompletions[weekday] = number of completions on that weekday.
	var dayCompletions [7]int
	// Per habit: habitDayCompletions[habitID][weekday] = count.
	habitDayCompletions := make(map[string][7]int)

	for _, r := range recentRecords {
		dow := int(r.Date.Time.Weekday()) // 0=Sunday … 6=Saturday
		dayCompletions[dow]++
		hID := uuidToString(r.HabitID)
		counts := habitDayCompletions[hID]
		counts[dow]++
		habitDayCompletions[hID] = counts
	}

	// Each weekday appears approximately 90/7 ≈ 13 times in the window.
	const daysInWindow = 90
	const weeksApprox = daysInWindow / 7

	// Compute global best / worst day.
	bestDayIdx, worstDayIdx := 0, 0
	for i := 1; i < 7; i++ {
		if dayCompletions[i] > dayCompletions[bestDayIdx] {
			bestDayIdx = i
		}
		if dayCompletions[i] < dayCompletions[worstDayIdx] {
			worstDayIdx = i
		}
	}

	type dayPattern struct {
		Day         string  `json:"day"`
		Completions int     `json:"completions"`
		Rate        float64 `json:"rate"`
	}

	globalDays := make([]dayPattern, 7)
	for i := 0; i < 7; i++ {
		rate := 0.0
		if weeksApprox > 0 && len(habits) > 0 {
			rate = float64(dayCompletions[i]) / float64(weeksApprox*len(habits)) * 100
			rate = math.Round(rate*100) / 100
		}
		globalDays[i] = dayPattern{
			Day:         weekdayNames[i],
			Completions: dayCompletions[i],
			Rate:        rate,
		}
	}

	// Per-habit breakdown.
	type habitPattern struct {
		ID          string       `json:"id"`
		Title       string       `json:"title"`
		OverallRate float64      `json:"overall_rate"`
		BestDay     string       `json:"best_day"`
		WorstDay    string       `json:"worst_day"`
		Days        []dayPattern `json:"days"`
	}

	habitTitleByID := make(map[string]string, len(habits))
	for _, h := range habits {
		habitTitleByID[uuidToString(h.ID)] = pgtextToString(h.Title)
	}

	habitPatterns := make([]habitPattern, 0, len(habits))
	for _, h := range habits {
		hID := uuidToString(h.ID)
		counts := habitDayCompletions[hID]

		totalCompletions := 0
		for _, c := range counts {
			totalCompletions += c
		}

		overallRate := 0.0
		if daysInWindow > 0 {
			overallRate = math.Round(float64(totalCompletions)/float64(daysInWindow)*100*100) / 100
		}

		bestIdx, worstIdx := 0, 0
		for i := 1; i < 7; i++ {
			if counts[i] > counts[bestIdx] {
				bestIdx = i
			}
			if counts[i] < counts[worstIdx] {
				worstIdx = i
			}
		}

		days := make([]dayPattern, 7)
		for i := 0; i < 7; i++ {
			r := 0.0
			if weeksApprox > 0 {
				r = math.Round(float64(counts[i])/float64(weeksApprox)*100*100) / 100
			}
			days[i] = dayPattern{
				Day:         weekdayNames[i],
				Completions: counts[i],
				Rate:        r,
			}
		}

		habitPatterns = append(habitPatterns, habitPattern{
			ID:          hID,
			Title:       habitTitleByID[hID],
			OverallRate: overallRate,
			BestDay:     weekdayNames[bestIdx],
			WorstDay:    weekdayNames[worstIdx],
			Days:        days,
		})
	}

	return map[string]any{
		"window_days":  daysInWindow,
		"best_day":     weekdayNames[bestDayIdx],
		"worst_day":    weekdayNames[worstDayIdx],
		"by_day":       globalDays,
		"habit_detail": habitPatterns,
	}, nil
}

// ---------------------------------------------------------------------------
// ComparePeriodsTool
// ---------------------------------------------------------------------------

// ComparePeriodsArgs holds validated arguments for ComparePeriodsTool.
type ComparePeriodsArgs struct {
	Period1Start string `json:"period1_start" validate:"required"`
	Period1End   string `json:"period1_end"   validate:"required"`
	Period2Start string `json:"period2_start" validate:"required"`
	Period2End   string `json:"period2_end"   validate:"required"`
}

// ComparePeriodsTool compares productivity metrics between two time periods.
type ComparePeriodsTool struct {
	queries store.Querier
}

// NewComparePeriodsTool returns a new ComparePeriodsTool.
func NewComparePeriodsTool(queries store.Querier) *ComparePeriodsTool {
	return &ComparePeriodsTool{queries: queries}
}

func (t *ComparePeriodsTool) Name() string { return "compare_periods" }

func (t *ComparePeriodsTool) Description() string {
	return "Compare productivity metrics (goals created, goals completed, habit completions, journal entries, habit rate) between two date ranges. Useful for answering 'how did I do this month vs last month?'"
}

func (t *ComparePeriodsTool) Schema() llm.ToolDefinition {
	return llm.ToolDefinition{
		Name:        t.Name(),
		Description: t.Description(),
		Parameters: jsonSchemaWithRequired("object", map[string]interface{}{
			"period1_start": jsonSchema("string", nil, "Start date of period 1 (YYYY-MM-DD)"),
			"period1_end":   jsonSchema("string", nil, "End date of period 1 (YYYY-MM-DD)"),
			"period2_start": jsonSchema("string", nil, "Start date of period 2 (YYYY-MM-DD)"),
			"period2_end":   jsonSchema("string", nil, "End date of period 2 (YYYY-MM-DD)"),
		}, []string{"period1_start", "period1_end", "period2_start", "period2_end"}),
	}
}

func (t *ComparePeriodsTool) ParseArgs(raw json.RawMessage) (any, error) {
	var args ComparePeriodsArgs
	if err := json.Unmarshal(raw, &args); err != nil {
		return nil, fmt.Errorf("parse compare_periods args: %w", err)
	}
	return &args, nil
}

func (t *ComparePeriodsTool) Execute(ctx context.Context, userID string, a any) (any, error) {
	args := a.(*ComparePeriodsArgs)

	p1Start, err := time.Parse("2006-01-02", args.Period1Start)
	if err != nil {
		return nil, fmt.Errorf("invalid period1_start: %w", err)
	}
	p1End, err := time.Parse("2006-01-02", args.Period1End)
	if err != nil {
		return nil, fmt.Errorf("invalid period1_end: %w", err)
	}
	p2Start, err := time.Parse("2006-01-02", args.Period2Start)
	if err != nil {
		return nil, fmt.Errorf("invalid period2_start: %w", err)
	}
	p2End, err := time.Parse("2006-01-02", args.Period2End)
	if err != nil {
		return nil, fmt.Errorf("invalid period2_end: %w", err)
	}

	// Preload habits for rate calculation.
	habits, err := t.queries.ListHabits(ctx, userID)
	if err != nil {
		return nil, fmt.Errorf("compare periods: list habits: %w", err)
	}
	totalHabits := len(habits)

	computePeriodStats := func(start, end time.Time) (map[string]any, error) {
		pgStart := pgtype.Timestamptz{Time: start, Valid: true}

		goalRows, err := t.queries.GetGoalActivity(ctx, store.GetGoalActivityParams{
			UserID:    userID,
			CreatedAt: pgStart,
		})
		if err != nil {
			return nil, fmt.Errorf("get goal activity: %w", err)
		}

		endDay := end.AddDate(0, 0, 1) // exclusive upper bound for filtering
		goalsCreated := 0
		goalsCompleted := 0
		for _, row := range goalRows {
			if !row.CreatedAt.Valid {
				continue
			}
			ts := row.CreatedAt.Time
			if (ts.Equal(start) || ts.After(start)) && ts.Before(endDay) {
				goalsCreated++
				if ifaceToString(row.Status) == "completed" {
					goalsCompleted++
				}
			}
		}

		pgStartDate := pgtype.Date{
			Time:  time.Date(start.Year(), start.Month(), start.Day(), 0, 0, 0, 0, start.Location()),
			Valid: true,
		}
		trackerDates, err := t.queries.GetHabitTrackerActivity(ctx, store.GetHabitTrackerActivityParams{
			UserID:  userID,
			Column2: pgStartDate,
		})
		if err != nil {
			return nil, fmt.Errorf("get habit tracker activity: %w", err)
		}

		endDateTrunc := time.Date(end.Year(), end.Month(), end.Day(), 23, 59, 59, 0, end.Location())
		habitCompletions := 0
		for _, d := range trackerDates {
			if d.Valid && !d.Time.After(endDateTrunc) {
				habitCompletions++
			}
		}

		journalRows, err := t.queries.GetJournalActivity(ctx, store.GetJournalActivityParams{
			UserID:    userID,
			CreatedAt: pgStart,
		})
		if err != nil {
			return nil, fmt.Errorf("get journal activity: %w", err)
		}

		journalEntries := 0
		for _, row := range journalRows {
			if !row.CreatedAt.Valid {
				continue
			}
			ts := row.CreatedAt.Time
			if (ts.Equal(start) || ts.After(start)) && ts.Before(endDay) {
				journalEntries++
			}
		}

		days := int(end.Sub(start).Hours()/24) + 1
		var habitRate float64
		if totalHabits > 0 && days > 0 {
			habitRate = math.Round(float64(habitCompletions)/float64(totalHabits*days)*10000) / 100
		}

		return map[string]any{
			"start":             start.Format("2006-01-02"),
			"end":               end.Format("2006-01-02"),
			"days":              days,
			"goals_created":     goalsCreated,
			"goals_completed":   goalsCompleted,
			"habit_completions": habitCompletions,
			"journal_entries":   journalEntries,
			"habit_rate":        habitRate,
		}, nil
	}

	stats1, err := computePeriodStats(p1Start, p1End)
	if err != nil {
		return nil, fmt.Errorf("compare periods: period1: %w", err)
	}
	stats2, err := computePeriodStats(p2Start, p2End)
	if err != nil {
		return nil, fmt.Errorf("compare periods: period2: %w", err)
	}

	formatDelta := func(v1, v2 int) string {
		d := v1 - v2
		if d >= 0 {
			return fmt.Sprintf("+%d", d)
		}
		return fmt.Sprintf("%d", d)
	}
	formatDeltaF := func(v1, v2 float64) string {
		d := v1 - v2
		if d >= 0 {
			return fmt.Sprintf("+%.2f", d)
		}
		return fmt.Sprintf("%.2f", d)
	}

	deltas := map[string]any{
		"goals_created":     formatDelta(stats1["goals_created"].(int), stats2["goals_created"].(int)),
		"goals_completed":   formatDelta(stats1["goals_completed"].(int), stats2["goals_completed"].(int)),
		"habit_completions": formatDelta(stats1["habit_completions"].(int), stats2["habit_completions"].(int)),
		"journal_entries":   formatDelta(stats1["journal_entries"].(int), stats2["journal_entries"].(int)),
		"habit_rate":        formatDeltaF(stats1["habit_rate"].(float64), stats2["habit_rate"].(float64)),
	}

	return map[string]any{
		"period1": stats1,
		"period2": stats2,
		"deltas":  deltas,
	}, nil
}

// ---------------------------------------------------------------------------
// GetStaleItemsTool
// ---------------------------------------------------------------------------

// GetStaleItemsArgs holds validated arguments for GetStaleItemsTool.
type GetStaleItemsArgs struct {
	DaysThreshold *int `json:"days_threshold" validate:"omitempty,min=1,max=365"`
}

// GetStaleItemsTool surfaces goals, projects, and habits that have had no
// recent activity.
type GetStaleItemsTool struct {
	queries store.Querier
}

// NewGetStaleItemsTool returns a new GetStaleItemsTool.
func NewGetStaleItemsTool(queries store.Querier) *GetStaleItemsTool {
	return &GetStaleItemsTool{queries: queries}
}

func (t *GetStaleItemsTool) Name() string { return "get_stale_items" }

func (t *GetStaleItemsTool) Description() string {
	return "Find goals, projects, and habits that have been neglected or have had no activity for longer than a threshold (default 14 days). Useful for 'what have I been ignoring?' questions."
}

func (t *GetStaleItemsTool) Schema() llm.ToolDefinition {
	return llm.ToolDefinition{
		Name:        t.Name(),
		Description: t.Description(),
		Parameters: jsonSchema("object", map[string]interface{}{
			"days_threshold": jsonSchema("integer", nil, "Number of days without activity to consider an item stale. Defaults to 14. Min 1, max 365."),
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

func (t *GetStaleItemsTool) Execute(ctx context.Context, userID string, a any) (any, error) {
	args := a.(*GetStaleItemsArgs)

	threshold := 14
	if args.DaysThreshold != nil {
		threshold = *args.DaysThreshold
	}

	now := time.Now()
	cutoff := now.AddDate(0, 0, -threshold)

	// -----------------------------------------------------------------
	// 1. Stale goals — pending/in_progress with UpdatedAt before cutoff
	// -----------------------------------------------------------------
	allGoals, err := t.queries.ListGoals(ctx, store.ListGoalsParams{
		UserID:  userID,
		Column2: false,
		Column3: pgtype.UUID{},
	})
	if err != nil {
		return nil, fmt.Errorf("get stale items: list goals: %w", err)
	}

	type staleGoal struct {
		ID              string `json:"id"`
		Title           string `json:"title"`
		Status          string `json:"status"`
		Priority        string `json:"priority"`
		DaysSinceUpdate int    `json:"days_since_update"`
	}

	staleGoals := make([]staleGoal, 0)
	for _, g := range allGoals {
		status := ifaceToString(g.Status)
		if status != "pending" && status != "in_progress" {
			continue
		}
		if !g.UpdatedAt.Valid {
			continue
		}
		if g.UpdatedAt.Time.Before(cutoff) {
			days := int(now.Sub(g.UpdatedAt.Time).Hours() / 24)
			staleGoals = append(staleGoals, staleGoal{
				ID:              uuidToString(g.ID),
				Title:           pgtextToString(g.Title),
				Status:          status,
				Priority:        ifaceToString(g.Priority),
				DaysSinceUpdate: days,
			})
		}
	}

	// -----------------------------------------------------------------
	// 2. Stale projects — no goals updated after cutoff
	// -----------------------------------------------------------------
	projects, err := t.queries.ListProjects(ctx, store.ListProjectsParams{
		CreatedBy: userID,
		Column2:   false,
		Column3:   nil,
	})
	if err != nil {
		return nil, fmt.Errorf("get stale items: list projects: %w", err)
	}

	// Build map of project ID -> most recent goal update time and active goal count.
	type projectActivityInfo struct {
		mostRecentGoalUpdate time.Time
		activeGoalCount      int
	}
	projectActivityMap := make(map[string]*projectActivityInfo)
	for _, p := range projects {
		pID := uuidToString(p.ID)
		projectActivityMap[pID] = &projectActivityInfo{}
	}

	for _, g := range allGoals {
		if !g.ProjectID.Valid {
			continue
		}
		pID := uuidToString(g.ProjectID)
		pa, ok := projectActivityMap[pID]
		if !ok {
			continue
		}
		// Count active (non-archived) goals.
		gStatus := ifaceToString(g.Status)
		if gStatus != "archived" {
			pa.activeGoalCount++
		}
		// Track most recent goal update.
		if g.UpdatedAt.Valid {
			if pa.mostRecentGoalUpdate.IsZero() || g.UpdatedAt.Time.After(pa.mostRecentGoalUpdate) {
				pa.mostRecentGoalUpdate = g.UpdatedAt.Time
			}
		}
	}

	type staleProject struct {
		ID                string `json:"id"`
		Name              string `json:"name"`
		Status            string `json:"status"`
		ActiveGoalCount   int    `json:"active_goal_count"`
		DaysSinceActivity int    `json:"days_since_activity"`
	}

	staleProjects := make([]staleProject, 0)
	for _, p := range projects {
		pID := uuidToString(p.ID)
		pa := projectActivityMap[pID]

		// A project is stale if it has no goals updated after the cutoff.
		if pa.mostRecentGoalUpdate.IsZero() || pa.mostRecentGoalUpdate.Before(cutoff) {
			var daysSince int
			if !pa.mostRecentGoalUpdate.IsZero() {
				daysSince = int(now.Sub(pa.mostRecentGoalUpdate).Hours() / 24)
			} else {
				// No goals at all; use project's own updated_at.
				if p.UpdatedAt.Valid {
					daysSince = int(now.Sub(p.UpdatedAt.Time).Hours() / 24)
				}
			}
			staleProjects = append(staleProjects, staleProject{
				ID:                uuidToString(p.ID),
				Name:              pgtextToString(p.Name),
				Status:            ifaceToString(p.Status),
				ActiveGoalCount:   pa.activeGoalCount,
				DaysSinceActivity: daysSince,
			})
		}
	}

	// -----------------------------------------------------------------
	// 3. Neglected habits — most recent completion > threshold days ago
	// -----------------------------------------------------------------
	habits, err := t.queries.ListHabits(ctx, userID)
	if err != nil {
		return nil, fmt.Errorf("get stale items: list habits: %w", err)
	}

	trackers, err := t.queries.ListHabitTrackerRecords(ctx, userID)
	if err != nil {
		return nil, fmt.Errorf("get stale items: list tracker records: %w", err)
	}

	// Group tracker dates by habit ID.
	habitDatesMap := make(map[string][]time.Time)
	for _, tr := range trackers {
		if tr.Date.Valid {
			hID := uuidToString(tr.HabitID)
			habitDatesMap[hID] = append(habitDatesMap[hID], tr.Date.Time)
		}
	}

	type neglectedHabit struct {
		ID        string `json:"id"`
		Title     string `json:"title"`
		DaysSince int    `json:"days_since"`
		WasStreak int    `json:"was_streak"`
	}

	neglectedHabits := make([]neglectedHabit, 0)
	for _, h := range habits {
		hID := uuidToString(h.ID)
		dates := habitDatesMap[hID]

		if len(dates) == 0 {
			// Never completed — stale by definition if old enough.
			daysSince := threshold + 1
			if h.CreatedAt.Valid {
				daysSince = int(now.Sub(h.CreatedAt.Time).Hours() / 24)
			}
			if daysSince >= threshold {
				neglectedHabits = append(neglectedHabits, neglectedHabit{
					ID:        hID,
					Title:     pgtextToString(h.Title),
					DaysSince: daysSince,
					WasStreak: 0,
				})
			}
			continue
		}

		// Find most recent completion.
		mostRecent := dates[0]
		for _, d := range dates[1:] {
			if d.After(mostRecent) {
				mostRecent = d
			}
		}

		if mostRecent.Before(cutoff) {
			daysSince := int(now.Sub(mostRecent).Hours() / 24)
			wasStreak := computeStreakAsOfDate(dates, mostRecent)
			neglectedHabits = append(neglectedHabits, neglectedHabit{
				ID:        hID,
				Title:     pgtextToString(h.Title),
				DaysSince: daysSince,
				WasStreak: wasStreak,
			})
		}
	}

	return map[string]any{
		"threshold_days":   threshold,
		"stale_goals":      staleGoals,
		"stale_projects":   staleProjects,
		"neglected_habits": neglectedHabits,
	}, nil
}

// computeStreakAsOfDate counts consecutive days ending at the given anchor date.
func computeStreakAsOfDate(dates []time.Time, anchor time.Time) int {
	if len(dates) == 0 {
		return 0
	}

	anchorDay := anchor.Truncate(24 * time.Hour)
	streak := 0
	expected := anchorDay

	// Sort descending.
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
		if day.After(anchorDay) {
			continue // skip entries after anchor
		}
		if day.Equal(expected) {
			streak++
			expected = expected.AddDate(0, 0, -1)
		} else if day.Before(expected) {
			break
		}
	}
	return streak
}
