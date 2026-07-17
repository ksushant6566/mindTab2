package handler

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	appai "github.com/ksushant6566/mindtab/server/internal/ai"
	"github.com/ksushant6566/mindtab/server/internal/middleware"
	"github.com/ksushant6566/mindtab/server/internal/store"
)

type AIProvidersHandler struct {
	queries              store.Querier
	cipher               *appai.CredentialCipher
	managedGeminiEnabled bool
}

func NewAIProvidersHandler(
	queries store.Querier,
	cipher *appai.CredentialCipher,
	managedGeminiEnabled bool,
) *AIProvidersHandler {
	return &AIProvidersHandler{
		queries:              queries,
		cipher:               cipher,
		managedGeminiEnabled: managedGeminiEnabled,
	}
}

type aiProviderView struct {
	ID         string        `json:"id"`
	Name       string        `json:"name"`
	Configured bool          `json:"configured"`
	Managed    bool          `json:"managed"`
	KeyHint    *string       `json:"key_hint"`
	Models     []appai.Model `json:"models"`
}

func (h *AIProvidersHandler) List(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())
	credentials, err := h.queries.ListAIProviderCredentials(r.Context(), userID)
	if err != nil {
		slog.Error("failed to list AI provider credentials", "error", err, "userID", userID)
		WriteError(w, http.StatusInternalServerError, "failed to load model providers")
		return
	}

	keyHints := make(map[string]string, len(credentials))
	for _, credential := range credentials {
		keyHints[credential.Provider] = credential.KeyHint
	}

	providers := make([]aiProviderView, 0, len(appai.Providers))
	for _, provider := range appai.Providers {
		hint, hasUserKey := keyHints[provider.ID]
		managed := provider.ID == appai.ProviderGemini && h.managedGeminiEnabled && !hasUserKey
		var keyHint *string
		if hasUserKey {
			masked := "•••• " + hint
			keyHint = &masked
		}
		providers = append(providers, aiProviderView{
			ID:         provider.ID,
			Name:       provider.Name,
			Configured: hasUserKey || managed,
			Managed:    managed,
			KeyHint:    keyHint,
			Models:     provider.Models,
		})
	}

	WriteJSON(w, http.StatusOK, map[string]any{"providers": providers})
}

type saveAIProviderRequest struct {
	APIKey string `json:"api_key"`
}

func (h *AIProvidersHandler) Save(w http.ResponseWriter, r *http.Request) {
	provider := chi.URLParam(r, "provider")
	if !appai.IsProvider(provider) {
		WriteError(w, http.StatusBadRequest, "unsupported AI provider")
		return
	}

	var request saveAIProviderRequest
	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 8*1024))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&request); err != nil {
		WriteError(w, http.StatusBadRequest, "invalid provider credential payload")
		return
	}

	apiKey := strings.TrimSpace(request.APIKey)
	if len(apiKey) < 8 || len(apiKey) > 4096 {
		WriteError(w, http.StatusBadRequest, "API key must be between 8 and 4096 characters")
		return
	}

	encrypted, nonce, err := h.cipher.Encrypt(apiKey)
	if err != nil {
		slog.Error("failed to encrypt AI provider credential", "error", err, "provider", provider)
		WriteError(w, http.StatusInternalServerError, "failed to secure API key")
		return
	}

	userID := middleware.UserIDFromContext(r.Context())
	credential, err := h.queries.UpsertAIProviderCredential(r.Context(), store.UpsertAIProviderCredentialParams{
		UserID:          userID,
		Provider:        provider,
		EncryptedApiKey: encrypted,
		Nonce:           nonce,
		KeyHint:         appai.KeyHint(apiKey),
	})
	if err != nil {
		slog.Error("failed to save AI provider credential", "error", err, "provider", provider, "userID", userID)
		WriteError(w, http.StatusInternalServerError, "failed to save API key")
		return
	}

	WriteJSON(w, http.StatusOK, map[string]any{
		"provider":   credential.Provider,
		"configured": true,
		"key_hint":   "•••• " + credential.KeyHint,
	})
}

func (h *AIProvidersHandler) Delete(w http.ResponseWriter, r *http.Request) {
	provider := chi.URLParam(r, "provider")
	if !appai.IsProvider(provider) {
		WriteError(w, http.StatusBadRequest, "unsupported AI provider")
		return
	}

	userID := middleware.UserIDFromContext(r.Context())
	if err := h.queries.DeleteAIProviderCredential(r.Context(), store.DeleteAIProviderCredentialParams{
		UserID: userID, Provider: provider,
	}); err != nil {
		slog.Error("failed to delete AI provider credential", "error", err, "provider", provider, "userID", userID)
		WriteError(w, http.StatusInternalServerError, "failed to remove API key")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
