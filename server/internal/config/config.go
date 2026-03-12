package config

import (
	"fmt"
	"os"
	"strconv"
	"time"

	"github.com/joho/godotenv"
)

func init() {
	// Best-effort load of .env — silently ignored if missing.
	_ = godotenv.Load()
}

type Config struct {
	Port           string
	DatabaseURL    string
	JWTSecret      string
	GoogleClientID string
	AllowedOrigins []string
	StaticDir      string
	ResendAPIKey   string

	// Saves feature
	RedisURL             string
	GeminiAPIKey         string
	OpenAIAPIKey         string
	JinaAPIKey           string
	GeminiModel          string
	OpenAIEmbeddingModel string
	EmbeddingDimensions  int
	StorageProvider      string
	StorageLocalPath     string
	WorkerConcurrency    int
	WorkerShutdownTimeout time.Duration
	MaxFileSizeMB        int
}

func Load() (*Config, error) {
	cfg := &Config{
		Port:           getEnv("PORT", "8080"),
		DatabaseURL:    os.Getenv("DATABASE_URL"),
		JWTSecret:      os.Getenv("JWT_SECRET"),
		GoogleClientID: os.Getenv("GOOGLE_CLIENT_ID"),
		AllowedOrigins: []string{
			"https://app.mindtab.in",
			"http://localhost:5173",
		},
		StaticDir:    getEnv("STATIC_DIR", "./static"),
		ResendAPIKey: os.Getenv("RESEND_API_KEY"),
	}

	// Saves feature (optional — server starts without saves if not configured)
	cfg.RedisURL = getEnv("REDIS_URL", "")
	cfg.GeminiAPIKey = getEnv("GEMINI_API_KEY", "")
	cfg.OpenAIAPIKey = getEnv("OPENAI_API_KEY", "")
	cfg.JinaAPIKey = getEnv("JINA_API_KEY", "")
	cfg.GeminiModel = getEnv("GEMINI_MODEL", "gemini-2.0-flash")
	cfg.OpenAIEmbeddingModel = getEnv("OPENAI_EMBEDDING_MODEL", "text-embedding-3-small")
	cfg.StorageProvider = getEnv("STORAGE_PROVIDER", "local")
	cfg.StorageLocalPath = getEnv("STORAGE_LOCAL_PATH", "/data/mindtab/media")

	dimStr := getEnv("EMBEDDING_DIMENSIONS", "1536")
	cfg.EmbeddingDimensions, _ = strconv.Atoi(dimStr)
	if cfg.EmbeddingDimensions == 0 {
		cfg.EmbeddingDimensions = 1536
	}

	concStr := getEnv("WORKER_CONCURRENCY", "4")
	cfg.WorkerConcurrency, _ = strconv.Atoi(concStr)
	if cfg.WorkerConcurrency == 0 {
		cfg.WorkerConcurrency = 4
	}

	shutdownStr := getEnv("WORKER_SHUTDOWN_TIMEOUT", "30s")
	cfg.WorkerShutdownTimeout, _ = time.ParseDuration(shutdownStr)
	if cfg.WorkerShutdownTimeout == 0 {
		cfg.WorkerShutdownTimeout = 30 * time.Second
	}

	maxSizeStr := getEnv("MAX_FILE_SIZE_MB", "20")
	cfg.MaxFileSizeMB, _ = strconv.Atoi(maxSizeStr)
	if cfg.MaxFileSizeMB == 0 {
		cfg.MaxFileSizeMB = 20
	}

	if cfg.DatabaseURL == "" {
		return nil, fmt.Errorf("DATABASE_URL is required")
	}
	if cfg.JWTSecret == "" {
		return nil, fmt.Errorf("JWT_SECRET is required")
	}
	if cfg.GoogleClientID == "" {
		return nil, fmt.Errorf("GOOGLE_CLIENT_ID is required")
	}
	if cfg.ResendAPIKey == "" {
		return nil, fmt.Errorf("RESEND_API_KEY is required")
	}

	return cfg, nil
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
