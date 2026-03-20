package llm

import "context"

// LLMProvider defines the interface for LLM completions (text + vision).
type LLMProvider interface {
	Complete(ctx context.Context, req LLMRequest) (*LLMResponse, error)
	StreamComplete(ctx context.Context, req LLMRequest, tools []ToolDefinition, callback StreamCallback) error
	Name() string
}

type LLMRequest struct {
	SystemPrompt string
	UserPrompt   string
	Images       []ImageInput
	MaxTokens    int
	Temperature  float64
}

type ImageInput struct {
	Data      []byte
	MediaType string // "image/jpeg", "image/png", "image/webp"
}

type LLMResponse struct {
	Text     string
	Provider string
	Tokens   TokenUsage
}

type TokenUsage struct {
	Input  int
	Output int
}

// StreamDelta represents one chunk of a streaming response
type StreamDelta struct {
	Content      string
	ToolCalls    []ToolCall
	FinishReason string
}

type ToolCall struct {
	ID        string
	Name      string
	Arguments string // JSON string
}

// StreamCallback is called for each delta during streaming
type StreamCallback func(delta StreamDelta) error

type ToolDefinition struct {
	Name        string
	Description string
	Parameters  map[string]interface{} // JSON Schema
}
