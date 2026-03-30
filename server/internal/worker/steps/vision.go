package steps

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"strings"

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

// BatchVisionResult holds the combined visual description from multiple frames.
type BatchVisionResult struct {
	VisualDescription string `json:"visual_description"`
	FrameCount        int    `json:"frame_count"`
}

const batchSize = 20

const batchVisionSystemPrompt = `You analyze a batch of video frames in sequence. Return a concise description of what is shown across all frames, focusing on key visual content, scenes, and any important text or objects visible.`

// BatchVision generates a combined visual description from a set of video frame images.
// Frames are processed in batches of 20. If no frames are provided, an empty result is returned.
func BatchVision(ctx context.Context, llmChain *providers.Chain[llm.LLMProvider], framePaths []string) (*worker.StepResult, error) {
	if len(framePaths) == 0 {
		result := BatchVisionResult{}
		data, _ := json.Marshal(result)
		return &worker.StepResult{Data: data}, nil
	}

	var descriptions []string

	for i := 0; i < len(framePaths); i += batchSize {
		end := i + batchSize
		if end > len(framePaths) {
			end = len(framePaths)
		}
		batch := framePaths[i:end]

		// Read frame files and build image inputs.
		images := make([]llm.ImageInput, 0, len(batch))
		for _, path := range batch {
			data, err := os.ReadFile(path)
			if err != nil {
				return nil, fmt.Errorf("batch_vision: read frame %s: %w", path, err)
			}
			images = append(images, llm.ImageInput{
				Data:      data,
				MediaType: "image/jpeg",
			})
		}

		var resp *llm.LLMResponse
		err := llmChain.Execute(func(_ string, provider llm.LLMProvider) error {
			var callErr error
			resp, callErr = provider.Complete(ctx, llm.LLMRequest{
				SystemPrompt: batchVisionSystemPrompt,
				UserPrompt:   fmt.Sprintf("Describe the content shown across these %d video frames.", len(batch)),
				Images:       images,
				MaxTokens:    1024,
				Temperature:  0.1,
			})
			return callErr
		})
		if err != nil {
			return nil, fmt.Errorf("batch_vision: batch %d-%d: %w", i, end-1, err)
		}

		descriptions = append(descriptions, strings.TrimSpace(resp.Text))
	}

	result := BatchVisionResult{
		VisualDescription: strings.Join(descriptions, "\n\n"),
		FrameCount:        len(framePaths),
	}
	data, _ := json.Marshal(result)
	return &worker.StepResult{Data: data}, nil
}
