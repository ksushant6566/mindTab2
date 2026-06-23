package config

import (
	"strings"
	"testing"
	"time"
)

func setBaseRequiredEnv(t *testing.T) {
	t.Helper()
	t.Setenv("DATABASE_URL", "postgres://example")
	t.Setenv("JWT_SECRET", "secret")
	t.Setenv("GOOGLE_CLIENT_ID", "google-client")
	t.Setenv("GOOGLE_CLIENT_SECRET", "google-secret")
	t.Setenv("API_PUBLIC_URL", "http://localhost:8080")
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
		"WORKER_CONCURRENCY",
		"WORKER_DEQUEUE_TIMEOUT",
		"WORKER_RETRY_POLL_INTERVAL",
		"WORKER_SHUTDOWN_TIMEOUT",
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
	if cfg.WorkerConcurrency != 1 {
		t.Fatalf("WorkerConcurrency = %d, want 1", cfg.WorkerConcurrency)
	}
	if cfg.WorkerDequeueTimeout != 5*time.Minute {
		t.Fatalf("WorkerDequeueTimeout = %s, want 5m", cfg.WorkerDequeueTimeout)
	}
	if cfg.WorkerRetryPollInterval != time.Minute {
		t.Fatalf("WorkerRetryPollInterval = %s, want 1m", cfg.WorkerRetryPollInterval)
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

func TestLoad_RequiresGoogleClientSecret(t *testing.T) {
	setBaseRequiredEnv(t)
	clearSavesEnv(t)
	t.Setenv("GOOGLE_CLIENT_SECRET", "")

	_, err := Load()
	if err == nil {
		t.Fatal("Load() error = nil, want missing GOOGLE_CLIENT_SECRET error")
	}
	if !strings.Contains(err.Error(), "GOOGLE_CLIENT_SECRET") {
		t.Fatalf("Load() error = %q, want missing GOOGLE_CLIENT_SECRET", err.Error())
	}
}

func TestLoad_RequiresAPIPublicURL(t *testing.T) {
	setBaseRequiredEnv(t)
	clearSavesEnv(t)
	t.Setenv("API_PUBLIC_URL", "")

	_, err := Load()
	if err == nil {
		t.Fatal("Load() error = nil, want missing API_PUBLIC_URL error")
	}
	if !strings.Contains(err.Error(), "API_PUBLIC_URL") {
		t.Fatalf("Load() error = %q, want missing API_PUBLIC_URL", err.Error())
	}
}

func TestLoad_OverridesWorkerSettings(t *testing.T) {
	setBaseRequiredEnv(t)
	clearSavesEnv(t)
	t.Setenv("WORKER_CONCURRENCY", "3")
	t.Setenv("WORKER_DEQUEUE_TIMEOUT", "30s")
	t.Setenv("WORKER_RETRY_POLL_INTERVAL", "45s")

	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load() error = %v", err)
	}
	if cfg.WorkerConcurrency != 3 {
		t.Fatalf("WorkerConcurrency = %d, want 3", cfg.WorkerConcurrency)
	}
	if cfg.WorkerDequeueTimeout != 30*time.Second {
		t.Fatalf("WorkerDequeueTimeout = %s, want 30s", cfg.WorkerDequeueTimeout)
	}
	if cfg.WorkerRetryPollInterval != 45*time.Second {
		t.Fatalf("WorkerRetryPollInterval = %s, want 45s", cfg.WorkerRetryPollInterval)
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
