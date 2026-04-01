package providers

import (
	"log/slog"
	"strings"
	"testing"
)

func TestRegistry_MissingGeminiKey(t *testing.T) {
	cfg := RegistryConfig{
		GeminiAPIKey:         "",
		GeminiModel:          "",
		OpenAIAPIKey:         "sk-test-openai-key",
		OpenAIEmbeddingModel: "text-embedding-3-small",
		EmbeddingDimensions:  1536,
	}

	_, err := NewRegistry(cfg, slog.Default())

	if err == nil {
		t.Fatal("expected error when GeminiAPIKey is empty, got nil")
	}
	if !strings.Contains(err.Error(), "LLM provider chain has zero providers") {
		t.Fatalf("expected LLM chain error, got: %v", err)
	}
}

func TestRegistry_MissingOpenAIKey(t *testing.T) {
	cfg := RegistryConfig{
		GeminiAPIKey:         "test-gemini-api-key",
		GeminiModel:          "gemini-1.5-flash",
		OpenAIAPIKey:         "",
		OpenAIEmbeddingModel: "",
		EmbeddingDimensions:  0,
	}

	_, err := NewRegistry(cfg, slog.Default())

	if err == nil {
		t.Fatal("expected error when OpenAIAPIKey is empty, got nil")
	}
	if !strings.Contains(err.Error(), "embedding provider chain has zero providers") {
		t.Fatalf("expected embedding chain error, got: %v", err)
	}
}
