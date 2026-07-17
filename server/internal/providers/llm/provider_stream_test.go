package llm

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestOpenAICompatibleProviderStreamsTextAndCompleteToolCall(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if got := r.Header.Get("Authorization"); got != "Bearer test-key" {
			t.Errorf("Authorization = %q", got)
		}
		w.Header().Set("Content-Type", "text/event-stream")
		fmt.Fprintln(w, `data: {"choices":[{"delta":{"content":"Checking "},"finish_reason":""}]}`)
		fmt.Fprintln(w, `data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call-1","function":{"name":"list_","arguments":"{\"status\":"}}]},"finish_reason":""}]}`)
		fmt.Fprintln(w, `data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"name":"tasks","arguments":"\"open\"}"}}]},"finish_reason":"tool_calls"}]}`)
		fmt.Fprintln(w, "data: [DONE]")
	}))
	defer server.Close()

	provider := newOpenAICompatibleProvider("openai", server.URL, "test-key", "gpt-5.2", nil)
	var text string
	var toolCalls []ToolCall
	err := provider.StreamComplete(context.Background(), LLMRequest{UserPrompt: "help", MaxTokens: 100}, nil, func(delta StreamDelta) error {
		text += delta.Content
		toolCalls = append(toolCalls, delta.ToolCalls...)
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	if text != "Checking " {
		t.Fatalf("text = %q", text)
	}
	if len(toolCalls) != 1 || toolCalls[0].Name != "list_tasks" || toolCalls[0].Arguments != `{"status":"open"}` {
		t.Fatalf("tool calls = %#v", toolCalls)
	}
}

func TestAnthropicProviderStreamsTextAndCompleteToolCall(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if got := r.Header.Get("x-api-key"); got != "test-key" {
			t.Errorf("x-api-key = %q", got)
		}
		w.Header().Set("Content-Type", "text/event-stream")
		fmt.Fprintln(w, `data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Checking "}}`)
		fmt.Fprintln(w, `data: {"type":"content_block_start","index":1,"content_block":{"type":"tool_use","id":"call-1","name":"list_tasks"}}`)
		fmt.Fprintln(w, `data: {"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":"{\"status\":\"open\"}"}}`)
		fmt.Fprintln(w, `data: {"type":"message_delta","delta":{"stop_reason":"tool_use"}}`)
	}))
	defer server.Close()

	provider := NewAnthropicProvider("test-key", "claude-sonnet-4-6")
	provider.baseURL = server.URL
	var text string
	var toolCalls []ToolCall
	err := provider.StreamComplete(context.Background(), LLMRequest{UserPrompt: "help", MaxTokens: 100}, nil, func(delta StreamDelta) error {
		text += delta.Content
		toolCalls = append(toolCalls, delta.ToolCalls...)
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	if text != "Checking " {
		t.Fatalf("text = %q", text)
	}
	if len(toolCalls) != 1 || toolCalls[0].Name != "list_tasks" || toolCalls[0].Arguments != `{"status":"open"}` {
		t.Fatalf("tool calls = %#v", toolCalls)
	}
}
