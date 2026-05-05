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

const videoSummarizeSystemPrompt = `You are MindTab's short-video summariser. Use both the transcript/audio and the visual observations across sampled frames to infer what the video is actually about.
Return a JSON object with exactly four fields:
- "title": a short descriptive title (3-8 words) for the whole video
- "summary": a concise 2-4 sentence summary of the video's meaning, action, joke, claim, or subject; do not merely describe one still frame unless that is all the evidence supports
- "tags": an array of 3-8 lowercase tags describing the video
- "key_topics": an array of 2-5 key topics covered
If the transcript appears noisy, untranslated, or uncertain, say so briefly in the summary rather than inventing meaning.
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

func SummarizeVideoEvidence(ctx context.Context, llmChain *providers.Chain[llm.LLMProvider], evidence VideoEvidence) (*worker.StepResult, error) {
	if !HasUsableVideoEvidence(evidence) {
		return nil, fmt.Errorf("summarize: empty video evidence")
	}
	return runSummarizeWithPrompt(ctx, llmChain, videoSummarizeSystemPrompt, formatVideoEvidencePrompt(evidence))
}

// SummarizeForVideo is kept as a compatibility wrapper for older tests/callers.
// New video processors should summarize from structured VideoEvidence.
func SummarizeForVideo(ctx context.Context, llmChain *providers.Chain[llm.LLMProvider], transcript string, visualDescription string) (*worker.StepResult, error) {
	return SummarizeVideoEvidence(ctx, llmChain, VideoEvidence{
		Transcript:     strings.TrimSpace(transcript),
		VisualTimeline: strings.TrimSpace(visualDescription),
		SelectedFrames: SelectedFramesSummary{},
		EvidenceStatus: nil,
	})
}

func formatVideoEvidencePrompt(evidence VideoEvidence) string {
	var b strings.Builder
	b.WriteString("Summarize this video using all available evidence. Prefer concrete evidence over guesses.\n\n")
	writeEvidenceSection(&b, "Source type", evidence.Metadata.SourceType)
	writeEvidenceSection(&b, "Title", evidence.Metadata.Title)
	writeEvidenceSection(&b, "Creator/channel", evidence.Metadata.Creator)
	writeEvidenceSection(&b, "Source caption/description", evidence.Metadata.Description)
	if evidence.Metadata.DurationSeconds > 0 {
		writeEvidenceSection(&b, "Duration", fmt.Sprintf("%d seconds", evidence.Metadata.DurationSeconds))
	}
	writeEvidenceSection(&b, "Transcript/audio", evidence.Transcript)
	writeEvidenceSection(&b, "Transcript source", evidence.TranscriptSource)
	writeEvidenceSection(&b, "OCR text from frames", evidence.OCRText)
	writeEvidenceSection(&b, "Visual timeline from sampled frames", evidence.VisualTimeline)
	if len(evidence.FrameObservations) > 0 {
		var observations strings.Builder
		for _, obs := range evidence.FrameObservations {
			if strings.TrimSpace(obs.Observation) == "" {
				continue
			}
			observations.WriteString(fmt.Sprintf("- frame %d", obs.FrameIndex+1))
			if obs.TimestampSeconds > 0 {
				observations.WriteString(fmt.Sprintf(" at %.1fs", obs.TimestampSeconds))
			}
			observations.WriteString(": ")
			observations.WriteString(obs.Observation)
			if strings.TrimSpace(obs.OCRText) != "" {
				observations.WriteString(" OCR: ")
				observations.WriteString(obs.OCRText)
			}
			observations.WriteString("\n")
		}
		writeEvidenceSection(&b, "Per-frame observations", observations.String())
	}
	if len(evidence.UncertaintyNotes) > 0 {
		writeEvidenceSection(&b, "Uncertainty notes", strings.Join(evidence.UncertaintyNotes, "\n"))
	}
	if len(evidence.EvidenceStatus) > 0 {
		statuses, _ := json.Marshal(evidence.EvidenceStatus)
		writeEvidenceSection(&b, "Evidence status", string(statuses))
	}
	return b.String()
}

func writeEvidenceSection(b *strings.Builder, label, value string) {
	value = strings.TrimSpace(value)
	if value == "" {
		value = "unavailable"
	}
	b.WriteString(label)
	b.WriteString(":\n")
	b.WriteString(value)
	b.WriteString("\n\n")
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
