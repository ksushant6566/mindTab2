package llm

import "context"

// LLMProvider defines the interface for LLM completions (text + vision).
type LLMProvider interface {
	Complete(ctx context.Context, req LLMRequest) (*LLMResponse, error)
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
