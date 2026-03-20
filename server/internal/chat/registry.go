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

// Registry holds all registered chat tools and a validator instance.
type Registry struct {
	tools    map[string]Tool
	validate *validator.Validate
}

// NewRegistry creates a new Registry.
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
		panic(fmt.Sprintf("chat: tool %q already registered", name))
	}
	r.tools[name] = t
}

// Definitions returns all tool schemas for passing to the LLM.
func (r *Registry) Definitions() []llm.ToolDefinition {
	defs := make([]llm.ToolDefinition, 0, len(r.tools))
	for _, t := range r.tools {
		defs = append(defs, t.Schema())
	}
	return defs
}

// Execute runs the named tool through the full validation and execution pipeline.
func (r *Registry) Execute(ctx context.Context, userID, toolName, argsJSON string) (any, error) {
	t, ok := r.tools[toolName]
	if !ok {
		return nil, fmt.Errorf("chat: unknown tool %q", toolName)
	}

	parsed, err := t.ParseArgs(json.RawMessage(argsJSON))
	if err != nil {
		return nil, fmt.Errorf("chat: tool %q parse args: %w", toolName, err)
	}

	if parsed != nil {
		if err := r.validate.Struct(parsed); err != nil {
			return nil, formatValidationError(toolName, err)
		}
	}

	slog.Info("tool.execute.start",
		"tool", toolName,
		"userID", userID,
		"args", sanitizeArgs(argsJSON),
	)

	start := time.Now()
	result, err := t.Execute(ctx, userID, parsed)
	durationMs := time.Since(start).Milliseconds()

	if err != nil {
		slog.Error("tool.execute.end",
			"tool", toolName,
			"userID", userID,
			"duration_ms", durationMs,
			"error", err,
		)
		return nil, err
	}

	slog.Info("tool.execute.end",
		"tool", toolName,
		"userID", userID,
		"duration_ms", durationMs,
	)

	return result, nil
}

// formatValidationError converts validator.ValidationErrors into clear human-readable messages.
func formatValidationError(toolName string, err error) error {
	var ve validator.ValidationErrors
	if !isValidationErrors(err, &ve) {
		return fmt.Errorf("chat: tool %q validation: %w", toolName, err)
	}

	msgs := make([]string, 0, len(ve))
	for _, fe := range ve {
		field := strings.ToLower(fe.Field())
		tag := fe.Tag()
		param := fe.Param()
		value := fmt.Sprintf("%v", fe.Value())

		var msg string
		switch tag {
		case "required":
			msg = fmt.Sprintf("'%s' is required", field)
		case "oneof":
			valid := strings.Split(param, " ")
			msg = fmt.Sprintf("'%s': got '%s', valid values are [%s]", field, value, strings.Join(valid, ", "))
		case "uuid":
			msg = fmt.Sprintf("'%s': '%s' is not a valid UUID", field, value)
		case "min":
			msg = fmt.Sprintf("'%s' must be at least %s characters", field, param)
		default:
			msg = fmt.Sprintf("'%s' failed validation: tag=%s", field, tag)
			if param != "" {
				msg += fmt.Sprintf(" param=%s", param)
			}
		}
		msgs = append(msgs, msg)
	}

	return fmt.Errorf("chat: tool %q validation errors: %s", toolName, strings.Join(msgs, "; "))
}

// isValidationErrors attempts to unwrap err as validator.ValidationErrors.
func isValidationErrors(err error, ve *validator.ValidationErrors) bool {
	if err == nil {
		return false
	}
	if e, ok := err.(validator.ValidationErrors); ok {
		*ve = e
		return true
	}
	return false
}

// sanitizeArgs truncates the args JSON to 500 characters for safe logging.
func sanitizeArgs(argsJSON string) string {
	const maxLen = 500
	if len(argsJSON) <= maxLen {
		return argsJSON
	}
	return argsJSON[:maxLen] + "...[truncated]"
}
