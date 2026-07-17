package llm

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
)

type AnthropicProvider struct {
	apiKey  string
	baseURL string
	model   string
	client  *http.Client
}

func NewAnthropicProvider(apiKey, model string) *AnthropicProvider {
	return &AnthropicProvider{
		apiKey: apiKey, baseURL: "https://api.anthropic.com/v1", model: model, client: http.DefaultClient,
	}
}

func (p *AnthropicProvider) Name() string { return "anthropic" }

type anthropicTool struct {
	Name        string                 `json:"name"`
	Description string                 `json:"description,omitempty"`
	InputSchema map[string]interface{} `json:"input_schema"`
}

type anthropicRequest struct {
	Model       string          `json:"model"`
	System      string          `json:"system,omitempty"`
	Messages    []openAIMessage `json:"messages"`
	Tools       []anthropicTool `json:"tools,omitempty"`
	Stream      bool            `json:"stream,omitempty"`
	MaxTokens   int             `json:"max_tokens"`
	Temperature float64         `json:"temperature,omitempty"`
}

func (p *AnthropicProvider) request(req LLMRequest, tools []ToolDefinition, stream bool) anthropicRequest {
	model := req.Model
	if model == "" {
		model = p.model
	}
	convertedTools := make([]anthropicTool, 0, len(tools))
	for _, tool := range tools {
		convertedTools = append(convertedTools, anthropicTool{
			Name: tool.Name, Description: tool.Description, InputSchema: tool.Parameters,
		})
	}
	return anthropicRequest{
		Model: model, System: req.SystemPrompt,
		Messages: []openAIMessage{{Role: "user", Content: req.UserPrompt}},
		Tools:    convertedTools, Stream: stream, MaxTokens: req.MaxTokens, Temperature: req.Temperature,
	}
}

func (p *AnthropicProvider) do(ctx context.Context, payload anthropicRequest) (*http.Response, error) {
	body, err := json.Marshal(payload)
	if err != nil {
		return nil, fmt.Errorf("anthropic encode request: %w", err)
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, strings.TrimRight(p.baseURL, "/")+"/messages", bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("anthropic create request: %w", err)
	}
	request.Header.Set("x-api-key", p.apiKey)
	request.Header.Set("anthropic-version", "2023-06-01")
	request.Header.Set("content-type", "application/json")
	response, err := p.client.Do(request)
	if err != nil {
		return nil, fmt.Errorf("anthropic request: %w", err)
	}
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		defer response.Body.Close()
		message, _ := io.ReadAll(io.LimitReader(response.Body, 16*1024))
		return nil, fmt.Errorf("anthropic API returned %d: %s", response.StatusCode, strings.TrimSpace(string(message)))
	}
	return response, nil
}

func (p *AnthropicProvider) Complete(ctx context.Context, req LLMRequest) (*LLMResponse, error) {
	response, err := p.do(ctx, p.request(req, nil, false))
	if err != nil {
		return nil, err
	}
	defer response.Body.Close()
	var result struct {
		Content []struct {
			Type string `json:"type"`
			Text string `json:"text"`
		} `json:"content"`
		Usage struct {
			InputTokens  int `json:"input_tokens"`
			OutputTokens int `json:"output_tokens"`
		} `json:"usage"`
	}
	if err := json.NewDecoder(response.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("anthropic decode response: %w", err)
	}
	var text strings.Builder
	for _, content := range result.Content {
		if content.Type == "text" {
			text.WriteString(content.Text)
		}
	}
	if text.Len() == 0 {
		return nil, fmt.Errorf("anthropic returned an empty response")
	}
	return &LLMResponse{
		Text: text.String(), Provider: p.Name(),
		Tokens: TokenUsage{Input: result.Usage.InputTokens, Output: result.Usage.OutputTokens},
	}, nil
}

type anthropicToolAccumulator struct {
	id        string
	name      string
	arguments strings.Builder
}

func (p *AnthropicProvider) StreamComplete(
	ctx context.Context,
	req LLMRequest,
	tools []ToolDefinition,
	callback StreamCallback,
) error {
	response, err := p.do(ctx, p.request(req, tools, true))
	if err != nil {
		return err
	}
	defer response.Body.Close()

	toolCalls := make(map[int]*anthropicToolAccumulator)
	toolOrder := make([]int, 0)
	finishReason := ""
	scanner := bufio.NewScanner(response.Body)
	scanner.Buffer(make([]byte, 64*1024), 2*1024*1024)
	for scanner.Scan() {
		line := scanner.Text()
		if !strings.HasPrefix(line, "data:") {
			continue
		}
		data := strings.TrimSpace(strings.TrimPrefix(line, "data:"))
		if data == "" {
			continue
		}
		var event struct {
			Type         string `json:"type"`
			Index        int    `json:"index"`
			ContentBlock struct {
				Type string `json:"type"`
				ID   string `json:"id"`
				Name string `json:"name"`
			} `json:"content_block"`
			Delta struct {
				Type        string `json:"type"`
				Text        string `json:"text"`
				PartialJSON string `json:"partial_json"`
				StopReason  string `json:"stop_reason"`
			} `json:"delta"`
			Error any `json:"error"`
		}
		if err := json.Unmarshal([]byte(data), &event); err != nil {
			return fmt.Errorf("anthropic decode stream: %w", err)
		}
		switch event.Type {
		case "content_block_start":
			if event.ContentBlock.Type == "tool_use" {
				toolCalls[event.Index] = &anthropicToolAccumulator{id: event.ContentBlock.ID, name: event.ContentBlock.Name}
				toolOrder = append(toolOrder, event.Index)
			}
		case "content_block_delta":
			if event.Delta.Type == "text_delta" && event.Delta.Text != "" {
				if err := callback(StreamDelta{Content: event.Delta.Text}); err != nil {
					return err
				}
			}
			if event.Delta.Type == "input_json_delta" {
				if call := toolCalls[event.Index]; call != nil {
					call.arguments.WriteString(event.Delta.PartialJSON)
				}
			}
		case "message_delta":
			finishReason = event.Delta.StopReason
		case "error":
			return fmt.Errorf("anthropic stream error: %v", event.Error)
		}
	}
	if err := scanner.Err(); err != nil {
		return fmt.Errorf("anthropic read stream: %w", err)
	}

	completed := make([]ToolCall, 0, len(toolOrder))
	for _, index := range toolOrder {
		call := toolCalls[index]
		arguments := call.arguments.String()
		if arguments == "" {
			arguments = "{}"
		}
		completed = append(completed, ToolCall{ID: call.id, Name: call.name, Arguments: arguments})
	}
	return callback(StreamDelta{ToolCalls: completed, FinishReason: finishReason})
}
