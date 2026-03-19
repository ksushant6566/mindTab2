package steps

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/ksushant6566/mindtab/server/internal/providers"
	"github.com/ksushant6566/mindtab/server/internal/providers/llm"
	"github.com/ksushant6566/mindtab/server/internal/worker"
)

type VisionResult struct {
	ExtractedText     string `json:"extracted_text"`
	VisualDescription string `json:"visual_description"`
}

const visionSystemPrompt = `You analyze images. Return a JSON object with exactly two fields:
- "extracted_text": any visible text in the image (OCR). Empty string if no text.
- "visual_description": a detailed description of the image content.
Return ONLY valid JSON, no markdown fences.`

func Vision(ctx context.Context, llmChain *providers.Chain[llm.LLMProvider], job *worker.Job) (*worker.StepResult, error) {
	if len(job.ImageData) == 0 {
		return nil, fmt.Errorf("vision: no image data")
	}

	var resp *llm.LLMResponse
	err := llmChain.Execute(func(name string, provider llm.LLMProvider) error {
		var callErr error
		resp, callErr = provider.Complete(ctx, llm.LLMRequest{
			SystemPrompt: visionSystemPrompt,
			UserPrompt:   "Analyze this image.",
			Images: []llm.ImageInput{{
				Data:      job.ImageData,
				MediaType: job.ImageType,
			}},
			MaxTokens:   1024,
			Temperature: 0.1,
		})
		return callErr
	})
	if err != nil {
		return nil, fmt.Errorf("vision: %w", err)
	}

	var result VisionResult
	if err := json.Unmarshal([]byte(resp.Text), &result); err != nil {
		result = VisionResult{VisualDescription: resp.Text}
	}

	data, _ := json.Marshal(result)
	return &worker.StepResult{Data: data}, nil
}
