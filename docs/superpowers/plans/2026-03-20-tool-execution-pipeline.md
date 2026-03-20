# Tool Execution Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the monolithic `tools.go` with a robust tool execution pipeline — Tool interface, Registry with validation + logging, and 15 self-contained tool structs grouped by domain.

**Architecture:** Each tool implements a `Tool` interface (Name, Description, Schema, ParseArgs, Execute). A `Registry` holds all tools and runs the execution pipeline: lookup → parse → validate (via `go-playground/validator`) → log → execute → log. The orchestrator calls `registry.Execute()` with no knowledge of individual tools.

**Tech Stack:** Go, `github.com/go-playground/validator/v10`

**Spec:** `docs/superpowers/specs/2026-03-20-tool-execution-pipeline-design.md`

---

## File Structure

### New Files

| File | Responsibility |
|------|---------------|
| `server/internal/chat/tool.go` | `Tool` interface definition |
| `server/internal/chat/registry.go` | `Registry` struct, `Execute` pipeline, logging, validation, schema helpers |
| `server/internal/chat/tools_goals.go` | `ListGoalsTool`, `CreateGoalTool`, `UpdateGoalTool`, `DeleteGoalTool` |
| `server/internal/chat/tools_habits.go` | `ListHabitsTool`, `CreateHabitTool`, `ToggleHabitTool` |
| `server/internal/chat/tools_journals.go` | `ListJournalsTool`, `CreateJournalTool`, `UpdateJournalTool`, `DeleteJournalTool` |
| `server/internal/chat/tools_projects.go` | `ListProjectsTool`, `CreateProjectTool` |
| `server/internal/chat/tools_vault.go` | `SearchVaultTool`, `GetVaultItemTool` |
| `server/internal/chat/registry_test.go` | Tests for the registry pipeline (validation, logging, unknown tool) |

### Modified Files

| File | Change |
|------|--------|
| `server/internal/chat/orchestrator.go` | Replace `*ToolRegistry` with `*Registry`, update field name and calls |
| `server/cmd/api/main.go` | Replace `chat.NewToolRegistry(...)` with `chat.NewRegistry()` + `Register()` calls |

### Deleted Files

| File | Reason |
|------|--------|
| `server/internal/chat/tools.go` | Replaced by tool.go, registry.go, and tools_*.go files |

---

## Task 1: Add validator dependency

**Files:**
- Modify: `server/go.mod`

- [ ] **Step 1: Install go-playground/validator**

Run: `cd server && go get github.com/go-playground/validator/v10`

- [ ] **Step 2: Verify it's in go.mod**

Run: `cd server && grep validator go.mod`
Expected: `github.com/go-playground/validator/v10 v10.x.x`

- [ ] **Step 3: Commit**

```bash
cd server && git add go.mod go.sum
git commit -m "chore: add go-playground/validator dependency"
```

---

## Task 2: Tool interface and Registry

**Files:**
- Create: `server/internal/chat/tool.go`
- Create: `server/internal/chat/registry.go`

- [ ] **Step 1: Create the Tool interface**

Create `server/internal/chat/tool.go`:

```go
package chat

import (
	"context"
	"encoding/json"

	"github.com/ksushant6566/mindtab/server/internal/providers/llm"
)

// Tool is the interface every chat tool implements.
type Tool interface {
	// Name returns the unique identifier for this tool (e.g., "list_goals").
	Name() string

	// Description returns a human-readable description for the LLM.
	Description() string

	// Schema returns the JSON Schema definition for the LLM's function calling.
	Schema() llm.ToolDefinition

	// ParseArgs unmarshals raw JSON arguments into a typed struct.
	// The registry handles validation after this returns.
	ParseArgs(raw json.RawMessage) (any, error)

	// Execute performs the tool's action with pre-validated, typed args.
	Execute(ctx context.Context, userID string, args any) (any, error)
}
```

- [ ] **Step 2: Create the Registry**

Create `server/internal/chat/registry.go`:

```go
package chat

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"strings"
	"time"

	"github.com/go-playground/validator/v10"
	"github.com/ksushant6566/mindtab/server/internal/providers/llm"
)

// Registry holds registered tools and runs the execution pipeline.
type Registry struct {
	tools    map[string]Tool
	validate *validator.Validate
}

// NewRegistry creates a new empty Registry.
func NewRegistry() *Registry {
	return &Registry{
		tools:    make(map[string]Tool),
		validate: validator.New(),
	}
}

// Register adds a tool to the registry. Panics if a tool with the same name is already registered.
func (r *Registry) Register(t Tool) {
	name := t.Name()
	if _, exists := r.tools[name]; exists {
		panic(fmt.Sprintf("tool already registered: %s", name))
	}
	r.tools[name] = t
}

// Definitions returns LLM tool definitions for all registered tools.
func (r *Registry) Definitions() []llm.ToolDefinition {
	defs := make([]llm.ToolDefinition, 0, len(r.tools))
	for _, t := range r.tools {
		defs = append(defs, t.Schema())
	}
	return defs
}

// Execute runs the full tool execution pipeline: lookup → parse → validate → log → execute → log.
func (r *Registry) Execute(ctx context.Context, userID string, toolName string, argsJSON string) (any, error) {
	// 1. Lookup
	tool, ok := r.tools[toolName]
	if !ok {
		return nil, fmt.Errorf("unknown tool: %s", toolName)
	}

	// 2. Parse args
	parsed, err := tool.ParseArgs(json.RawMessage(argsJSON))
	if err != nil {
		return nil, fmt.Errorf("invalid arguments for %s: %w", toolName, err)
	}

	// 3. Validate (skip if tool has no args)
	if parsed != nil {
		if err := r.validate.Struct(parsed); err != nil {
			return nil, formatValidationError(toolName, err)
		}
	}

	// 4. Log start
	slog.Info("tool.execute.start",
		"tool", toolName,
		"userID", userID,
		"args", sanitizeArgs(argsJSON),
	)

	// 5. Execute
	start := time.Now()
	result, execErr := tool.Execute(ctx, userID, parsed)
	duration := time.Since(start)

	// 6. Log end
	if execErr != nil {
		slog.Error("tool.execute.error",
			"tool", toolName,
			"userID", userID,
			"duration_ms", duration.Milliseconds(),
			"error", execErr.Error(),
		)
		return nil, execErr
	}

	slog.Info("tool.execute.end",
		"tool", toolName,
		"userID", userID,
		"duration_ms", duration.Milliseconds(),
	)

	return result, nil
}

// formatValidationError converts validator errors into a clear message for the LLM.
func formatValidationError(toolName string, err error) error {
	validationErrs, ok := err.(validator.ValidationErrors)
	if !ok {
		return fmt.Errorf("validation failed for %s: %w", toolName, err)
	}

	var parts []string
	for _, fe := range validationErrs {
		field := fe.Field()
		tag := fe.Tag()
		param := fe.Param()

		switch tag {
		case "required":
			parts = append(parts, fmt.Sprintf("'%s' is required", field))
		case "oneof":
			parts = append(parts, fmt.Sprintf("'%s': got '%v', valid values are [%s]", field, fe.Value(), strings.ReplaceAll(param, " ", ", ")))
		case "uuid":
			parts = append(parts, fmt.Sprintf("'%s': '%v' is not a valid UUID", field, fe.Value()))
		case "min":
			parts = append(parts, fmt.Sprintf("'%s' must be at least %s characters", field, param))
		default:
			parts = append(parts, fmt.Sprintf("'%s' failed validation: %s=%s", field, tag, param))
		}
	}

	return fmt.Errorf("invalid arguments for %s: %s", toolName, strings.Join(parts, "; "))
}

// sanitizeArgs truncates long arg values for logging.
func sanitizeArgs(argsJSON string) string {
	if len(argsJSON) > 500 {
		return argsJSON[:500] + "...(truncated)"
	}
	return argsJSON
}

// ---------------------------------------------------------------------------
// JSON Schema helpers (moved from old tools.go)
// ---------------------------------------------------------------------------

func jsonSchema(typ string, properties map[string]interface{}, description ...string) map[string]interface{} {
	m := map[string]interface{}{
		"type": typ,
	}
	if len(description) > 0 && description[0] != "" {
		m["description"] = description[0]
	}
	if properties != nil {
		m["properties"] = properties
	}
	return m
}

func jsonSchemaEnum(values []string, description string) map[string]interface{} {
	return map[string]interface{}{
		"type":        "string",
		"enum":        values,
		"description": description,
	}
}

func jsonSchemaWithRequired(typ string, properties map[string]interface{}, required []string) map[string]interface{} {
	m := map[string]interface{}{
		"type": typ,
	}
	if properties != nil {
		m["properties"] = properties
	}
	if len(required) > 0 {
		m["required"] = required
	}
	return m
}

// ---------------------------------------------------------------------------
// pgtype conversion helpers (moved from old tools.go)
// ---------------------------------------------------------------------------

func uuidToString(u pgtype.UUID) string { ... }
func pgtextToString(t pgtype.Text) string { ... }
func timestamptzToString(t pgtype.Timestamptz) string { ... }
func ifaceToString(v interface{}) string { ... }
```

Copy the pgtype helper function bodies from the current `tools.go` (lines 931-957). Add the necessary imports (`pgtype`, `uuid`, `pgtype.Timestamptz`).

- [ ] **Step 3: Verify it compiles**

Run: `cd server && go build ./...`
Expected: May have unused import warnings but should compile. The old `tools.go` still exists and may conflict — that's OK for now.

- [ ] **Step 4: Commit**

```bash
cd server && git add internal/chat/tool.go internal/chat/registry.go
git commit -m "feat(chat): add Tool interface and Registry with validation pipeline"
```

---

## Task 3: Goal tools

**Files:**
- Create: `server/internal/chat/tools_goals.go`

- [ ] **Step 1: Create goal tools**

Create `server/internal/chat/tools_goals.go` with 4 tool structs. For each tool:
- Args struct with `validate` tags (enums, required, uuid)
- `Name()`, `Description()`, `Schema()`, `ParseArgs()`, `Execute()` methods

Move the logic from the current `tools.go` functions: `listGoals` (line 260-316), `createGoal` (line 318-380), `updateGoal` (line 382-443), `deleteGoal` (line 446-466).

**Args structs with validation tags:**

```go
type ListGoalsArgs struct {
	Status    *string `json:"status"     validate:"omitempty,oneof=pending in_progress completed archived"`
	ProjectID *string `json:"project_id" validate:"omitempty,uuid"`
}

type CreateGoalArgs struct {
	Title     string  `json:"title"      validate:"required,min=1"`
	Priority  *string `json:"priority"   validate:"omitempty,oneof=priority_1 priority_2 priority_3 priority_4"`
	ProjectID *string `json:"project_id" validate:"omitempty,uuid"`
}

type UpdateGoalArgs struct {
	ID       string  `json:"id"       validate:"required,uuid"`
	Title    *string `json:"title"    validate:"omitempty,min=1"`
	Status   *string `json:"status"   validate:"omitempty,oneof=pending in_progress completed archived"`
	Priority *string `json:"priority" validate:"omitempty,oneof=priority_1 priority_2 priority_3 priority_4"`
}

type DeleteGoalArgs struct {
	ID string `json:"id" validate:"required,uuid"`
}
```

**Schema definitions:** Use `jsonSchemaEnum` for enum fields. Copy descriptions from the current tool definitions in `tools.go` (lines 33-58).

**Execute methods:** Copy the business logic from the current `listGoals`, `createGoal`, `updateGoal`, `deleteGoal` functions. Each tool struct holds `queries store.Querier` as a field.

Keep the `"active"` → non-archived status mapping in `ListGoalsTool.Execute` as a safety net.

- [ ] **Step 2: Verify it compiles**

Run: `cd server && go build ./...`

- [ ] **Step 3: Commit**

```bash
cd server && git add internal/chat/tools_goals.go
git commit -m "feat(chat): add goal tools (list, create, update, delete)"
```

---

## Task 4: Habit tools

**Files:**
- Create: `server/internal/chat/tools_habits.go`

- [ ] **Step 1: Create habit tools**

3 tools: `ListHabitsTool`, `CreateHabitTool`, `ToggleHabitTool`.

Move logic from `tools.go`: `listHabits` (line 468-508), `createHabit` (line 510-538), `toggleHabit` (line 540-603).

**Args structs:**
```go
// ListHabitsTool has no args

type CreateHabitArgs struct {
	Title     string  `json:"title"     validate:"required,min=1"`
	Frequency *string `json:"frequency" validate:"omitempty,oneof=daily weekly"`
}

type ToggleHabitArgs struct {
	ID string `json:"id" validate:"required,uuid"`
}
```

`ListHabitsTool` has no args — `ParseArgs` returns `nil, nil` (the registry skips validation for nil).

- [ ] **Step 2: Verify it compiles**

Run: `cd server && go build ./...`

- [ ] **Step 3: Commit**

```bash
cd server && git add internal/chat/tools_habits.go
git commit -m "feat(chat): add habit tools (list, create, toggle)"
```

---

## Task 5: Journal tools

**Files:**
- Create: `server/internal/chat/tools_journals.go`

- [ ] **Step 1: Create journal tools**

4 tools: `ListJournalsTool`, `CreateJournalTool`, `UpdateJournalTool`, `DeleteJournalTool`.

Move logic from `tools.go`: `listJournals` (line 605-650), `createJournal` (line 652-678), `updateJournal` (line 680-726), `deleteJournal` (line 728-748).

**Args structs:**
```go
type ListJournalsArgs struct {
	ProjectID *string `json:"project_id" validate:"omitempty,uuid"`
}

type CreateJournalArgs struct {
	Title   string `json:"title"   validate:"required,min=1"`
	Content string `json:"content" validate:"required,min=1"`
}

type UpdateJournalArgs struct {
	ID      string  `json:"id"      validate:"required,uuid"`
	Title   *string `json:"title"   validate:"omitempty,min=1"`
	Content *string `json:"content"`
}

type DeleteJournalArgs struct {
	ID string `json:"id" validate:"required,uuid"`
}
```

- [ ] **Step 2: Verify and commit**

```bash
cd server && go build ./... && git add internal/chat/tools_journals.go
git commit -m "feat(chat): add journal tools (list, create, update, delete)"
```

---

## Task 6: Project and Vault tools

**Files:**
- Create: `server/internal/chat/tools_projects.go`
- Create: `server/internal/chat/tools_vault.go`

- [ ] **Step 1: Create project tools**

2 tools: `ListProjectsTool`, `CreateProjectTool`.

Move from `tools.go`: `listProjects` (line 750-776), `createProject` (line 778-807).

```go
// ListProjectsTool has no args

type CreateProjectArgs struct {
	Name  string  `json:"name"  validate:"required,min=1"`
	Color *string `json:"color"`
}
```

- [ ] **Step 2: Create vault tools**

2 tools: `SearchVaultTool`, `GetVaultItemTool`.

Move from `tools.go`: `searchVault` (line 809-859), `getVaultItem` (line 861-893).

`SearchVaultTool` takes both `queries store.Querier` and `search *search.SemanticSearch` as struct fields.

```go
type SearchVaultArgs struct {
	Query string `json:"query" validate:"required,min=1"`
	Limit *int   `json:"limit" validate:"omitempty,min=1,max=50"`
}

type GetVaultItemArgs struct {
	ID string `json:"id" validate:"required,uuid"`
}
```

- [ ] **Step 3: Verify and commit**

```bash
cd server && go build ./... && git add internal/chat/tools_projects.go internal/chat/tools_vault.go
git commit -m "feat(chat): add project and vault tools"
```

---

## Task 7: Wire registry into orchestrator and main.go

**Files:**
- Modify: `server/internal/chat/orchestrator.go`
- Modify: `server/cmd/api/main.go`
- Delete: `server/internal/chat/tools.go`

- [ ] **Step 1: Update orchestrator**

In `server/internal/chat/orchestrator.go`:

Change the `Orchestrator` struct field from `tools *ToolRegistry` to `registry *Registry`:

```go
type Orchestrator struct {
	queries  store.Querier
	llmChain *providers.Chain[llm.LLMProvider]
	registry *Registry
}

func NewOrchestrator(queries store.Querier, llmChain *providers.Chain[llm.LLMProvider], registry *Registry) *Orchestrator {
	return &Orchestrator{
		queries:  queries,
		llmChain: llmChain,
		registry: registry,
	}
}
```

Update the two call sites:
- Line 204: `o.tools.Definitions()` → `o.registry.Definitions()`
- Line 261: `o.tools.Execute(ctx, userID, tc.Name, tc.Arguments)` → `o.registry.Execute(ctx, userID, tc.Name, tc.Arguments)`

- [ ] **Step 2: Update main.go**

In `server/cmd/api/main.go`, replace (around line 154):

```go
toolRegistry := chat.NewToolRegistry(queries, semanticSearch)
orchestrator := chat.NewOrchestrator(queries, llmChain, toolRegistry)
```

With:

```go
registry := chat.NewRegistry()
registry.Register(chat.NewListGoalsTool(queries))
registry.Register(chat.NewCreateGoalTool(queries))
registry.Register(chat.NewUpdateGoalTool(queries))
registry.Register(chat.NewDeleteGoalTool(queries))
registry.Register(chat.NewListHabitsTool(queries))
registry.Register(chat.NewCreateHabitTool(queries))
registry.Register(chat.NewToggleHabitTool(queries))
registry.Register(chat.NewListJournalsTool(queries))
registry.Register(chat.NewCreateJournalTool(queries))
registry.Register(chat.NewUpdateJournalTool(queries))
registry.Register(chat.NewDeleteJournalTool(queries))
registry.Register(chat.NewListProjectsTool(queries))
registry.Register(chat.NewCreateProjectTool(queries))
registry.Register(chat.NewSearchVaultTool(queries, semanticSearch))
registry.Register(chat.NewGetVaultItemTool(queries))
orchestrator := chat.NewOrchestrator(queries, llmChain, registry)
```

- [ ] **Step 3: Delete old tools.go**

Run: `rm server/internal/chat/tools.go`

- [ ] **Step 4: Verify everything compiles**

Run: `cd server && go build ./cmd/api`
Expected: Clean compile. All references to old `ToolRegistry` type are gone.

Run: `cd server && go vet ./...`
Expected: No issues.

- [ ] **Step 5: Commit**

```bash
cd server && git add -A internal/chat/ cmd/api/main.go
git commit -m "feat(chat): wire new tool registry, delete monolithic tools.go"
```

---

## Task 8: Registry tests

**Files:**
- Create: `server/internal/chat/registry_test.go`

- [ ] **Step 1: Write tests**

Create `server/internal/chat/registry_test.go` with tests for the registry pipeline:

**Test 1: Unknown tool returns error**
- Call `registry.Execute(ctx, "user1", "nonexistent_tool", "{}")`
- Assert error contains "unknown tool"

**Test 2: Invalid args rejected by validation**
- Register a test tool with a `Status *string validate:"omitempty,oneof=a b c"` arg
- Call Execute with `{"status": "invalid"}`
- Assert error contains "valid values are"

**Test 3: Missing required field rejected**
- Register a test tool with `Title string validate:"required"`
- Call Execute with `{}`
- Assert error contains "required"

**Test 4: Valid args pass through to Execute**
- Register a test tool that returns `{"ok": true}` from Execute
- Call Execute with valid args
- Assert result is `{"ok": true}`

**Test 5: Nil ParseArgs result skips validation**
- Register a tool whose ParseArgs returns `nil, nil` (no args)
- Call Execute with `{}`
- Assert no error

Create a simple `mockTool` struct implementing `Tool` interface for these tests — keeps tests self-contained without needing DB dependencies.

- [ ] **Step 2: Run tests**

Run: `cd server && go test ./internal/chat/ -v -run TestRegistry`
Expected: All tests pass

- [ ] **Step 3: Commit**

```bash
cd server && git add internal/chat/registry_test.go
git commit -m "test(chat): add registry pipeline tests"
```
