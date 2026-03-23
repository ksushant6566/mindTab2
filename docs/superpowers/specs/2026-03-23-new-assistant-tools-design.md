# New Assistant Tools — Design Spec

**Date:** 2026-03-23
**Status:** Approved

## Overview

Add 12 new tools to the chat assistant to unlock historical analytics, search, detail views, and missing CRUD operations. Only 1 new SQL query needed — everything else wires existing queries into the tool pipeline.

## Problem

The assistant can list entities and do basic CRUD but cannot:
- Answer "which habit did I follow most this month?" (no historical stats)
- Answer "how was my week?" (no activity aggregation)
- Search goals/journals/habits by keyword
- Read full journal content (only gets snippets)
- Get goal details (description, impact, dates)
- Show project-level stats
- Tell the user their level/XP
- Delete or rename habits
- Update projects

## New SQL Query

Only one new query is needed. Everything else uses existing queries.

**`GetHabitCompletionStats`** in `server/internal/store/queries/habit_tracker.sql`:

```sql
-- name: GetHabitCompletionStats :many
SELECT h.id, h.title, COUNT(ht.id) as completion_count,
       MIN(ht.date) as first_completion, MAX(ht.date) as last_completion
FROM mindmap_habit h
LEFT JOIN mindmap_habit_tracker ht
  ON h.id = ht.habit_id AND ht.date >= @start_date AND ht.date <= @end_date
WHERE h.user_id = @user_id
GROUP BY h.id, h.title
ORDER BY completion_count DESC
```

## Tool Specifications

### Tier 1 — Daily Value

#### 1. `get_habit_stats`

**Purpose:** Historical habit completion data with streaks and rates.

**Args:**
```go
type GetHabitStatsArgs struct {
    Period    *string `json:"period"     validate:"omitempty,oneof=week month quarter"`
    StartDate *string `json:"start_date" validate:"omitempty,datetime=2006-01-02"`
    EndDate   *string `json:"end_date"   validate:"omitempty,datetime=2006-01-02"`
}
```

Period presets: `week` = last 7 days, `month` = last 30 days, `quarter` = last 90 days. Custom `start_date`/`end_date` override the preset. Default if nothing specified: `month`.

**Returns:**
```json
{
  "period": {"start": "2026-02-23", "end": "2026-03-23"},
  "habits": [
    {
      "title": "Gym",
      "completions": 18,
      "total_days": 30,
      "rate": 0.6,
      "current_streak": 3,
      "longest_streak": 7
    }
  ]
}
```

**Streak calculation (Go, not SQL):**
1. Fetch all tracker records via `ListHabitTrackerRecords`
2. For each habit, collect completion dates within the range
3. Current streak: walk backward from today counting consecutive days with completions
4. Longest streak: find the longest consecutive run of completion dates
5. Rate: `completions / total_days_in_range`

**SQL used:** New `GetHabitCompletionStats` + existing `ListHabitTrackerRecords`

#### 2. `get_activity_summary`

**Purpose:** Aggregated productivity overview for a date range.

**Args:**
```go
type GetActivitySummaryArgs struct {
    Period    *string `json:"period"     validate:"omitempty,oneof=today week month"`
    StartDate *string `json:"start_date" validate:"omitempty,datetime=2006-01-02"`
    EndDate   *string `json:"end_date"   validate:"omitempty,datetime=2006-01-02"`
}
```

Period presets: `today` = today only, `week` = last 7 days, `month` = last 30 days. Default: `week`.

**Returns:**
```json
{
  "period": {"start": "2026-03-16", "end": "2026-03-23"},
  "goals_completed": 3,
  "goals_created": 5,
  "habits_completed": 28,
  "journals_written": 4
}
```

**SQL used:** Existing `GetGoalActivity`, `GetHabitTrackerActivity`, `GetJournalActivity`. These return per-date counts; aggregate them in Go.

#### 3. `get_user_profile`

**Purpose:** User's XP, level, and profile info.

**Args:** None (ParseArgs returns nil).

**Returns:**
```json
{
  "name": "Sushant",
  "email": "sushant@example.com",
  "xp": 450,
  "level": 3,
  "xp_to_next_level": 50
}
```

**SQL used:** Existing `GetUserByID`. Level calculation uses the same `getXPProgress` logic from the XP system.

### Tier 2 — Search & Detail

#### 4. `search_goals`

**Args:**
```go
type SearchGoalsArgs struct {
    Query string `json:"query" validate:"required,min=1"`
}
```

**Returns:** `{goals: [{id, title, status, priority, project}]}`

**SQL used:** Existing `SearchGoals`

#### 5. `search_journals`

**Args:**
```go
type SearchJournalsArgs struct {
    Query string `json:"query" validate:"required,min=1"`
}
```

**Returns:** `{journals: [{id, title, snippet, type, updated_at}]}`

**SQL used:** Existing `SearchJournals`

#### 6. `get_journal_content`

**Args:**
```go
type GetJournalContentArgs struct {
    ID string `json:"id" validate:"required,uuid"`
}
```

**Returns:** `{id, title, content, type, project, created_at, updated_at}`

**SQL used:** Existing `GetJournalByID`

#### 7. `get_goal_detail`

**Args:**
```go
type GetGoalDetailArgs struct {
    ID string `json:"id" validate:"required,uuid"`
}
```

**Returns:** `{id, title, description, status, priority, impact, project, created_at, completed_at}`

**SQL used:** Existing `GetGoalByID`

### Tier 3 — Power User

#### 8. `get_project_stats`

**Args:**
```go
type GetProjectStatsArgs struct {
    ID string `json:"id" validate:"required,uuid"`
}
```

**Returns:**
```json
{
  "name": "MindTab",
  "goals_by_status": {"pending": 2, "in_progress": 3, "completed": 5, "archived": 1},
  "journal_count": 8
}
```

**SQL used:** Existing `ListGoalStatsByProject` + `CountJournalsByProject`

#### 9. `delete_habit`

**Args:**
```go
type DeleteHabitArgs struct {
    ID string `json:"id" validate:"required,uuid"`
}
```

**Returns:** `{success: true}`

**SQL used:** Existing `DeleteHabit`

#### 10. `update_habit`

**Args:**
```go
type UpdateHabitArgs struct {
    ID        string  `json:"id"        validate:"required,uuid"`
    Title     *string `json:"title"     validate:"omitempty,min=1"`
    Frequency *string `json:"frequency" validate:"omitempty,oneof=daily weekly"`
}
```

**Returns:** `{id, title, frequency}`

**SQL used:** Existing `UpdateHabit` (fetch first to preserve unchanged fields)

#### 11. `search_habits`

**Args:**
```go
type SearchHabitsArgs struct {
    Query string `json:"query" validate:"required,min=1"`
}
```

**Returns:** `{habits: [{id, title, frequency}]}`

**SQL used:** Existing `SearchHabits`

#### 12. `update_project`

**Args:**
```go
type UpdateProjectArgs struct {
    ID     string  `json:"id"     validate:"required,uuid"`
    Name   *string `json:"name"   validate:"omitempty,min=1"`
    Status *string `json:"status" validate:"omitempty,oneof=active paused completed archived"`
}
```

**Returns:** `{id, name, status}`

**SQL used:** Existing `UpdateProject`

## File Structure

All new tools follow the existing Tool interface + Registry pattern.

| File | Change |
|------|--------|
| `server/internal/store/queries/habit_tracker.sql` | Add `GetHabitCompletionStats` query |
| `server/internal/store/` | Regenerate with `sqlc generate` |
| `server/internal/chat/tools_habits.go` | Add `GetHabitStatsTool`, `DeleteHabitTool`, `UpdateHabitTool`, `SearchHabitsTool` |
| `server/internal/chat/tools_goals.go` | Add `GetGoalDetailTool`, `SearchGoalsTool` |
| `server/internal/chat/tools_journals.go` | Add `GetJournalContentTool`, `SearchJournalsTool` |
| `server/internal/chat/tools_projects.go` | Add `GetProjectStatsTool`, `UpdateProjectTool` |
| `server/internal/chat/tools_analytics.go` | New file: `GetActivitySummaryTool`, `GetUserProfileTool` |
| `server/cmd/api/main.go` | Register 12 new tools |

## XP Level Calculation

The `get_user_profile` tool needs level/XP-to-next calculation. The thresholds are defined in the mobile app at `apps/mobile/src/lib/xp.ts`. Replicate the same logic server-side in a shared helper (or inline in the tool). The thresholds:

```
Level 1: 0 XP
Level 2: 100 XP
Level 3: 250 XP
Level 4: 500 XP
Level 5: 1000 XP
Level 6: 2000 XP
Level 7: 4000 XP
Level 8: 7500 XP
Level 9: 15000 XP
```

## Registration

All 12 tools registered in `main.go` alongside existing 15 tools. Total: 27 tools.
