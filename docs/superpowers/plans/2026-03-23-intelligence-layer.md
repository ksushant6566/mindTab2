# Intelligence Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 5 compound intelligence tools + enhanced system prompt that transform the assistant from a data lookup tool into a productivity coach.

**Architecture:** All 5 tools aggregate existing DB queries in Go — no new SQL. Each tool pre-computes insights (alerts, deltas, patterns) server-side so the LLM can reason over them directly. Updated system prompt teaches the LLM when and how to use these tools proactively.

**Tech Stack:** Go, existing Tool interface + Registry, existing sqlc queries

**Spec:** `docs/superpowers/specs/2026-03-23-intelligence-layer-design.md`

---

## File Structure

### New Files

| File | Responsibility |
|------|---------------|
| `server/internal/chat/tools_intelligence.go` | `GetDailyBriefingTool`, `ComparePeriodsTool`, `GetStaleItemsTool`, `SearchEverythingTool`, `GetHabitPatternsTool` |

### Modified Files

| File | Change |
|------|--------|
| `server/internal/chat/orchestrator.go` | Replace system prompt constant |
| `server/cmd/api/main.go` | Register 5 new tools |

---

## Task 1: GetDailyBriefingTool

**Files:**
- Create: `server/internal/chat/tools_intelligence.go`

- [ ] **Step 1: Create the file with GetDailyBriefingTool**

This is the highest-value tool. No args. Needs `queries store.Querier`.

**Execute logic:**
1. Get today's date as `time.Now()`
2. **Habits:** Call `queries.ListHabits(ctx, userID)` + `queries.ListHabitTrackerRecords(ctx, userID)`. Compute: total habits, which are completed today, which are incomplete.
3. **Goals:** Call `queries.ListGoals(ctx, store.ListGoalsParams{UserID: userID, Column2: false, Column3: pgtype.UUID{}})`. Split by status. For in_progress and pending goals, compute `days_in_status` from `updated_at`.
4. **Today's activity:** Filter tracker records for today. Count goals with `status == "completed"` and `completed_at` today. Count journals created today from `queries.GetJournalActivity`.
5. **Week's activity:** Same queries filtered to last 7 days. Compute `avg_daily_habits`.
6. **Alerts:** Apply rules:
   - Goal pending > 14 days → "Goal '{title}' has been pending for {N} days"
   - Goal in_progress > 30 days → "Goal '{title}' has been in progress for {N} days"
   - This week's habit rate < last 30 days average → "Your habit completion rate this week ({X}%) is below your monthly average ({Y}%)"
   - Habit completed yesterday but not today, and has a streak ≥ 3 → "Your {title} streak ({N} days) is at risk — don't break it!"
   - All habits completed today → "All habits completed today!"

**Return the full briefing object** as specified in the spec.

- [ ] **Step 2: Verify it compiles**

Run: `cd server && go build ./...`

- [ ] **Step 3: Commit**

```bash
cd server && git add internal/chat/tools_intelligence.go
git commit -m "feat(chat): add get_daily_briefing intelligence tool"
```

---

## Task 2: ComparePeriodsTool + GetStaleItemsTool

**Files:**
- Modify: `server/internal/chat/tools_intelligence.go`

- [ ] **Step 1: Add ComparePeriodsTool**

**Args:**
```go
type ComparePeriodsArgs struct {
    Period1Start string `json:"period1_start" validate:"required"`
    Period1End   string `json:"period1_end"   validate:"required"`
    Period2Start string `json:"period2_start" validate:"required"`
    Period2End   string `json:"period2_end"   validate:"required"`
}
```

**Execute:**
1. Parse all 4 dates (`time.Parse("2006-01-02", ...)`)
2. For each period, call the 3 activity queries (goal, habit tracker, journal) with the period's start date
3. Filter results to the period's end date in Go
4. Count goals_completed (status == "completed"), habits_completed, journals_written
5. Compute habit_rate = habits_completed / (total_habits * days_in_period)
6. Compute deltas: period1 - period2, format as "+N" or "-N"

Return the comparison object from the spec.

- [ ] **Step 2: Add GetStaleItemsTool**

**Args:**
```go
type GetStaleItemsArgs struct {
    DaysThreshold *int `json:"days_threshold" validate:"omitempty,min=1,max=365"`
}
```

Default: 14 days.

**Execute:**
1. `queries.ListGoals` → filter to pending/in_progress where `updated_at < now - threshold`
2. `queries.ListProjects` + for each project check if any goal was updated within threshold → stale if none
3. `queries.ListHabits` + `queries.ListHabitTrackerRecords` → for each habit, find last completion date → neglected if > threshold days ago

Return the stale items object from the spec. Include `days_since_update`, `days_since_activity`, `days_since` for each item.

- [ ] **Step 3: Verify and commit**

Run: `cd server && go build ./...`

```bash
cd server && git add internal/chat/tools_intelligence.go
git commit -m "feat(chat): add compare_periods and get_stale_items tools"
```

---

## Task 3: SearchEverythingTool + GetHabitPatternsTool

**Files:**
- Modify: `server/internal/chat/tools_intelligence.go`

- [ ] **Step 1: Add SearchEverythingTool**

**Args:** `SearchEverythingArgs { Query string validate:"required,min=1" }`

**Execute:**
1. Run 3 searches concurrently using goroutines + errgroup or channels:
   - `queries.SearchGoals(ctx, ...)` → `{goals: [{id, title, status}]}`
   - `queries.SearchJournals(ctx, ...)` → `{journals: [{id, title, snippet}]}`
   - `queries.SearchHabits(ctx, ...)` → `{habits: [{id, title}]}`
2. If `search *search.SemanticSearch` is not nil, also run vault semantic search:
   - `search.Search(ctx, userID, query, 5)` → `{vault: [{id, title, summary}]}`
3. Collect all results, return combined object.

The tool struct needs both `queries store.Querier` AND `search *search.SemanticSearch` (like SearchVaultTool).

- [ ] **Step 2: Add GetHabitPatternsTool**

**Args:** None (ParseArgs returns nil, nil).

**Execute:**
1. `queries.ListHabits(ctx, userID)` — get all habits
2. `queries.ListHabitTrackerRecords(ctx, userID)` — get all tracker records
3. Filter records to last 90 days
4. Group by day-of-week (Monday-Sunday):
   - For each day: count how many weeks in the 90-day period had that day, count completions on that day
   - Rate = completions / possible
5. Per-habit breakdown: for each habit, compute best_day and worst_day (by rate), overall_rate
6. Find global best_day and worst_day

Return the patterns object from the spec.

- [ ] **Step 3: Verify and commit**

Run: `cd server && go build ./...`

```bash
cd server && git add internal/chat/tools_intelligence.go
git commit -m "feat(chat): add search_everything and get_habit_patterns tools"
```

---

## Task 4: Enhanced system prompt + registration

**Files:**
- Modify: `server/internal/chat/orchestrator.go`
- Modify: `server/cmd/api/main.go`

- [ ] **Step 1: Update system prompt**

In `orchestrator.go`, replace the `systemPrompt` constant with:

```go
const systemPrompt = `You are MindTab, a personal productivity assistant. You have access to the user's goals, habits, journals, projects, and saved vault items.

BEHAVIOR:
- Be concise and conversational. Don't dump raw data — interpret it.
- When the user asks a broad question ("How am I doing?", "What should I focus on?"), call get_daily_briefing first.
- When you see alerts in the briefing, mention them proactively — even if the user didn't ask.
- When comparing performance, use compare_periods to give concrete numbers.
- When a user seems stuck or asks about neglected work, call get_stale_items.
- When searching, prefer search_everything over individual search tools.
- When asked about habit consistency patterns, use get_habit_patterns.

PERSONALITY:
- Direct and honest. If the user is falling behind, say so kindly.
- Encouraging when they're doing well. Acknowledge streaks and completions.
- Practical — suggest specific next actions, not vague advice.
- Never say "I can only tell you..." — use the tools to find the answer.`
```

- [ ] **Step 2: Register 5 new tools in main.go**

After the existing registrations, add:

```go
// Intelligence layer
registry.Register(chat.NewGetDailyBriefingTool(queries))
registry.Register(chat.NewComparePeriodsTool(queries))
registry.Register(chat.NewGetStaleItemsTool(queries))
registry.Register(chat.NewSearchEverythingTool(queries, semanticSearch))
registry.Register(chat.NewGetHabitPatternsTool(queries))
```

- [ ] **Step 3: Verify full build + tests**

Run: `cd server && go build ./cmd/api`
Run: `cd server && go vet ./...`
Run: `cd server && go test ./internal/chat/ -v -run TestRegistry`

- [ ] **Step 4: Commit**

```bash
cd server && git add internal/chat/orchestrator.go cmd/api/main.go
git commit -m "feat(chat): add intelligence layer system prompt, register 5 tools (32 total)"
```
