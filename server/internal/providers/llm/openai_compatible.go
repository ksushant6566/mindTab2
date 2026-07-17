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

type OpenAICompatibleProvider struct {
	apiKey  string
	baseURL string
	model   string
	name    string
	client  *http.Client
	headers map[string]string
}

func NewOpenAIProvider(apiKey, model string) *OpenAICompatibleProvider {
	return newOpenAICompatibleProvider("openai", "https://api.openai.com/v1", apiKey, model, nil)
}

func NewOpenRouterProvider(apiKey, model string) *OpenAICompatibleProvider {
	return newOpenAICompatibleProvider("openrouter", "https://openrouter.ai/api/v1", apiKey, model, map[string]string{
		"HTTP-Referer": "https://mindtab.in",
		"X-Title":      "MindTab",
	})
}

func newOpenAICompatibleProvider(name, baseURL, apiKey, model string, headers map[string]string) *OpenAICompatibleProvider {
	return &OpenAICompatibleProvider{
		apiKey: apiKey, baseURL: strings.TrimRight(baseURL, "/"), model: model,
		name: name, client: http.DefaultClient, headers: headers,
	}
}

func (p *OpenAICompatibleProvider) Name() string { return p.name }

type openAIMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type openAIFunction struct {
	Name        string                 `json:"name"`
	Description string                 `json:"description,omitempty"`
	Parameters  map[string]interface{} `json:"parameters"`
}

type openAITool struct {
	Type     string         `json:"type"`
	Function openAIFunction `json:"function"`
}

type openAIRequest struct {
	Model               string          `json:"model"`
	Messages            []openAIMessage `json:"messages"`
	Tools               []openAITool    `json:"tools,omitempty"`
	Stream              bool            `json:"stream,omitempty"`
	MaxTokens           int             `json:"max_tokens,omitempty"`
	MaxCompletionTokens int             `json:"max_completion_tokens,omitempty"`
	Temperature         float64         `json:"temperature,omitempty"`
}

func (p *OpenAICompatibleProvider) request(req LLMRequest, tools []ToolDefinition, stream bool) openAIRequest {
	messages := make([]openAIMessage, 0, 2)
	if req.SystemPrompt != "" {
		messages = append(messages, openAIMessage{Role: "system", Content: req.SystemPrompt})
	}
	messages = append(messages, openAIMessage{Role: "user", Content: req.UserPrompt})

	convertedTools := make([]openAITool, 0, len(tools))
	for _, tool := range tools {
		convertedTools = append(convertedTools, openAITool{
			Type: "function",
			Function: openAIFunction{
				Name: tool.Name, Description: tool.Description, Parameters: tool.Parameters,
			},
		})
	}
	model := req.Model
	if model == "" {
		model = p.model
	}
	payload := openAIRequest{
		Model: model, Messages: messages, Tools: convertedTools, Stream: stream,
		MaxTokens: req.MaxTokens, Temperature: req.Temperature,
	}
	if p.name == "openai" {
		payload.MaxCompletionTokens = payload.MaxTokens
		payload.MaxTokens = 0
	}
	if strings.HasPrefix(model, "gpt-5") {
		payload.Temperature = 0
	}
	return payload
}

func (p *OpenAICompatibleProvider) do(ctx context.Context, payload openAIRequest) (*http.Response, error) {
	body, err := json.Marshal(payload)
	if err != nil {
		return nil, fmt.Errorf("%s encode request: %w", p.name, err)
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, p.baseURL+"/chat/completions", bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("%s create request: %w", p.name, err)
	}
	request.Header.Set("Authorization", "Bearer "+p.apiKey)
	request.Header.Set("Content-Type", "application/json")
	for key, value := range p.headers {
		request.Header.Set(key, value)
	}
	response, err := p.client.Do(request)
	if err != nil {
		return nil, fmt.Errorf("%s request: %w", p.name, err)
	}
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		defer response.Body.Close()
		message, _ := io.ReadAll(io.LimitReader(response.Body, 16*1024))
		return nil, fmt.Errorf("%s API returned %d: %s", p.name, response.StatusCode, strings.TrimSpace(string(message)))
	}
	return response, nil
}

func (p *OpenAICompatibleProvider) Complete(ctx context.Context, req LLMRequest) (*LLMResponse, error) {
	response, err := p.do(ctx, p.request(req, nil, false))
	if err != nil {
		return nil, err
	}
	defer response.Body.Close()
	var result struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
		Usage struct {
			PromptTokens     int `json:"prompt_tokens"`
			CompletionTokens int `json:"completion_tokens"`
		} `json:"usage"`
	}
	if err := json.NewDecoder(response.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("%s decode response: %w", p.name, err)
	}
	if len(result.Choices) == 0 {
		return nil, fmt.Errorf("%s returned an empty response", p.name)
	}
	return &LLMResponse{
		Text: result.Choices[0].Message.Content, Provider: p.name,
		Tokens: TokenUsage{Input: result.Usage.PromptTokens, Output: result.Usage.CompletionTokens},
	}, nil
}

type openAIToolCallAccumulator struct {
	id        string
	name      string
	arguments strings.Builder
}

func (p *OpenAICompatibleProvider) StreamComplete(
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

	toolCalls := make(map[int]*openAIToolCallAccumulator)
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
		if data == "" || data == "[DONE]" {
			continue
		}
		var event struct {
			Choices []struct {
				Delta struct {
					Content   string `json:"content"`
					ToolCalls []struct {
						Index    int    `json:"index"`
						ID       string `json:"id"`
						Function struct {
							Name      string `json:"name"`
							Arguments string `json:"arguments"`
						} `json:"function"`
					} `json:"tool_calls"`
				} `json:"delta"`
				FinishReason string `json:"finish_reason"`
			} `json:"choices"`
		}
		if err := json.Unmarshal([]byte(data), &event); err != nil {
			return fmt.Errorf("%s decode stream: %w", p.name, err)
		}
		for _, choice := range event.Choices {
			if choice.Delta.Content != "" {
				if err := callback(StreamDelta{Content: choice.Delta.Content}); err != nil {
					return err
				}
			}
			for _, fragment := range choice.Delta.ToolCalls {
				call, exists := toolCalls[fragment.Index]
				if !exists {
					call = &openAIToolCallAccumulator{}
					toolCalls[fragment.Index] = call
					toolOrder = append(toolOrder, fragment.Index)
				}
				if fragment.ID != "" {
					call.id = fragment.ID
				}
				if fragment.Function.Name != "" {
					call.name += fragment.Function.Name
				}
				call.arguments.WriteString(fragment.Function.Arguments)
			}
			if choice.FinishReason != "" {
				finishReason = choice.FinishReason
			}
		}
	}
	if err := scanner.Err(); err != nil {
		return fmt.Errorf("%s read stream: %w", p.name, err)
	}

	completed := make([]ToolCall, 0, len(toolOrder))
	for _, index := range toolOrder {
		call := toolCalls[index]
		completed = append(completed, ToolCall{ID: call.id, Name: call.name, Arguments: call.arguments.String()})
	}
	if len(completed) > 0 || finishReason != "" {
		return callback(StreamDelta{ToolCalls: completed, FinishReason: finishReason})
	}
	return nil
}
