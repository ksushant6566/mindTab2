package providers

import (
	"fmt"
	"log/slog"

	"github.com/ksushant6566/mindtab/server/internal/providers/embedding"
	"github.com/ksushant6566/mindtab/server/internal/providers/llm"
)

// Registry holds all initialized provider chains.
type Registry struct {
	LLM       *Chain[llm.LLMProvider]
	Embedding *Chain[embedding.EmbeddingProvider]
}

// RegistryConfig contains the configuration needed to build provider chains.
type RegistryConfig struct {
	GeminiAPIKey         string
	GeminiModel          string
	OpenAIAPIKey         string
	OpenAIEmbeddingModel string
	EmbeddingDimensions  int
}

// NewRegistry creates a new provider registry with all chains initialized.
// Returns an error if any required chain has zero providers.
func NewRegistry(cfg RegistryConfig, logger *slog.Logger) (*Registry, error) {
	r := &Registry{
		LLM:       NewChain[llm.LLMProvider](logger),
		Embedding: NewChain[embedding.EmbeddingProvider](logger),
	}

	// LLM chain — Gemini Flash
	if cfg.GeminiAPIKey != "" {
		gemini, err := llm.NewGeminiProvider(cfg.GeminiAPIKey, cfg.GeminiModel)
		if err != nil {
			logger.Warn("failed to initialize Gemini provider", "error", err)
		} else {
			r.LLM.Add("gemini-flash", gemini)
		}
	}

	// Embedding chain — OpenAI
	if cfg.OpenAIAPIKey != "" {
		openaiEmbed := embedding.NewOpenAIProvider(
			cfg.OpenAIAPIKey,
			cfg.OpenAIEmbeddingModel,
			cfg.EmbeddingDimensions,
		)
		r.Embedding.Add("openai-embed", openaiEmbed)
	}

	// Validate required chains
	if r.LLM.Len() == 0 {
		return nil, fmt.Errorf("LLM provider chain has zero providers (set GEMINI_API_KEY)")
	}
	if r.Embedding.Len() == 0 {
		return nil, fmt.Errorf("embedding provider chain has zero providers (set OPENAI_API_KEY)")
	}

	return r, nil
}
