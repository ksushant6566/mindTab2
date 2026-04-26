package steps

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

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

const audioSummarizeSystemPrompt = `You are MindTab's audio summariser. Given the transcript of a voice note or audio recording, return a JSON object with exactly four fields:
- "title": a short (2-8 word) title that captures the gist; never a full sentence; never quoted
- "summary": one paragraph, 2-4 sentences, third person, no preamble
- "tags": an array of 2-5 short lowercase topical tags
- "key_topics": an array of 2-5 distinct themes mentioned
Return ONLY valid JSON, no markdown fences.`

func Summarize(ctx context.Context, llmChain *providers.Chain[llm.LLMProvider], text string) (*worker.StepResult, error) {
	if text == "" {
		return nil, fmt.Errorf("summarize: empty input text")
	}
	return runSummarizeWithPrompt(ctx, llmChain, summarizeSystemPrompt, "Summarize the following content:\n\n"+text)
}

// SummarizeForAudio runs the LLM chain on a transcript with an audio-specific
// prompt that explicitly requests a short title (audio has no natural title source).
func SummarizeForAudio(ctx context.Context, llmChain *providers.Chain[llm.LLMProvider], transcript string) (*worker.StepResult, error) {
	if transcript == "" {
		return nil, fmt.Errorf("summarize: empty input text")
	}
	return runSummarizeWithPrompt(ctx, llmChain, audioSummarizeSystemPrompt, "Summarize the following audio transcript:\n\n"+transcript)
}

// runSummarizeWithPrompt is the shared implementation: it calls the LLM chain,
// strips any markdown fences, parses the JSON response, and returns a StepResult.
func runSummarizeWithPrompt(ctx context.Context, llmChain *providers.Chain[llm.LLMProvider], systemPrompt, userPrompt string) (*worker.StepResult, error) {

	// Trim the user prompt to at most 30 000 chars (rough token guard).
	if len(userPrompt) > 30000 {
		userPrompt = userPrompt[:30000]
	}

	var resp *llm.LLMResponse
	var providerName string
	err := llmChain.Execute(func(name string, provider llm.LLMProvider) error {
		var callErr error
		resp, callErr = provider.Complete(ctx, llm.LLMRequest{
			SystemPrompt: systemPrompt,
			UserPrompt:   userPrompt,
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

	// Strip markdown code fences if the LLM wrapped the JSON in them.
	cleaned := strings.TrimSpace(resp.Text)
	if strings.HasPrefix(cleaned, "```") {
		// Remove opening fence (e.g. ```json)
		if idx := strings.Index(cleaned, "\n"); idx != -1 {
			cleaned = cleaned[idx+1:]
		}
		// Remove closing fence
		if idx := strings.LastIndex(cleaned, "```"); idx != -1 {
			cleaned = cleaned[:idx]
		}
		cleaned = strings.TrimSpace(cleaned)
	}

	var result SummarizeResult
	if err := json.Unmarshal([]byte(cleaned), &result); err != nil {
		result = SummarizeResult{Summary: cleaned}
	}
	result.Provider = providerName

	data, _ := json.Marshal(result)
	return &worker.StepResult{Data: data}, nil
}
