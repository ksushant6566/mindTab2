package steps

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/ksushant6566/mindtab/server/internal/providers"
	"github.com/ksushant6566/mindtab/server/internal/providers/embedding"
	"github.com/ksushant6566/mindtab/server/internal/worker"
)

type EmbedResult struct {
	Embedding []float32 `json:"embedding"`
	Provider  string    `json:"provider"`
	Model     string    `json:"model"`
}

func Embed(ctx context.Context, embeddingChain *providers.Chain[embedding.EmbeddingProvider], text string) (*worker.StepResult, error) {
	if text == "" {
		return nil, fmt.Errorf("embed: empty input text")
	}

	if len(text) > 8000 {
		text = text[:8000]
	}

	var embeddings [][]float32
	var providerName string
	var modelName string
	err := embeddingChain.Execute(func(name string, provider embedding.EmbeddingProvider) error {
		var callErr error
		embeddings, callErr = provider.Embed(ctx, []string{text})
		if callErr == nil {
			providerName = name
			if np, ok := provider.(interface{ ModelName() string }); ok {
				modelName = np.ModelName()
			}
		}
		return callErr
	})
	if err != nil {
		return nil, fmt.Errorf("embed: %w", err)
	}

	if len(embeddings) == 0 || len(embeddings[0]) == 0 {
		return nil, fmt.Errorf("embed: empty embedding returned")
	}

	result := EmbedResult{
		Embedding: embeddings[0],
		Provider:  providerName,
		Model:     modelName,
	}
	data, _ := json.Marshal(result)
	return &worker.StepResult{Data: data}, nil
}
