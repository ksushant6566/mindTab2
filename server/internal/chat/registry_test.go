package chat

import (
	"context"
	"encoding/json"
	"strings"
	"testing"

	"github.com/ksushant6566/mindtab/server/internal/providers/llm"
)

// mockTool implements the Tool interface for testing.
type mockTool struct {
	name        string
	description string
	schema      llm.ToolDefinition
	parseArgs   func(json.RawMessage) (any, error)
	execute     func(context.Context, string, any) (any, error)
}

func (m *mockTool) Name() string        { return m.name }
func (m *mockTool) Description() string { return m.description }
func (m *mockTool) Schema() llm.ToolDefinition { return m.schema }
func (m *mockTool) ParseArgs(raw json.RawMessage) (any, error) {
	return m.parseArgs(raw)
}
func (m *mockTool) Execute(ctx context.Context, userID string, args any) (any, error) {
	return m.execute(ctx, userID, args)
}

// Test-specific structs with validation tags.
type testEnumArgs struct {
	Status string `json:"status" validate:"required,oneof=a b c"`
}

type testRequiredArgs struct {
	Title string `json:"title" validate:"required"`
}

// TestRegistry_UnknownTool verifies that executing a non-existent tool returns an error
// containing "unknown tool".
func TestRegistry_UnknownTool(t *testing.T) {
	r := NewRegistry()

	_, err := r.Execute(context.Background(), "user1", "nonexistent_tool", `{}`)
	if err == nil {
		t.Fatal("expected error, got nil")
	}
	if !strings.Contains(err.Error(), "unknown tool") {
		t.Errorf("expected error to contain 'unknown tool', got: %s", err.Error())
	}
}

// TestRegistry_InvalidEnumValue verifies that passing a value not in the allowed enum
// returns an error containing "valid values are" and the allowed values.
func TestRegistry_InvalidEnumValue(t *testing.T) {
	r := NewRegistry()

	tool := &mockTool{
		name:        "enum_tool",
		description: "test enum validation",
		schema:      llm.ToolDefinition{Name: "enum_tool"},
		parseArgs: func(raw json.RawMessage) (any, error) {
			var args testEnumArgs
			if err := json.Unmarshal(raw, &args); err != nil {
				return nil, err
			}
			return &args, nil
		},
		execute: func(ctx context.Context, userID string, args any) (any, error) {
			return map[string]any{"ok": true}, nil
		},
	}
	r.Register(tool)

	_, err := r.Execute(context.Background(), "user1", "enum_tool", `{"status": "invalid"}`)
	if err == nil {
		t.Fatal("expected validation error, got nil")
	}
	if !strings.Contains(err.Error(), "valid values are") {
		t.Errorf("expected error to contain 'valid values are', got: %s", err.Error())
	}
	if !strings.Contains(err.Error(), "a, b, c") {
		t.Errorf("expected error to contain 'a, b, c', got: %s", err.Error())
	}
}

// TestRegistry_MissingRequiredField verifies that omitting a required field returns an
// error containing "required".
func TestRegistry_MissingRequiredField(t *testing.T) {
	r := NewRegistry()

	tool := &mockTool{
		name:        "required_tool",
		description: "test required validation",
		schema:      llm.ToolDefinition{Name: "required_tool"},
		parseArgs: func(raw json.RawMessage) (any, error) {
			var args testRequiredArgs
			if err := json.Unmarshal(raw, &args); err != nil {
				return nil, err
			}
			return &args, nil
		},
		execute: func(ctx context.Context, userID string, args any) (any, error) {
			return map[string]any{"ok": true}, nil
		},
	}
	r.Register(tool)

	_, err := r.Execute(context.Background(), "user1", "required_tool", `{}`)
	if err == nil {
		t.Fatal("expected validation error, got nil")
	}
	if !strings.Contains(err.Error(), "required") {
		t.Errorf("expected error to contain 'required', got: %s", err.Error())
	}
}

// TestRegistry_ValidArgsPassThrough verifies that valid args flow through to Execute and
// the result is returned unchanged.
func TestRegistry_ValidArgsPassThrough(t *testing.T) {
	r := NewRegistry()

	tool := &mockTool{
		name:        "passthrough_tool",
		description: "test valid args",
		schema:      llm.ToolDefinition{Name: "passthrough_tool"},
		parseArgs: func(raw json.RawMessage) (any, error) {
			var args testRequiredArgs
			if err := json.Unmarshal(raw, &args); err != nil {
				return nil, err
			}
			return &args, nil
		},
		execute: func(ctx context.Context, userID string, args any) (any, error) {
			return map[string]any{"ok": true}, nil
		},
	}
	r.Register(tool)

	result, err := r.Execute(context.Background(), "user1", "passthrough_tool", `{"title": "hello"}`)
	if err != nil {
		t.Fatalf("expected no error, got: %s", err.Error())
	}

	m, ok := result.(map[string]any)
	if !ok {
		t.Fatalf("expected map[string]any result, got: %T", result)
	}
	val, exists := m["ok"]
	if !exists {
		t.Fatal("expected result to contain key 'ok'")
	}
	if val != true {
		t.Errorf("expected result['ok'] to be true, got: %v", val)
	}
}

// TestRegistry_NilArgsSkipValidation verifies that when ParseArgs returns nil, the
// validation step is skipped and Execute is called without error.
func TestRegistry_NilArgsSkipValidation(t *testing.T) {
	r := NewRegistry()

	tool := &mockTool{
		name:        "nil_args_tool",
		description: "test nil args skip validation",
		schema:      llm.ToolDefinition{Name: "nil_args_tool"},
		parseArgs: func(raw json.RawMessage) (any, error) {
			return nil, nil
		},
		execute: func(ctx context.Context, userID string, args any) (any, error) {
			return map[string]any{"ok": true}, nil
		},
	}
	r.Register(tool)

	_, err := r.Execute(context.Background(), "user1", "nil_args_tool", `{}`)
	if err != nil {
		t.Fatalf("expected no error for nil args, got: %s", err.Error())
	}
}

// TestRegistry_DuplicateRegistrationPanics verifies that registering two tools with the
// same name panics.
func TestRegistry_DuplicateRegistrationPanics(t *testing.T) {
	r := NewRegistry()

	makeTool := func(name string) *mockTool {
		return &mockTool{
			name:        name,
			description: "test tool",
			schema:      llm.ToolDefinition{Name: name},
			parseArgs: func(raw json.RawMessage) (any, error) {
				return nil, nil
			},
			execute: func(ctx context.Context, userID string, args any) (any, error) {
				return nil, nil
			},
		}
	}

	r.Register(makeTool("dup_tool"))

	defer func() {
		if rec := recover(); rec == nil {
			t.Error("expected panic on duplicate registration, but did not panic")
		}
	}()

	r.Register(makeTool("dup_tool"))
}
