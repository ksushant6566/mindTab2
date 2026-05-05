package steps

import (
	"context"
	"encoding/json"
	"log/slog"
	"strings"
	"testing"

	"github.com/ksushant6566/mindtab/server/internal/providers"
	"github.com/ksushant6566/mindtab/server/internal/providers/llm"
	"github.com/ksushant6566/mindtab/server/internal/testutil"
)

func makeLLMChain(mock *testutil.MockLLMProvider) *providers.Chain[llm.LLMProvider] {
	chain := providers.NewChain[llm.LLMProvider](slog.Default())
	chain.Add("mock", mock)
	return chain
}

func TestSummarize_ValidJSON(t *testing.T) {
	payload := `{"title":"Go Testing Guide","summary":"A concise guide to writing tests in Go.","tags":["go","testing","unit-tests"],"key_topics":["table-driven tests","mocks","benchmarks"]}`

	mock := &testutil.MockLLMProvider{Response: payload}
	chain := makeLLMChain(mock)

	result, err := Summarize(context.Background(), chain, "This is article text about Go testing.")
	if err != nil {
		t.Fatalf("Summarize: unexpected error: %v", err)
	}
	if result == nil {
		t.Fatal("Summarize: expected non-nil result")
	}

	var sr SummarizeResult
	if err := json.Unmarshal(result.Data, &sr); err != nil {
		t.Fatalf("unmarshal SummarizeResult: %v", err)
	}

	if sr.Title != "Go Testing Guide" {
		t.Errorf("title: got %q, want %q", sr.Title, "Go Testing Guide")
	}
	if sr.Summary != "A concise guide to writing tests in Go." {
		t.Errorf("summary: got %q, want %q", sr.Summary, "A concise guide to writing tests in Go.")
	}
	if len(sr.Tags) != 3 {
		t.Errorf("tags: got %d, want 3", len(sr.Tags))
	}
	if len(sr.KeyTopics) != 3 {
		t.Errorf("key_topics: got %d, want 3", len(sr.KeyTopics))
	}
	if sr.Provider != "mock" {
		t.Errorf("provider: got %q, want %q", sr.Provider, "mock")
	}
}

func TestSummarize_ValidJSONWithMarkdownFences(t *testing.T) {
	payload := "```json\n{\"title\":\"Fenced Title\",\"summary\":\"Summary text.\",\"tags\":[\"a\"],\"key_topics\":[\"b\"]}\n```"

	mock := &testutil.MockLLMProvider{Response: payload}
	chain := makeLLMChain(mock)

	result, err := Summarize(context.Background(), chain, "Article text here.")
	if err != nil {
		t.Fatalf("Summarize: unexpected error: %v", err)
	}

	var sr SummarizeResult
	if err := json.Unmarshal(result.Data, &sr); err != nil {
		t.Fatalf("unmarshal SummarizeResult: %v", err)
	}
	if sr.Title != "Fenced Title" {
		t.Errorf("title after fence strip: got %q, want %q", sr.Title, "Fenced Title")
	}
}

func TestSummarize_MalformedJSON(t *testing.T) {
	// Non-JSON response — summarize stores the raw text in Summary field.
	mock := &testutil.MockLLMProvider{Response: "This is not JSON at all."}
	chain := makeLLMChain(mock)

	result, err := Summarize(context.Background(), chain, "Article text here.")
	// Summarize does NOT return an error for malformed JSON — it falls back to
	// storing the raw text in the Summary field.
	if err != nil {
		t.Fatalf("Summarize: unexpected error: %v", err)
	}
	if result == nil {
		t.Fatal("Summarize: expected non-nil result")
	}

	var sr SummarizeResult
	if err := json.Unmarshal(result.Data, &sr); err != nil {
		t.Fatalf("unmarshal SummarizeResult: %v", err)
	}
	if sr.Summary != "This is not JSON at all." {
		t.Errorf("fallback summary: got %q, want raw LLM text", sr.Summary)
	}
}

func TestSummarize_EmptyText(t *testing.T) {
	mock := &testutil.MockLLMProvider{Response: "{}"}
	chain := makeLLMChain(mock)

	_, err := Summarize(context.Background(), chain, "")
	if err == nil {
		t.Fatal("Summarize: expected error for empty input text")
	}
}

func TestSummarize_PromptConstruction(t *testing.T) {
	payload := `{"title":"T","summary":"S","tags":["x"],"key_topics":["y"]}`
	mock := &testutil.MockLLMProvider{Response: payload}
	chain := makeLLMChain(mock)

	inputText := "The article content to summarize."
	_, err := Summarize(context.Background(), chain, inputText)
	if err != nil {
		t.Fatalf("Summarize: unexpected error: %v", err)
	}

	if len(mock.Calls) == 0 {
		t.Fatal("LLM was never called")
	}
	req := mock.Calls[0]

	if req.SystemPrompt != summarizeSystemPrompt {
		t.Errorf("system prompt mismatch: got %q", req.SystemPrompt)
	}
	if !strings.Contains(req.UserPrompt, inputText) {
		t.Errorf("user prompt does not contain input text: %q", req.UserPrompt)
	}
	if req.MaxTokens != 1024 {
		t.Errorf("max tokens: got %d, want 1024", req.MaxTokens)
	}
	if req.Temperature != 0.3 {
		t.Errorf("temperature: got %f, want 0.3", req.Temperature)
	}
}

func TestSummarizeVideoEvidence_PromptConstruction(t *testing.T) {
	payload := `{"title":"T","summary":"S","tags":["x"],"key_topics":["y"]}`
	mock := &testutil.MockLLMProvider{Response: payload}
	chain := makeLLMChain(mock)

	evidence := VideoEvidence{
		Metadata: ResolvedVideo{
			SourceType:  "instagram_reel",
			Title:       "Dance clip",
			Description: "caption text",
			Creator:     "creator",
		},
		Transcript:       "spoken words",
		TranscriptSource: "whisper",
		OCRText:          "overlay text",
		VisualTimeline:   "three sampled frames show a dance",
		FrameObservations: []FrameObservation{{
			FrameIndex:       0,
			TimestampSeconds: 0,
			Observation:      "a person starts dancing",
		}},
	}
	_, err := SummarizeVideoEvidence(context.Background(), chain, evidence)
	if err != nil {
		t.Fatalf("SummarizeVideoEvidence: unexpected error: %v", err)
	}

	if len(mock.Calls) == 0 {
		t.Fatal("LLM was never called")
	}
	req := mock.Calls[0]
	if req.SystemPrompt != videoSummarizeSystemPrompt {
		t.Errorf("system prompt mismatch: got %q", req.SystemPrompt)
	}
	if !strings.Contains(req.UserPrompt, "Transcript/audio:") || !strings.Contains(req.UserPrompt, "spoken words") {
		t.Errorf("video prompt missing transcript: %q", req.UserPrompt)
	}
	if !strings.Contains(req.UserPrompt, "Visual timeline from sampled frames:") || !strings.Contains(req.UserPrompt, "three sampled frames show a dance") {
		t.Errorf("video prompt missing visual observations: %q", req.UserPrompt)
	}
	if !strings.Contains(req.UserPrompt, "Source caption/description:") || !strings.Contains(req.UserPrompt, "caption text") {
		t.Errorf("video prompt missing source description: %q", req.UserPrompt)
	}
	if !strings.Contains(req.UserPrompt, "OCR text from frames:") || !strings.Contains(req.UserPrompt, "overlay text") {
		t.Errorf("video prompt missing OCR text: %q", req.UserPrompt)
	}
	if !strings.Contains(req.UserPrompt, "- frame 1 at 0.0s: a person starts dancing") {
		t.Errorf("video prompt missing zero timestamp observation: %q", req.UserPrompt)
	}
}

func TestSummarizeForVideo_EmptyInput(t *testing.T) {
	mock := &testutil.MockLLMProvider{Response: "{}"}
	chain := makeLLMChain(mock)

	_, err := SummarizeForVideo(context.Background(), chain, "", "")
	if err == nil {
		t.Fatal("SummarizeForVideo: expected error for empty input")
	}
}

func TestSummarize_LLMError(t *testing.T) {
	// A non-retriable error from the LLM should propagate.
	mock := &testutil.MockLLMProvider{Err: providers.NewPermanentError("mock", errTest("llm permanent error"))}
	chain := makeLLMChain(mock)

	_, err := Summarize(context.Background(), chain, "Some text.")
	if err == nil {
		t.Fatal("Summarize: expected error when LLM fails")
	}
}
