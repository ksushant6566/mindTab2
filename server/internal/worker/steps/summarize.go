package steps

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/ksushant6566/mindtab/server/internal/providers"
	"github.com/ksushant6566/mindtab/server/internal/providers/llm"
	"github.com/ksushant6566/mindtab/server/internal/worker"
)

type SummarizeResult struct {
	Title     string   `json:"title"`
	Summary   string   `json:"summary"`
	Tags      []string `json:"tags"`
	KeyTopics []string `json:"key_topics"`
	Provider  string   `json:"provider"`
}

const summarizeSystemPrompt = `You summarize content. Return a JSON object with exactly four fields:
- "title": a short descriptive title (3-8 words) for the content
- "summary": a concise 2-4 sentence summary of the content
- "tags": an array of 3-8 lowercase tags describing the content
- "key_topics": an array of 2-5 key topics covered
Return ONLY valid JSON, no markdown fences.`

func Summarize(ctx context.Context, llmChain *providers.Chain[llm.LLMProvider], text string) (*worker.StepResult, error) {
	if text == "" {
		return nil, fmt.Errorf("summarize: empty input text")
	}

	if len(text) > 30000 {
		text = text[:30000]
	}

	var resp *llm.LLMResponse
	var providerName string
	err := llmChain.Execute(func(name string, provider llm.LLMProvider) error {
		var callErr error
		resp, callErr = provider.Complete(ctx, llm.LLMRequest{
			SystemPrompt: summarizeSystemPrompt,
			UserPrompt:   "Summarize the following content:\n\n" + text,
			MaxTokens:    1024,
			Temperature:  0.3,
		})
		if callErr == nil {
			providerName = name
		}
		return callErr
	})
	if err != nil {
		return nil, fmt.Errorf("summarize: %w", err)
	}

	var result SummarizeResult
	if err := json.Unmarshal([]byte(resp.Text), &result); err != nil {
		result = SummarizeResult{Summary: resp.Text}
	}
	result.Provider = providerName

	data, _ := json.Marshal(result)
	return &worker.StepResult{Data: data}, nil
}
