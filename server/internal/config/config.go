package config

import (
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/joho/godotenv"
)

func init() {
	// Best-effort load of .env — silently ignored if missing.
	_ = godotenv.Load()
}

type Config struct {
	Port               string
	DatabaseURL        string
	JWTSecret          string
	GoogleClientID     string
	GoogleClientSecret string
	APIPublicURL       string
	AllowedOrigins     []string
	StaticDir          string
	ResendAPIKey       string

	// Saves feature
	RedisURL                string
	GeminiAPIKey            string
	OpenAIAPIKey            string
	JinaAPIKey              string
	GeminiModel             string
	OpenAIEmbeddingModel    string
	EmbeddingDimensions     int
	StorageProvider         string
	StorageLocalPath        string
	WorkerConcurrency       int
	WorkerDequeueTimeout    time.Duration
	WorkerRetryPollInterval time.Duration
	WorkerShutdownTimeout   time.Duration
	MaxFileSizeMB           int

	// YouTube (Phase 2)
	GroqAPIKey          string
	YTDLPPath           string
	FFmpegPath          string
	YoutubeTempPath     string
	YoutubeMaxDuration  int
	YoutubeVideoQuality int
	YoutubeFramesCap    int

	// Social sources
	XBearerToken    string
	RedditUserAgent string
}

func Load() (*Config, error) {
	cfg := &Config{
		Port:               getEnv("PORT", "8080"),
		DatabaseURL:        os.Getenv("DATABASE_URL"),
		JWTSecret:          os.Getenv("JWT_SECRET"),
		GoogleClientID:     os.Getenv("GOOGLE_CLIENT_ID"),
		GoogleClientSecret: os.Getenv("GOOGLE_CLIENT_SECRET"),
		APIPublicURL:       os.Getenv("API_PUBLIC_URL"),
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
	cfg.GeminiModel = getEnv("GEMINI_MODEL", "gemini-2.5-flash")
	cfg.OpenAIEmbeddingModel = getEnv("OPENAI_EMBEDDING_MODEL", "text-embedding-3-small")
	cfg.StorageProvider = getEnv("STORAGE_PROVIDER", "local")
	cfg.StorageLocalPath = getEnv("STORAGE_LOCAL_PATH", "/data/mindtab/media")

	dimStr := getEnv("EMBEDDING_DIMENSIONS", "1536")
	cfg.EmbeddingDimensions, _ = strconv.Atoi(dimStr)
	if cfg.EmbeddingDimensions == 0 {
		cfg.EmbeddingDimensions = 1536
	}

	concStr := getEnv("WORKER_CONCURRENCY", "1")
	cfg.WorkerConcurrency, _ = strconv.Atoi(concStr)
	if cfg.WorkerConcurrency == 0 {
		cfg.WorkerConcurrency = 1
	}

	dequeueTimeoutStr := getEnv("WORKER_DEQUEUE_TIMEOUT", "5m")
	cfg.WorkerDequeueTimeout, _ = time.ParseDuration(dequeueTimeoutStr)
	if cfg.WorkerDequeueTimeout == 0 {
		cfg.WorkerDequeueTimeout = 5 * time.Minute
	}

	retryPollIntervalStr := getEnv("WORKER_RETRY_POLL_INTERVAL", "1m")
	cfg.WorkerRetryPollInterval, _ = time.ParseDuration(retryPollIntervalStr)
	if cfg.WorkerRetryPollInterval == 0 {
		cfg.WorkerRetryPollInterval = time.Minute
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

	// YouTube
	cfg.GroqAPIKey = os.Getenv("GROQ_API_KEY")
	cfg.YTDLPPath = os.Getenv("YTDLP_PATH")
	if cfg.YTDLPPath == "" {
		cfg.YTDLPPath = "yt-dlp"
	}
	cfg.FFmpegPath = os.Getenv("FFMPEG_PATH")
	if cfg.FFmpegPath == "" {
		cfg.FFmpegPath = "ffmpeg"
	}
	cfg.YoutubeTempPath = os.Getenv("YOUTUBE_TEMP_PATH")
	if cfg.YoutubeTempPath == "" {
		cfg.YoutubeTempPath = "/tmp/mindtab/youtube"
	}
	if v := os.Getenv("YOUTUBE_MAX_DURATION_SEC"); v != "" {
		cfg.YoutubeMaxDuration, _ = strconv.Atoi(v)
	}
	if cfg.YoutubeMaxDuration == 0 {
		cfg.YoutubeMaxDuration = 7200
	}
	if v := os.Getenv("YOUTUBE_VIDEO_QUALITY"); v != "" {
		cfg.YoutubeVideoQuality, _ = strconv.Atoi(v)
	}
	if cfg.YoutubeVideoQuality == 0 {
		cfg.YoutubeVideoQuality = 360
	}
	if v := os.Getenv("YOUTUBE_FRAMES_PER_MIN_CAP"); v != "" {
		cfg.YoutubeFramesCap, _ = strconv.Atoi(v)
	}
	if cfg.YoutubeFramesCap == 0 {
		cfg.YoutubeFramesCap = 5
	}

	// Social sources
	cfg.XBearerToken = os.Getenv("X_BEARER_TOKEN")
	cfg.RedditUserAgent = getEnv("REDDIT_USER_AGENT", "web:mindtab.reddit-summary:v0.1.1")

	if cfg.DatabaseURL == "" {
		return nil, fmt.Errorf("DATABASE_URL is required")
	}
	if cfg.JWTSecret == "" {
		return nil, fmt.Errorf("JWT_SECRET is required")
	}
	if cfg.GoogleClientID == "" {
		return nil, fmt.Errorf("GOOGLE_CLIENT_ID is required")
	}
	if cfg.GoogleClientSecret == "" {
		return nil, fmt.Errorf("GOOGLE_CLIENT_SECRET is required")
	}
	if cfg.ResendAPIKey == "" {
		return nil, fmt.Errorf("RESEND_API_KEY is required")
	}
	if cfg.RedisURL != "" {
		missing := missingRequiredSavesEnv(cfg)
		if len(missing) > 0 {
			return nil, fmt.Errorf("saves worker is enabled by REDIS_URL but missing required env: %s", strings.Join(missing, ", "))
		}
	}

	return cfg, nil
}

func missingRequiredSavesEnv(cfg *Config) []string {
	var missing []string
	if cfg.GeminiAPIKey == "" {
		missing = append(missing, "GEMINI_API_KEY")
	}
	if cfg.OpenAIAPIKey == "" {
		missing = append(missing, "OPENAI_API_KEY")
	}
	if cfg.JinaAPIKey == "" {
		missing = append(missing, "JINA_API_KEY")
	}
	if cfg.GroqAPIKey == "" {
		missing = append(missing, "GROQ_API_KEY")
	}
	if cfg.XBearerToken == "" {
		missing = append(missing, "X_BEARER_TOKEN")
	}
	return missing
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
