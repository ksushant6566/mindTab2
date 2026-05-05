package steps

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/ksushant6566/mindtab/server/internal/providers"
	"github.com/ksushant6566/mindtab/server/internal/providers/llm"
	"github.com/ksushant6566/mindtab/server/internal/services"
	"github.com/ksushant6566/mindtab/server/internal/store"
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

// Vision fetches the image from storage by media_key and calls the LLM for visual analysis.
func Vision(
	ctx context.Context,
	llmChain *providers.Chain[llm.LLMProvider],
	storage services.StorageProvider,
	queries store.Querier,
	job *worker.Job,
) (*worker.StepResult, error) {
	row, err := queries.GetContentByID(ctx, store.GetContentByIDParams{
		ID:     pgtype.UUID{Bytes: job.ContentID, Valid: true},
		UserID: job.UserID,
	})
	if err != nil {
		return nil, fmt.Errorf("vision: fetch content row: %w", err)
	}
	if !row.MediaKey.Valid || row.MediaKey.String == "" {
		return nil, fmt.Errorf("vision: row %s has no media_key", job.ContentID)
	}

	rc, err := storage.Get(ctx, row.MediaKey.String)
	if err != nil {
		return nil, fmt.Errorf("vision: fetch image from storage: %w", err)
	}
	defer rc.Close()

	imageBytes, err := io.ReadAll(rc)
	if err != nil {
		return nil, fmt.Errorf("vision: read image bytes: %w", err)
	}

	mime := extToMime(filepath.Ext(row.MediaKey.String))

	var resp *llm.LLMResponse
	err = llmChain.Execute(func(name string, provider llm.LLMProvider) error {
		var callErr error
		resp, callErr = provider.Complete(ctx, llm.LLMRequest{
			SystemPrompt: visionSystemPrompt,
			UserPrompt:   "Analyze this image.",
			Images: []llm.ImageInput{{
				Data:      imageBytes,
				MediaType: mime,
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

// extToMime returns the MIME type for common image file extensions.
func extToMime(ext string) string {
	switch strings.ToLower(ext) {
	case ".jpg", ".jpeg":
		return "image/jpeg"
	case ".png":
		return "image/png"
	case ".gif":
		return "image/gif"
	case ".webp":
		return "image/webp"
	default:
		return "image/jpeg"
	}
}

// BatchVisionResult holds the combined visual description from multiple frames.
type BatchVisionResult struct {
	VisualDescription string `json:"visual_description"`
	FrameCount        int    `json:"frame_count"`
}

const batchSize = 20

const batchVisionSystemPrompt = `You analyze a batch of video frames in sequence. Return a concise description of what is shown across all frames, focusing on key visual content, scenes, and any important text or objects visible.`

const frameUnderstandingSystemPrompt = `You analyze sampled video frames in chronological order. Return ONLY valid JSON with exactly these fields:
- "ocr_text": all important readable text seen across frames, deduplicated; empty string if none
- "visual_timeline": a concise timeline of what changes or happens across the sampled frames
- "frame_observations": an array of objects with "frame_index", "timestamp_seconds", "observation", and optional "ocr_text"
- "uncertainty_notes": an array of short notes for anything unclear, missing, noisy, or inferred
Focus on what the video is about, not a single still frame.`

type LLMFrameUnderstandingProvider struct {
	llmChain *providers.Chain[llm.LLMProvider]
}

func NewLLMFrameUnderstandingProvider(llmChain *providers.Chain[llm.LLMProvider]) *LLMFrameUnderstandingProvider {
	return &LLMFrameUnderstandingProvider{llmChain: llmChain}
}

func (p *LLMFrameUnderstandingProvider) UnderstandFrames(ctx context.Context, frames SelectedFrames) (FrameUnderstanding, error) {
	if p == nil || p.llmChain == nil {
		return FrameUnderstanding{}, fmt.Errorf("llm frame understanding provider is not configured")
	}
	if len(frames.FramePaths) == 0 {
		return FrameUnderstanding{
			Status: skippedStatus("frame_understanding", "no_frames", "no selected frames to analyze"),
		}, nil
	}

	images := make([]llm.ImageInput, 0, len(frames.FramePaths))
	for _, path := range frames.FramePaths {
		data, err := os.ReadFile(path)
		if err != nil {
			return FrameUnderstanding{}, fmt.Errorf("read frame %s: %w", path, err)
		}
		images = append(images, llm.ImageInput{
			Data:      data,
			MediaType: extToMime(filepath.Ext(path)),
		})
	}

	var resp *llm.LLMResponse
	err := p.llmChain.Execute(func(_ string, provider llm.LLMProvider) error {
		var callErr error
		resp, callErr = provider.Complete(ctx, llm.LLMRequest{
			SystemPrompt: frameUnderstandingSystemPrompt,
			UserPrompt:   frameUnderstandingPrompt(frames),
			Images:       images,
			MaxTokens:    1600,
			Temperature:  0.1,
		})
		return callErr
	})
	if err != nil {
		return FrameUnderstanding{}, err
	}

	var result FrameUnderstanding
	cleaned := stripMarkdownFences(resp.Text)
	if err := json.Unmarshal([]byte(cleaned), &result); err != nil {
		result = FrameUnderstanding{
			VisualTimeline: strings.TrimSpace(resp.Text),
			UncertaintyNotes: []string{
				"frame understanding response was not structured JSON",
			},
		}
	}
	result.FrameCount = frames.FrameCount
	if result.Status.Status == "" {
		result.Status = successStatus("frame_understanding")
	}
	return result, nil
}

func stripMarkdownFences(text string) string {
	cleaned := strings.TrimSpace(text)
	if strings.HasPrefix(cleaned, "```") {
		if idx := strings.Index(cleaned, "\n"); idx != -1 {
			cleaned = cleaned[idx+1:]
		}
		if idx := strings.LastIndex(cleaned, "```"); idx != -1 {
			cleaned = cleaned[:idx]
		}
		cleaned = strings.TrimSpace(cleaned)
	}
	return cleaned
}

func frameUnderstandingPrompt(frames SelectedFrames) string {
	var b strings.Builder
	b.WriteString("Analyze these sampled video frames as a chronological sequence.\n")
	b.WriteString(fmt.Sprintf("Frame count: %d\n", frames.FrameCount))
	if frames.DurationSeconds > 0 {
		b.WriteString(fmt.Sprintf("Video duration: %d seconds\n", frames.DurationSeconds))
	}
	if len(frames.Frames) > 0 {
		b.WriteString("Frame timestamps:\n")
		for _, frame := range frames.Frames {
			b.WriteString(fmt.Sprintf("- frame_index=%d timestamp_seconds=%.1f\n", frame.Index, frame.TimestampSeconds))
		}
	}
	return b.String()
}

// BatchVision generates a combined visual description from a set of video frame images.
// Frames are processed in batches of 20. If no frames are provided, an empty result is returned.
//
// Deprecated: video processors should depend on FrameUnderstandingProvider via
// UnderstandVideoFrames so OCR and visual understanding remain replaceable.
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
