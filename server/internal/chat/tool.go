package chat

import (
	"context"
	"encoding/json"

	"github.com/ksushant6566/mindtab/server/internal/providers/llm"
)

// Tool is the interface every chat tool implements.
type Tool interface {
	Name() string
	Description() string
	Schema() llm.ToolDefinition
	ParseArgs(raw json.RawMessage) (any, error)
	Execute(ctx context.Context, userID string, args any) (any, error)
}
