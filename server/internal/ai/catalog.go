package ai

import "strings"

const (
	ProviderOpenAI     = "openai"
	ProviderAnthropic  = "anthropic"
	ProviderGemini     = "gemini"
	ProviderOpenRouter = "openrouter"
)

type Model struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Description string `json:"description"`
}

type Provider struct {
	ID     string  `json:"id"`
	Name   string  `json:"name"`
	Models []Model `json:"models"`
}

var Providers = []Provider{
	{
		ID: ProviderOpenAI, Name: "OpenAI",
		Models: []Model{
			{ID: "gpt-5.2", Name: "GPT-5.2", Description: "Best quality for complex workspace reasoning"},
			{ID: "gpt-5.1", Name: "GPT-5.1", Description: "Strong general-purpose model"},
			{ID: "gpt-5-mini", Name: "GPT-5 mini", Description: "Fast, efficient everyday model"},
		},
	},
	{
		ID: ProviderAnthropic, Name: "Anthropic",
		Models: []Model{
			{ID: "claude-sonnet-4-6", Name: "Claude Sonnet 4.6", Description: "Balanced reasoning, speed, and tool use"},
			{ID: "claude-opus-4-6", Name: "Claude Opus 4.6", Description: "Deep reasoning for demanding work"},
			{ID: "claude-haiku-4-5", Name: "Claude Haiku 4.5", Description: "Fast, concise responses"},
		},
	},
	{
		ID: ProviderGemini, Name: "Google Gemini",
		Models: []Model{
			{ID: "gemini-3.1-pro-preview", Name: "Gemini 3.1 Pro", Description: "Advanced reasoning and long-context work"},
			{ID: "gemini-3-flash-preview", Name: "Gemini 3 Flash", Description: "Fast multimodal workspace assistance"},
			{ID: "gemini-2.5-flash", Name: "Gemini 2.5 Flash", Description: "Reliable, efficient everyday model"},
		},
	},
	{
		ID: ProviderOpenRouter, Name: "OpenRouter",
		Models: []Model{
			{ID: "anthropic/claude-sonnet-4.6", Name: "Claude Sonnet 4.6", Description: "Claude through OpenRouter"},
			{ID: "openai/gpt-5.2", Name: "GPT-5.2", Description: "OpenAI through OpenRouter"},
			{ID: "google/gemini-3.1-pro-preview", Name: "Gemini 3.1 Pro", Description: "Gemini through OpenRouter"},
		},
	},
}

func IsProvider(value string) bool {
	for _, provider := range Providers {
		if provider.ID == value {
			return true
		}
	}
	return false
}

func IsModel(providerID, modelID string) bool {
	if len(modelID) == 0 || len(modelID) > 160 || strings.ContainsAny(modelID, "\r\n\t") {
		return false
	}
	for _, provider := range Providers {
		if provider.ID != providerID {
			continue
		}
		for _, model := range provider.Models {
			if model.ID == modelID {
				return true
			}
		}
	}
	return false
}
