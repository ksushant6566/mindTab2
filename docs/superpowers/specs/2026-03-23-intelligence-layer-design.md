# Intelligence Layer — Design Spec

**Date:** 2026-03-23
**Status:** Approved

## The Problem

We have 27 tools that give the assistant access to data. But access is not intelligence. When a user asks "What should I work on today?", the LLM has to make 5-6 separate tool calls (list goals, list habits, get activity, get profile...), stitching context together from fragmented results. This is slow, expensive, and the LLM often misses connections.

A serious productivity assistant doesn't just retrieve data — it interprets patterns, detects problems, and connects dots. The gap isn't more CRUD tools. It's compound intelligence tools that pre-compute insights the LLM can reason over.

## Design Principles

1. **One tool call should give the LLM enough context to be genuinely helpful.** The daily briefing shouldn't require 6 chained calls.
2. **Surface problems the user didn't ask about.** Stale goals, broken streaks, neglected projects.
3. **Enable temporal reasoning.** "Am I getting better?" requires comparing time periods.
4. **Cross-entity connections.** Everything about a project, not just goals OR journals.
5. **Better system prompt.** Tell the LLM how to be proactive, not just responsive.

## New Tools (5)

### 1. `get_daily_briefing`

**Purpose:** Everything the LLM needs to answer "What should I do today?" in a single call. This is the most important tool — it replaces 5-6 separate calls.

**Args:** None.

**Returns:**
```json
{
  "today": "2026-03-23",
  "habits": {
    "total": 5,
    "completed": 2,
    "incomplete": ["Gym", "Reading", "Guitar"]
  },
  "goals": {
    "in_progress": [
      {"title": "Launch MVP", "priority": "priority_1", "project": "MindTab", "days_in_status": 12},
      {"title": "Write blog post", "priority": "priority_2", "project": null, "days_in_status": 3}
    ],
    "pending": [
      {"title": "Set up CI/CD", "priority": "priority_2", "project": "MindTab", "days_in_status": 30}
    ],
    "completed_today": 0,
    "total_active": 5
  },
  "activity_today": {
    "habits_done": 2,
    "goals_completed": 0,
    "journals_written": 1
  },
  "activity_week": {
    "habits_done": 18,
    "goals_completed": 2,
    "journals_written": 3,
    "avg_daily_habits": 2.6
  },
  "alerts": [
    "Goal 'Set up CI/CD' has been pending for 30 days",
    "Your habit completion rate this week (52%) is below your monthly average (68%)",
    "You have 3 incomplete habits today"
  ]
}
```

**The `alerts` array is key.** This is pre-computed insight, not raw data. The LLM reads these and can proactively mention them even if the user asked something else. The alerts are computed server-side by simple rules:
- Goal pending > 14 days → stale warning
- Goal in_progress > 30 days → stale warning
- This week's habit rate < monthly average → declining warning
- Habit streak about to break (completed yesterday, not today) → streak warning
- All habits completed today → congratulation

**SQL used:** Existing queries: `ListGoals`, `ListHabits`, `ListHabitTrackerRecords`, `GetHabitTrackerActivity`, `GetGoalActivity`, `GetJournalActivity`. No new SQL.

### 2. `compare_periods`

**Purpose:** "Am I getting better?" requires comparing two time ranges side by side.

**Args:**
```go
type ComparePeriodsArgs struct {
    Period1Start string `json:"period1_start" validate:"required"`
    Period1End   string `json:"period1_end"   validate:"required"`
    Period2Start string `json:"period2_start" validate:"required"`
    Period2End   string `json:"period2_end"   validate:"required"`
}
```

The LLM resolves "this week vs last week" into actual dates before calling.

**Returns:**
```json
{
  "period1": {
    "range": {"start": "2026-03-16", "end": "2026-03-23"},
    "goals_completed": 3,
    "habits_completed": 28,
    "habit_rate": 0.8,
    "journals_written": 4
  },
  "period2": {
    "range": {"start": "2026-03-09", "end": "2026-03-16"},
    "goals_completed": 1,
    "habits_completed": 22,
    "habit_rate": 0.63,
    "journals_written": 2
  },
  "deltas": {
    "goals_completed": "+2",
    "habits_completed": "+6",
    "habit_rate": "+0.17",
    "journals_written": "+2"
  }
}
```

**SQL used:** Existing activity queries called twice with different date ranges.

### 3. `get_stale_items`

**Purpose:** Surface things the user is neglecting. Goals that haven't moved, projects with no recent activity.

**Args:**
```go
type GetStaleItemsArgs struct {
    DaysThreshold *int `json:"days_threshold" validate:"omitempty,min=1,max=365"`
}
```

Default: 14 days.

**Returns:**
```json
{
  "threshold_days": 14,
  "stale_goals": [
    {"id": "uuid", "title": "Set up CI/CD", "status": "pending", "days_since_update": 30, "project": "MindTab"}
  ],
  "stale_projects": [
    {"id": "uuid", "name": "FreeStand", "days_since_activity": 21, "active_goals": 2}
  ],
  "neglected_habits": [
    {"title": "Guitar", "last_completed": "2026-03-10", "days_since": 13, "was_streak": 5}
  ]
}
```

**Stale detection logic (Go):**
- Goals: `updated_at` older than threshold AND status is `pending` or `in_progress`
- Projects: no goals updated within threshold
- Habits: no tracker record within threshold, but habit still exists (not deleted)

**SQL used:** Existing `ListGoals`, `ListProjects`, `ListHabits`, `ListHabitTrackerRecords`. Filter in Go.

### 4. `search_everything`

**Purpose:** "Find everything about React" should search across goals, journals, and vault in one call.

**Args:**
```go
type SearchEverythingArgs struct {
    Query string `json:"query" validate:"required,min=1"`
}
```

**Returns:**
```json
{
  "query": "React",
  "goals": [{"id": "uuid", "title": "React Native Performance", "status": "in_progress"}],
  "journals": [{"id": "uuid", "title": "React Perf Notes", "snippet": "..."}],
  "habits": [{"id": "uuid", "title": "React practice"}],
  "vault": [{"id": "uuid", "title": "React Native: The Complete Guide", "summary": "..."}]
}
```

**SQL used:** Existing `SearchGoals`, `SearchJournals`, `SearchHabits`. Vault uses `SemanticSearch.Search` (semantic, not keyword). All 4 queries run concurrently (goroutines).

### 5. `get_habit_patterns`

**Purpose:** "When am I most consistent?" Day-of-week analysis for habit tracking.

**Args:** None (analyzes all habits over the last 90 days).

**Returns:**
```json
{
  "period_days": 90,
  "by_day_of_week": {
    "Monday": {"total_possible": 13, "completed": 11, "rate": 0.85},
    "Tuesday": {"total_possible": 13, "completed": 10, "rate": 0.77},
    "Friday": {"total_possible": 13, "completed": 6, "rate": 0.46},
    "Saturday": {"total_possible": 13, "completed": 4, "rate": 0.31}
  },
  "best_day": "Monday",
  "worst_day": "Saturday",
  "by_habit": {
    "Gym": {"best_day": "Monday", "worst_day": "Friday", "overall_rate": 0.6},
    "Reading": {"best_day": "Tuesday", "worst_day": "Saturday", "overall_rate": 0.75}
  }
}
```

**SQL used:** Existing `ListHabitTrackerRecords` + `ListHabits`. Aggregate by day-of-week in Go.

## Enhanced System Prompt

The current system prompt is generic. Replace with:

```
You are MindTab, a personal productivity assistant. You have access to the user's goals, habits, journals, projects, and saved vault items.

BEHAVIOR:
- Be concise and conversational. Don't dump raw data — interpret it.
- When the user asks a broad question ("How am I doing?", "What should I focus on?"), call get_daily_briefing first.
- When you see alerts in the briefing, mention them proactively — even if the user didn't ask.
- When comparing performance, use compare_periods to give concrete numbers.
- When a user seems stuck, call get_stale_items to find neglected work.
- When searching, prefer search_everything over individual search tools.

PERSONALITY:
- Direct and honest. If the user is falling behind, say so kindly.
- Encouraging when they're doing well. Acknowledge streaks and completions.
- Practical — suggest specific next actions, not vague advice.
- Never say "I can only tell you..." — use the tools to find the answer.
```

## File Structure

| File | Change |
|------|--------|
| `server/internal/chat/tools_intelligence.go` | New: `GetDailyBriefingTool`, `ComparePeridosTool`, `GetStaleItemsTool`, `SearchEverythingTool`, `GetHabitPatternsTool` |
| `server/internal/chat/orchestrator.go` | Update system prompt |
| `server/cmd/api/main.go` | Register 5 new tools |

No new SQL queries needed. Everything uses existing data.

## Why These 5 Tools Matter

| Tool | User question it answers | Previous tool calls needed | Now |
|------|-------------------------|---------------------------|-----|
| `get_daily_briefing` | "What should I do today?" | 5-6 calls | 1 call |
| `compare_periods` | "Am I getting better?" | 2 activity calls + mental math | 1 call with deltas |
| `get_stale_items` | "What am I neglecting?" | Not possible before | 1 call |
| `search_everything` | "Find everything about X" | 3-4 separate searches | 1 call |
| `get_habit_patterns` | "When am I most consistent?" | Not possible before | 1 call |

These 5 tools transform the assistant from "database with a chat interface" to "productivity coach that understands your patterns."
