# New Assistant Tools Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 12 new tools to the chat assistant — habit stats with streaks, activity summaries, user profile, search for goals/journals/habits, detail views, project stats, and missing CRUD operations.

**Architecture:** 1 new SQL query + sqlc regeneration, then 12 new tool structs added to existing domain files following the Tool interface pattern. Each tool uses existing DB queries except `get_habit_stats` which needs a new one. All tools registered in main.go.

**Tech Stack:** Go, sqlc, existing Tool interface + Registry pattern

**Spec:** `docs/superpowers/specs/2026-03-23-new-assistant-tools-design.md`

---

## File Structure

### New Files

| File | Responsibility |
|------|---------------|
| `server/internal/chat/tools_analytics.go` | `GetActivitySummaryTool`, `GetUserProfileTool` |

### Modified Files

| File | Change |
|------|--------|
| `server/internal/store/queries/habit_tracker.sql` | Add `GetHabitCompletionStats` query |
| `server/internal/store/` | Regenerate with `sqlc generate` |
| `server/internal/chat/tools_habits.go` | Add `GetHabitStatsTool`, `DeleteHabitTool`, `UpdateHabitTool`, `SearchHabitsTool` |
| `server/internal/chat/tools_goals.go` | Add `GetGoalDetailTool`, `SearchGoalsTool` |
| `server/internal/chat/tools_journals.go` | Add `GetJournalContentTool`, `SearchJournalsTool` |
| `server/internal/chat/tools_projects.go` | Add `GetProjectStatsTool`, `UpdateProjectTool` |
| `server/cmd/api/main.go` | Register 12 new tools (lines 154-169) |

---

## Task 1: New SQL query + sqlc regeneration

**Files:**
- Modify: `server/internal/store/queries/habit_tracker.sql`
- Regenerate: `server/internal/store/`

- [ ] **Step 1: Add GetHabitCompletionStats query**

Append to `server/internal/store/queries/habit_tracker.sql`:

```sql
-- name: GetHabitCompletionStats :many
SELECT h.id AS habit_id,
       h.title AS habit_title,
       COUNT(ht.id) AS completion_count,
       MIN(ht.date) AS first_completion,
       MAX(ht.date) AS last_completion
FROM mindmap_habit h
LEFT JOIN mindmap_habit_tracker ht
  ON h.id = ht.habit_id
  AND ht.date >= @start_date
  AND ht.date <= @end_date
WHERE h.user_id = @user_id
GROUP BY h.id, h.title
ORDER BY completion_count DESC;
```

- [ ] **Step 2: Run sqlc generate**

Run: `cd server && sqlc generate`
Expected: Clean output, no errors.

- [ ] **Step 3: Verify generated code compiles**

Run: `cd server && go build ./...`
Expected: No compile errors.

- [ ] **Step 4: Commit**

```bash
cd server && git add internal/store/queries/habit_tracker.sql internal/store/
git commit -m "feat(chat): add GetHabitCompletionStats query for habit analytics"
```

---

## Task 2: Habit tools — `get_habit_stats`, `delete_habit`, `update_habit`, `search_habits`

**Files:**
- Modify: `server/internal/chat/tools_habits.go` (currently 256 lines)

- [ ] **Step 1: Add GetHabitStatsTool**

Append to `tools_habits.go`. This is the most complex tool — it computes streaks.

**Args struct:**
```go
type GetHabitStatsArgs struct {
    Period    *string `json:"period"     validate:"omitempty,oneof=week month quarter"`
    StartDate *string `json:"start_date" validate:"omitempty"`
    EndDate   *string `json:"end_date"   validate:"omitempty"`
}
```

**Constructor:** `NewGetHabitStatsTool(queries store.Querier) *GetHabitStatsTool`

**Schema:** Use `jsonSchemaEnum` for `period` with values `["week", "month", "quarter"]`. `start_date` and `end_date` are strings with description "Date in YYYY-MM-DD format".

**Execute logic:**
1. Resolve date range: if `Period` is set, compute start/end dates (week=7d, month=30d, quarter=90d). If `StartDate`/`EndDate` are set, use those (parse with `time.Parse("2006-01-02", ...)`). Default: month.
2. Call `queries.GetHabitCompletionStats(ctx, ...)` with the resolved date range
3. Call `queries.ListHabitTrackerRecords(ctx, userID)` for streak calculation
4. For each habit, compute:
   - `completions` from the stats query
   - `total_days` = days in the date range
   - `rate` = completions / total_days (float, 2 decimal places)
   - `current_streak` = walk backward from today counting consecutive days with a completion
   - `longest_streak` = find longest consecutive run in the full record set
5. Return `{period: {start, end}, habits: [{title, completions, total_days, rate, current_streak, longest_streak}]}`

**Streak helper functions** (private, in same file):
```go
func computeCurrentStreak(dates []time.Time) int
func computeLongestStreak(dates []time.Time) int
```

Both take a sorted slice of completion dates for a single habit. `computeCurrentStreak` walks backward from today. `computeLongestStreak` walks forward finding the longest consecutive run.

- [ ] **Step 2: Add DeleteHabitTool**

Simple tool. Uses existing `queries.DeleteHabit`.

**Args:** `DeleteHabitArgs { ID string validate:"required,uuid" }`
**Returns:** `{success: true}`
**Note:** This is a hard delete (not soft delete) — matches the existing DB query behavior.

- [ ] **Step 3: Add UpdateHabitTool**

Uses existing `queries.UpdateHabit`. Fetch existing habit first via `queries.GetHabitByID` to preserve unchanged fields.

**Args:**
```go
type UpdateHabitArgs struct {
    ID        string  `json:"id"        validate:"required,uuid"`
    Title     *string `json:"title"     validate:"omitempty,min=1"`
    Frequency *string `json:"frequency" validate:"omitempty,oneof=daily weekly"`
}
```
**Returns:** `{id, title, frequency}`

- [ ] **Step 4: Add SearchHabitsTool**

Uses existing `queries.SearchHabits`.

**Args:** `SearchHabitsArgs { Query string validate:"required,min=1" }`
**Returns:** `{habits: [{id, title, frequency}]}`

- [ ] **Step 5: Verify and commit**

Run: `cd server && go build ./...`

```bash
cd server && git add internal/chat/tools_habits.go
git commit -m "feat(chat): add habit stats, delete, update, search tools"
```

---

## Task 3: Goal tools — `get_goal_detail`, `search_goals`

**Files:**
- Modify: `server/internal/chat/tools_goals.go` (currently 390 lines)

- [ ] **Step 1: Add GetGoalDetailTool**

Uses existing `queries.GetGoalByID`.

**Args:** `GetGoalDetailArgs { ID string validate:"required,uuid" }`

**Returns:**
```json
{
  "id": "uuid",
  "title": "Launch MVP",
  "description": "Ship the first version...",
  "status": "in_progress",
  "priority": "priority_1",
  "impact": "high",
  "project": "MindTab",
  "created_at": "2026-03-01T00:00:00Z",
  "completed_at": null
}
```

Read the `GetGoalByID` return type from `querier.go` — it returns `MindmapGoal` which has all fields. Convert pgtype fields to plain strings.

- [ ] **Step 2: Add SearchGoalsTool**

Uses existing `queries.SearchGoals`.

**Args:** `SearchGoalsArgs { Query string validate:"required,min=1" }`
**Returns:** `{goals: [{id, title, status, priority}]}`

The `SearchGoals` query returns `[]MindmapGoal`. Map to simplified response.

- [ ] **Step 3: Verify and commit**

Run: `cd server && go build ./...`

```bash
cd server && git add internal/chat/tools_goals.go
git commit -m "feat(chat): add goal detail and search tools"
```

---

## Task 4: Journal tools — `get_journal_content`, `search_journals`

**Files:**
- Modify: `server/internal/chat/tools_journals.go` (currently 317 lines)

- [ ] **Step 1: Add GetJournalContentTool**

Uses existing `queries.GetJournalByID`. Returns full content (not truncated snippet).

**Args:** `GetJournalContentArgs { ID string validate:"required,uuid" }`

**Returns:**
```json
{
  "id": "uuid",
  "title": "React Performance Notes",
  "content": "Full journal content here...",
  "type": "article",
  "project": "MindTab",
  "created_at": "2026-03-15T00:00:00Z",
  "updated_at": "2026-03-20T00:00:00Z"
}
```

Read `GetJournalByID` return type — it's `GetJournalByIDRow` with `Title`, `Content`, `Type` (interface{}), `ProjectID`, `CreatedAt`, `UpdatedAt`. Need to resolve project name from `ProjectID` using `GetProjectByID` if the project ID is valid.

Actually, looking at the existing `UpdateJournalTool`, it fetches the journal but doesn't resolve project name. For simplicity, return the project_id and let the LLM ask for project details if needed. Or: check if `GetJournalByID` joins with projects. Read the query to confirm.

The `GetJournalByID` query (journals.sql line 5-10) returns `mindmap_journal.*` columns only — no project join. So return `project_id` as a UUID string (or null). The LLM can cross-reference with `list_projects` if needed.

- [ ] **Step 2: Add SearchJournalsTool**

Uses existing `queries.SearchJournals`.

**Args:** `SearchJournalsArgs { Query string validate:"required,min=1" }`
**Returns:** `{journals: [{id, title, snippet, type, updated_at}]}`

`SearchJournals` returns `[]MindmapJournal`. Truncate `Content` to 200 chars for snippet.

- [ ] **Step 3: Verify and commit**

Run: `cd server && go build ./...`

```bash
cd server && git add internal/chat/tools_journals.go
git commit -m "feat(chat): add journal content and search tools"
```

---

## Task 5: Project tools — `get_project_stats`, `update_project`

**Files:**
- Modify: `server/internal/chat/tools_projects.go` (currently 141 lines)

- [ ] **Step 1: Add GetProjectStatsTool**

Uses existing `queries.ListGoalStatsByProject` + `queries.CountJournalsByProject`.

**Args:** `GetProjectStatsArgs { ID string validate:"required,uuid" }`

**Execute:**
1. Fetch project via `queries.GetProjectByID(ctx, pgID)` — get the name. Return 404-style error if not found.
2. Call `queries.ListGoalStatsByProject(ctx, pgID)` — returns one row per goal with `ID` and `Status` fields (NOT pre-aggregated). Count occurrences in Go: iterate rows, build `statusMap[status]++`, then return `{pending: N, in_progress: N, completed: N, archived: N}`.
3. Call `queries.CountJournalsByProject(ctx, pgID)` — returns an int.

**Returns:**
```json
{
  "name": "MindTab",
  "goals_by_status": {"pending": 2, "in_progress": 3, "completed": 5, "archived": 1},
  "journal_count": 8
}
```

- [ ] **Step 2: Add UpdateProjectTool**

Uses existing `queries.UpdateProject` which is `:one` and uses `COALESCE` — no need to fetch first.

**Args:**
```go
type UpdateProjectArgs struct {
    ID     string  `json:"id"     validate:"required,uuid"`
    Name   *string `json:"name"   validate:"omitempty,min=1"`
    Status *string `json:"status" validate:"omitempty,oneof=active paused completed archived"`
}
```

**Returns:** `{id, name, status}`

Call `queries.UpdateProject` with the args. The query uses `COALESCE` so NULL values preserve existing fields.

- [ ] **Step 3: Verify and commit**

Run: `cd server && go build ./...`

```bash
cd server && git add internal/chat/tools_projects.go
git commit -m "feat(chat): add project stats and update tools"
```

---

## Task 6: Analytics tools — `get_activity_summary`, `get_user_profile`

**Files:**
- Create: `server/internal/chat/tools_analytics.go`

- [ ] **Step 1: Create tools_analytics.go with GetActivitySummaryTool**

**Args:**
```go
type GetActivitySummaryArgs struct {
    Period    *string `json:"period"     validate:"omitempty,oneof=today week month"`
    StartDate *string `json:"start_date" validate:"omitempty"`
    EndDate   *string `json:"end_date"   validate:"omitempty"`
}
```

Default: `week`.

**Execute:**
1. Resolve date range (same pattern as `get_habit_stats`)
2. Call `queries.GetGoalActivity(ctx, GetGoalActivityParams{UserID: userID, CreatedAt: startDate})` — these queries require a params struct with a start date (they filter `created_at >= $2` at the SQL level). Returns `[]GetGoalActivityRow` with `CreatedAt` and `Status`. Count all returned rows for `goals_created`. Count rows where `Status == "completed"` for `goals_completed`. Filter out rows where `CreatedAt > endDate` in Go (SQL only has a lower bound).
3. Call `queries.GetHabitTrackerActivity(ctx, GetHabitTrackerActivityParams{UserID: userID, Date: startDate})` — returns rows with `Date`. Filter `Date <= endDate` in Go, then count.
4. Call `queries.GetJournalActivity(ctx, GetJournalActivityParams{UserID: userID, CreatedAt: startDate})` — returns rows with `CreatedAt`. Filter `CreatedAt <= endDate` in Go, then count.

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

- [ ] **Step 2: Add GetUserProfileTool**

**Args:** None (ParseArgs returns nil, nil).

The tool needs access to `queries` AND the `userID`. Since all tools get `userID` in `Execute`, just call `queries.GetUserByID(ctx, userID)`.

**XP level calculation** — replicate the logic from `apps/mobile/src/lib/xp.ts`:
```go
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
    if level <= 1 { return 0 }
    if level-1 < len(levelThresholds) { return levelThresholds[level-1] }
    return int(math.Round(50 * math.Pow(float64(level-1), 1.5)))
}
```

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

- [ ] **Step 3: Verify and commit**

Run: `cd server && go build ./...`

```bash
cd server && git add internal/chat/tools_analytics.go
git commit -m "feat(chat): add activity summary and user profile tools"
```

---

## Task 7: Register all new tools + verify

**Files:**
- Modify: `server/cmd/api/main.go` (tool registration block at lines 154-169)

- [ ] **Step 1: Add 12 new tool registrations**

After the existing `registry.Register(chat.NewGetVaultItemTool(queries))` line, add:

```go
// Tier 1 — Analytics
registry.Register(chat.NewGetHabitStatsTool(queries))
registry.Register(chat.NewGetActivitySummaryTool(queries))
registry.Register(chat.NewGetUserProfileTool(queries))
// Tier 2 — Search & Detail
registry.Register(chat.NewSearchGoalsTool(queries))
registry.Register(chat.NewSearchJournalsTool(queries))
registry.Register(chat.NewGetJournalContentTool(queries))
registry.Register(chat.NewGetGoalDetailTool(queries))
// Tier 3 — Power User
registry.Register(chat.NewGetProjectStatsTool(queries))
registry.Register(chat.NewDeleteHabitTool(queries))
registry.Register(chat.NewUpdateHabitTool(queries))
registry.Register(chat.NewSearchHabitsTool(queries))
registry.Register(chat.NewUpdateProjectTool(queries))
```

- [ ] **Step 2: Verify full build**

Run: `cd server && go build ./cmd/api`
Run: `cd server && go vet ./...`
Run: `cd server && go test ./internal/chat/ -v -run TestRegistry`
Expected: All clean, all tests pass.

- [ ] **Step 3: Commit**

```bash
cd server && git add cmd/api/main.go
git commit -m "feat(chat): register 12 new tools (27 total)"
```
