package ai

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/ksushant6566/mindtab/server/internal/providers/llm"
	"github.com/ksushant6566/mindtab/server/internal/store"
)

var ErrProviderNotConfigured = errors.New("AI provider is not configured")

type credentialReader interface {
	GetAIProviderCredential(context.Context, store.GetAIProviderCredentialParams) (store.UserAiProviderCredential, error)
}

type ProviderResolver struct {
	queries             credentialReader
	cipher              *CredentialCipher
	managedGeminiAPIKey string
	managedGeminiModel  string
}

func NewProviderResolver(
	queries credentialReader,
	cipher *CredentialCipher,
	managedGeminiAPIKey string,
	managedGeminiModel string,
) *ProviderResolver {
	return &ProviderResolver{
		queries: queries, cipher: cipher,
		managedGeminiAPIKey: managedGeminiAPIKey,
		managedGeminiModel:  managedGeminiModel,
	}
}

func (r *ProviderResolver) Resolve(
	ctx context.Context,
	userID string,
	provider string,
	model string,
) (llm.LLMProvider, error) {
	if !IsModel(provider, model) {
		return nil, fmt.Errorf("unsupported model %q for provider %q", model, provider)
	}

	credential, err := r.queries.GetAIProviderCredential(ctx, store.GetAIProviderCredentialParams{
		UserID: userID, Provider: provider,
	})
	var apiKey string
	if err == nil {
		apiKey, err = r.cipher.Decrypt(credential.EncryptedApiKey, credential.Nonce)
		if err != nil {
			return nil, err
		}
	} else if errors.Is(err, pgx.ErrNoRows) && provider == ProviderGemini && r.managedGeminiAPIKey != "" {
		apiKey = r.managedGeminiAPIKey
	} else if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrProviderNotConfigured
	} else {
		return nil, fmt.Errorf("load provider credential: %w", err)
	}

	switch provider {
	case ProviderOpenAI:
		return llm.NewOpenAIProvider(apiKey, model), nil
	case ProviderAnthropic:
		return llm.NewAnthropicProvider(apiKey, model), nil
	case ProviderGemini:
		resolvedModel := model
		if resolvedModel == "" {
			resolvedModel = r.managedGeminiModel
		}
		return llm.NewGeminiProvider(apiKey, resolvedModel)
	case ProviderOpenRouter:
		return llm.NewOpenRouterProvider(apiKey, model), nil
	default:
		return nil, fmt.Errorf("unsupported AI provider %q", provider)
	}
}
