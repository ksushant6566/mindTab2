# Tool Execution Pipeline — Design Spec

**Date:** 2026-03-20
**Status:** Approved

## Overview

Replace the monolithic `tools.go` (950+ lines, central switch statement, no validation) with a robust tool execution pipeline. Each tool is a self-contained struct implementing a `Tool` interface. The registry handles lookup, validation, logging, and execution.

## Problem

The current implementation has:
- No server-side argument validation — LLM can pass invalid values (e.g., `status: "active"` when valid values are `pending/in_progress/completed/archived`), causing silent wrong results
- No logging — no visibility into what tools are called, with what args, or how long they take
- A growing god file — 15 tools in one 950-line file with a central switch statement. Every new tool touches 4 places in the same file.
- No extensibility — adding cross-cutting concerns (permissions, rate limits) requires modifying every tool

## Tool Interface

```go
type Tool interface {
    Name() string
    Description() string
    Schema() llm.ToolDefinition
    ParseArgs(raw json.RawMessage) (any, error)
    Execute(ctx context.Context, userID string, args any) (any, error)
}
```

- `Name()` — unique identifier (e.g., `"list_goals"`)
- `Description()` — human-readable description for the LLM
- `Schema()` — JSON Schema definition for the LLM's function calling (enum constraints, required fields, descriptions)
- `ParseArgs()` — unmarshal raw JSON into a typed struct and validate using `go-playground/validator` struct tags. Returns a clear error message if validation fails.
- `Execute()` — perform the action using the pre-validated, typed args. Can trust args are clean.

## Arg Validation

Each tool defines a typed args struct with validation tags:

```go
type ListGoalsArgs struct {
    Status    *string `json:"status"     validate:"omitempty,oneof=pending in_progress completed archived"`
    ProjectID *string `json:"project_id" validate:"omitempty,uuid"`
}

type CreateGoalArgs struct {
    Title    string  `json:"title"    validate:"required,min=1"`
    Priority *string `json:"priority" validate:"omitempty,oneof=priority_1 priority_2 priority_3 priority_4"`
}

type CreateHabitArgs struct {
    Title     string  `json:"title"     validate:"required,min=1"`
    Frequency *string `json:"frequency" validate:"omitempty,oneof=daily weekly"`
}
```

`ParseArgs` unmarshals and runs `validator.Validate()`. On failure, returns a structured error message the LLM can understand and self-correct from:

```
invalid argument 'status': got 'active', valid values are [pending, in_progress, completed, archived]
```

The JSON Schema in `Schema()` and the struct tags in `ParseArgs` both express the same constraints for different audiences — schema tells the LLM what to pass, tags enforce it server-side. They live in the same file per tool, so keeping them in sync is straightforward.

## Registry

```go
type Registry struct {
    tools    map[string]Tool
    validate *validator.Validate
}

func NewRegistry() *Registry
func (r *Registry) Register(t Tool)
func (r *Registry) Definitions() []llm.ToolDefinition
func (r *Registry) Execute(ctx context.Context, userID string, toolName string, argsJSON string) (any, error)
```

### Execution Pipeline

```
LLM returns tool call
    |
    v
1. Lookup tool by name
   - Unknown tool -> return error: "unknown tool: {name}"
    |
    v
2. tool.ParseArgs(argsJSON)
   - Unmarshal JSON into typed struct
   - Validate via struct tags
   - Failure -> return clear error to LLM (not a panic, not silent)
    |
    v
3. Log start
   - slog.Info("tool.execute.start", "tool", name, "userID", userID, "args", sanitizedArgs)
   - Sanitize args: redact any field named "content" or longer than 200 chars
    |
    v
4. tool.Execute(ctx, userID, parsedArgs)
   - Args are pre-validated and typed
   - Tool focuses on business logic only
    |
    v
5. Log end
   - slog.Info("tool.execute.end", "tool", name, "userID", userID, "duration_ms", ms, "success", true/false)
   - On error: slog.Error with the error message
    |
    v
6. Return result or structured error
```

## File Structure

```
server/internal/chat/
├── tool.go              # Tool interface definition
├── registry.go          # Registry struct, Execute pipeline, logging, validator setup
├── tools_goals.go       # ListGoalsTool, CreateGoalsTool, UpdateGoalTool, DeleteGoalTool
├── tools_habits.go      # ListHabitsTool, CreateHabitTool, ToggleHabitTool
├── tools_journals.go    # ListJournalsTool, CreateJournalTool, UpdateJournalTool, DeleteJournalTool
├── tools_projects.go    # ListProjectsTool, CreateProjectTool
├── tools_vault.go       # SearchVaultTool, GetVaultItemTool
└── orchestrator.go      # Updated to use registry.Execute (minimal changes)
```

### What each file contains (example: `tools_goals.go`)

```go
// --- ListGoalsTool ---

type ListGoalsArgs struct {
    Status    *string `json:"status"     validate:"omitempty,oneof=pending in_progress completed archived"`
    ProjectID *string `json:"project_id" validate:"omitempty,uuid"`
}

type ListGoalsTool struct {
    queries store.Querier
}

func NewListGoalsTool(queries store.Querier) *ListGoalsTool

func (t *ListGoalsTool) Name() string                    { return "list_goals" }
func (t *ListGoalsTool) Description() string              { return "List the user's goals..." }
func (t *ListGoalsTool) Schema() llm.ToolDefinition       { return llm.ToolDefinition{...} }
func (t *ListGoalsTool) ParseArgs(raw json.RawMessage) (any, error) {
    var args ListGoalsArgs
    if err := json.Unmarshal(raw, &args); err != nil { return nil, err }
    if err := validate.Struct(args); err != nil { return nil, formatValidationError(err) }
    return &args, nil
}
func (t *ListGoalsTool) Execute(ctx context.Context, userID string, args any) (any, error) {
    a := args.(*ListGoalsArgs)
    // ... query and return
}
```

All 4 concerns (schema, arg struct, validation, execution) in one place per tool.

## Orchestrator Changes

Minimal. Replace:
```go
result, err := o.tools.Execute(ctx, userID, tc.Name, tc.Arguments)
```

With:
```go
result, err := o.registry.Execute(ctx, userID, tc.Name, tc.Arguments)
```

The `ToolRegistry` type is renamed to `Registry`. The orchestrator no longer needs to know about individual tools.

## Dependencies

- `github.com/go-playground/validator/v10` — struct validation. Well-maintained, 13k+ stars, standard Go choice for this.

## Migration

The old `tools.go` is deleted entirely. All 15 tools are reimplemented as individual structs grouped by domain file. The helper functions (`uuidToString`, `pgtextToString`, etc.) move to a `helpers.go` in the same package.

## Future Extensibility (not implemented now)

**Permission scoping:** Add `Permission() string` to the `Tool` interface (returns `"read"`, `"write"`, or `"delete"`). Registry checks it before execution. Destructive tools could require confirmation from the user before executing.

**Rate limiting:** Registry tracks call counts per tool per conversation. Could enforce limits like "max 3 delete operations per conversation."

Both slot naturally into the pipeline without changing individual tools.
