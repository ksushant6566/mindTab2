package config

import (
	"strings"
	"testing"
)

func setBaseRequiredEnv(t *testing.T) {
	t.Helper()
	t.Setenv("DATABASE_URL", "postgres://example")
	t.Setenv("JWT_SECRET", "secret")
	t.Setenv("GOOGLE_CLIENT_ID", "google-client")
	t.Setenv("RESEND_API_KEY", "resend")
}

func clearSavesEnv(t *testing.T) {
	t.Helper()
	for _, key := range []string{
		"REDIS_URL",
		"GEMINI_API_KEY",
		"OPENAI_API_KEY",
		"JINA_API_KEY",
		"GROQ_API_KEY",
		"X_BEARER_TOKEN",
		"REDDIT_USER_AGENT",
	} {
		t.Setenv(key, "")
	}
}

func TestLoad_AllowsServerWithoutSavesWorkerEnv(t *testing.T) {
	setBaseRequiredEnv(t)
	clearSavesEnv(t)

	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load() error = %v", err)
	}
	if cfg.RedisURL != "" {
		t.Fatalf("RedisURL = %q, want empty", cfg.RedisURL)
	}
}

func TestLoad_RequiresSavesWorkerEnvWhenRedisEnabled(t *testing.T) {
	setBaseRequiredEnv(t)
	clearSavesEnv(t)
	t.Setenv("REDIS_URL", "redis://localhost:6379")

	_, err := Load()
	if err == nil {
		t.Fatal("Load() error = nil, want missing saves env error")
	}
	for _, want := range []string{"GEMINI_API_KEY", "OPENAI_API_KEY", "JINA_API_KEY", "GROQ_API_KEY", "X_BEARER_TOKEN"} {
		if !strings.Contains(err.Error(), want) {
			t.Fatalf("Load() error = %q, want missing %s", err.Error(), want)
		}
	}
}

func TestLoad_DefaultsRedditUserAgentWithoutSecret(t *testing.T) {
	setBaseRequiredEnv(t)
	clearSavesEnv(t)
	t.Setenv("REDIS_URL", "redis://localhost:6379")
	t.Setenv("GEMINI_API_KEY", "gemini")
	t.Setenv("OPENAI_API_KEY", "openai")
	t.Setenv("JINA_API_KEY", "jina")
	t.Setenv("GROQ_API_KEY", "groq")
	t.Setenv("X_BEARER_TOKEN", "x-token")

	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load() error = %v", err)
	}
	if cfg.RedditUserAgent == "" {
		t.Fatal("RedditUserAgent is empty, want default")
	}
}
