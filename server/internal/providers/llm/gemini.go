package llm

import (
	"context"
	"encoding/json"
	"fmt"

	"google.golang.org/genai"
)

type GeminiProvider struct {
	client *genai.Client
	model  string
}

func NewGeminiProvider(apiKey, model string) (*GeminiProvider, error) {
	client, err := genai.NewClient(context.Background(), &genai.ClientConfig{
		APIKey:  apiKey,
		Backend: genai.BackendGeminiAPI,
	})
	if err != nil {
		return nil, fmt.Errorf("create gemini client: %w", err)
	}
	return &GeminiProvider{client: client, model: model}, nil
}

func (g *GeminiProvider) Name() string { return "gemini-flash" }

func (g *GeminiProvider) Complete(ctx context.Context, req LLMRequest) (*LLMResponse, error) {
	var parts []*genai.Part

	// Add images if present (multimodal)
	for _, img := range req.Images {
		parts = append(parts, genai.NewPartFromBytes(img.Data, img.MediaType))
	}

	// Add text prompt
	parts = append(parts, genai.NewPartFromText(req.UserPrompt))

	config := &genai.GenerateContentConfig{
		MaxOutputTokens: int32(req.MaxTokens),
		Temperature:     genai.Ptr(float32(req.Temperature)),
	}

	if req.SystemPrompt != "" {
		config.SystemInstruction = &genai.Content{
			Parts: []*genai.Part{genai.NewPartFromText(req.SystemPrompt)},
		}
	}

	result, err := g.client.Models.GenerateContent(ctx, g.model, []*genai.Content{
		genai.NewContentFromParts(parts, genai.RoleUser),
	}, config)
	if err != nil {
		return nil, fmt.Errorf("gemini generate: %w", err)
	}

	if len(result.Candidates) == 0 || len(result.Candidates[0].Content.Parts) == 0 {
		return nil, fmt.Errorf("gemini: empty response")
	}

	text := ""
	for _, part := range result.Candidates[0].Content.Parts {
		text += part.Text
	}

	resp := &LLMResponse{
		Text:     text,
		Provider: g.Name(),
	}

	if result.UsageMetadata != nil {
		resp.Tokens = TokenUsage{
			Input:  int(result.UsageMetadata.PromptTokenCount),
			Output: int(result.UsageMetadata.CandidatesTokenCount),
		}
	}

	return resp, nil
}

func (g *GeminiProvider) StreamComplete(ctx context.Context, req LLMRequest, tools []ToolDefinition, callback StreamCallback) error {
	var parts []*genai.Part

	// Add images if present (multimodal)
	for _, img := range req.Images {
		parts = append(parts, genai.NewPartFromBytes(img.Data, img.MediaType))
	}

	// Add text prompt
	parts = append(parts, genai.NewPartFromText(req.UserPrompt))

	config := &genai.GenerateContentConfig{
		MaxOutputTokens: int32(req.MaxTokens),
		Temperature:     genai.Ptr(float32(req.Temperature)),
	}

	if req.SystemPrompt != "" {
		config.SystemInstruction = &genai.Content{
			Parts: []*genai.Part{genai.NewPartFromText(req.SystemPrompt)},
		}
	}

	// Convert ToolDefinition slice to genai.Tool
	if len(tools) > 0 {
		var funcDecls []*genai.FunctionDeclaration
		for _, td := range tools {
			funcDecls = append(funcDecls, &genai.FunctionDeclaration{
				Name:                td.Name,
				Description:         td.Description,
				ParametersJsonSchema: td.Parameters,
			})
		}
		config.Tools = []*genai.Tool{
			{FunctionDeclarations: funcDecls},
		}
	}

	iter := g.client.Models.GenerateContentStream(ctx, g.model, []*genai.Content{
		genai.NewContentFromParts(parts, genai.RoleUser),
	}, config)

	for resp, err := range iter {
		if err != nil {
			return fmt.Errorf("gemini stream: %w", err)
		}

		if len(resp.Candidates) == 0 || resp.Candidates[0].Content == nil {
			continue
		}

		candidate := resp.Candidates[0]
		delta := StreamDelta{}

		for _, part := range candidate.Content.Parts {
			if part.Text != "" {
				delta.Content += part.Text
			}
			if part.FunctionCall != nil {
				fc := part.FunctionCall
				argsJSON, err := json.Marshal(fc.Args)
				if err != nil {
					argsJSON = []byte("{}")
				}
				delta.ToolCalls = append(delta.ToolCalls, ToolCall{
					ID:        fc.ID,
					Name:      fc.Name,
					Arguments: string(argsJSON),
				})
			}
		}

		delta.FinishReason = string(candidate.FinishReason)

		if err := callback(delta); err != nil {
			return fmt.Errorf("gemini stream callback: %w", err)
		}
	}

	return nil
}
