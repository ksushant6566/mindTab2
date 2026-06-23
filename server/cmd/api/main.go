package main

import (
	"context"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"syscall"
	"time"

	"github.com/go-chi/chi/v5"
	chimw "github.com/go-chi/chi/v5/middleware"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	pgxvector "github.com/pgvector/pgvector-go/pgx"
	"golang.org/x/time/rate"

	"github.com/ksushant6566/mindtab/server/internal/chat"
	"github.com/ksushant6566/mindtab/server/internal/config"
	"github.com/ksushant6566/mindtab/server/internal/email"
	"github.com/ksushant6566/mindtab/server/internal/handler"
	mw "github.com/ksushant6566/mindtab/server/internal/middleware"
	"github.com/ksushant6566/mindtab/server/internal/providers"
	"github.com/ksushant6566/mindtab/server/internal/providers/llm"
	"github.com/ksushant6566/mindtab/server/internal/providers/transcription"
	"github.com/ksushant6566/mindtab/server/internal/queue"
	"github.com/ksushant6566/mindtab/server/internal/search"
	"github.com/ksushant6566/mindtab/server/internal/services"
	"github.com/ksushant6566/mindtab/server/internal/store"
	"github.com/ksushant6566/mindtab/server/internal/worker"
	"github.com/ksushant6566/mindtab/server/internal/worker/processors"
)

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	slog.SetDefault(logger)

	cfg, err := config.Load()
	if err != nil {
		slog.Error("failed to load config", "error", err)
		os.Exit(1)
	}

	poolCfg, err := pgxpool.ParseConfig(cfg.DatabaseURL)
	if err != nil {
		slog.Error("failed to parse database config", "error", err)
		os.Exit(1)
	}
	poolCfg.AfterConnect = func(ctx context.Context, conn *pgx.Conn) error {
		return pgxvector.RegisterTypes(ctx, conn)
	}
	pool, err := pgxpool.NewWithConfig(context.Background(), poolCfg)
	if err != nil {
		slog.Error("failed to connect to database", "error", err)
		os.Exit(1)
	}
	defer pool.Close()

	if err := pool.Ping(context.Background()); err != nil {
		slog.Error("failed to ping database", "error", err)
		os.Exit(1)
	}
	slog.Info("connected to database")

	queries := store.New(pool)

	// Redis + saves feature (optional — disabled if REDIS_URL not set)
	var savesHandler *handler.SavesHandler
	var dispatcher *worker.Dispatcher
	var storage services.StorageProvider
	var llmChain *providers.Chain[llm.LLMProvider]
	var semanticSearch *search.SemanticSearch
	if cfg.RedisURL != "" {
		redisClient, err := queue.ConnectRedis(context.Background(), cfg.RedisURL)
		if err != nil {
			slog.Error("failed to connect to Redis", "error", err)
			os.Exit(1)
		}
		defer redisClient.Close()

		// Provider registry
		registry, err := providers.NewRegistry(providers.RegistryConfig{
			GeminiAPIKey:         cfg.GeminiAPIKey,
			GeminiModel:          cfg.GeminiModel,
			OpenAIAPIKey:         cfg.OpenAIAPIKey,
			OpenAIEmbeddingModel: cfg.OpenAIEmbeddingModel,
			EmbeddingDimensions:  cfg.EmbeddingDimensions,
		}, slog.Default())
		if err != nil {
			slog.Error("failed to initialize providers", "error", err)
			os.Exit(1)
		}

		// Storage
		storage = services.NewLocalStorage(cfg.StorageLocalPath)

		// Media tooling
		ffmpeg := services.NewFFmpeg(cfg.FFmpegPath, logger)

		// Jina Reader
		jina := services.NewJinaReader(cfg.JinaAPIKey)

		// Queue
		producer := queue.NewProducer(redisClient)
		consumer := queue.NewConsumer(redisClient)
		retryScheduler := queue.NewRetryScheduler(redisClient, slog.Default())

		// Search
		semanticSearch = search.NewSemanticSearch(pool, registry.Embedding)

		// LLM chain (used by chat orchestrator)
		llmChain = registry.LLM

		// Saves handler
		savesHandler = handler.NewSavesHandler(queries, producer, semanticSearch, storage, int64(cfg.MaxFileSizeMB)*1024*1024, cfg.JWTSecret, ffmpeg)

		// Worker dispatcher
		dispatcher = worker.NewDispatcher(
			consumer,
			retryScheduler,
			queries,
			slog.Default(),
			cfg.WorkerConcurrency,
			worker.WithDequeueTimeout(cfg.WorkerDequeueTimeout),
			worker.WithRetryPollInterval(cfg.WorkerRetryPollInterval),
			worker.WithVideoTempPath(cfg.YoutubeTempPath),
		)
		dispatcher.Register(processors.NewArticleProcessor(jina, registry.LLM, registry.Embedding, queries, pool))
		dispatcher.Register(processors.NewImageProcessor(storage, registry.LLM, registry.Embedding, queries, pool))
		dispatcher.Register(processors.NewXPostProcessor(
			services.NewXClient(cfg.XBearerToken),
			registry.LLM, registry.Embedding,
			queries, pool,
		))
		logger.Info("x post processor registered")
		dispatcher.Register(processors.NewRedditPostProcessor(
			services.NewRedditClient(cfg.RedditUserAgent),
			registry.LLM, registry.Embedding,
			queries, pool,
		))
		logger.Info("reddit post processor registered")

		if cfg.GroqAPIKey != "" {
			transcriptionChain := providers.NewChain[transcription.TranscriptionProvider](logger)
			transcriptionChain.Add("groq-whisper", transcription.NewGroqProvider(cfg.GroqAPIKey))
			ytdlp := services.NewYTDLP(cfg.YTDLPPath, logger)
			dispatcher.Register(processors.NewYoutubeProcessor(
				ytdlp, ffmpeg, transcriptionChain,
				registry.LLM, registry.Embedding,
				queries, pool, cfg,
			))
			logger.Info("youtube processor registered")
			dispatcher.Register(processors.NewInstagramReelProcessor(
				ytdlp, ffmpeg, transcriptionChain,
				registry.LLM, registry.Embedding,
				storage, queries, pool, cfg,
			))
			logger.Info("instagram reel processor registered")
			dispatcher.Register(processors.NewAudioProcessor(
				transcriptionChain,
				registry.LLM, registry.Embedding,
				storage, queries, pool,
				ffmpeg,
			))
			logger.Info("audio processor registered")
		}

		// Startup cleanup of orphaned YouTube temp dirs (older than 1 hour).
		if cfg.GroqAPIKey != "" {
			go func() {
				entries, err := os.ReadDir(cfg.YoutubeTempPath)
				if err != nil {
					return
				}
				cutoff := time.Now().Add(-1 * time.Hour)
				for _, entry := range entries {
					if !entry.IsDir() {
						continue
					}
					info, err := entry.Info()
					if err != nil {
						continue
					}
					if info.ModTime().Before(cutoff) {
						os.RemoveAll(filepath.Join(cfg.YoutubeTempPath, entry.Name()))
						logger.Info("cleaned orphaned youtube temp dir", "dir", entry.Name())
					}
				}
			}()
		}

		// Startup recovery
		retryScheduler.RecoverOrphans(context.Background())

		// Start workers
		dispatcher.Start(context.Background())

		// Periodic cleanup of expired draft saves (every 3 hours, expire after 24 hours).
		go worker.StartDraftCleanup(
			context.Background(),
			queries,
			storage,
			slog.Default().With("component", "draft_cleanup"),
			3*time.Hour,
			24*time.Hour,
		)
	}

	// Initialize handlers.
	emailService := email.NewService(cfg.ResendAPIKey)
	authHandler := handler.NewAuthHandler(queries, pool, cfg.JWTSecret, cfg.GoogleClientID, cfg.GoogleClientSecret, cfg.APIPublicURL, cfg.AllowedOrigins)
	emailAuthHandler := handler.NewEmailAuthHandler(queries, pool, cfg.JWTSecret, emailService)
	usersHandler := handler.NewUsersHandler(queries)
	tasksHandler := handler.NewTasksHandler(queries, pool)
	habitsHandler := handler.NewHabitsHandler(queries, pool)
	habitTrackerHandler := handler.NewHabitTrackerHandler(queries)
	notesHandler := handler.NewNotesHandler(queries)
	projectsHandler := handler.NewProjectsHandler(queries, pool)
	activityHandler := handler.NewActivityHandler(queries)
	bookmarksHandler := handler.NewBookmarksHandler(queries)
	readingListsHandler := handler.NewReadingListsHandler(queries)
	searchHandler := handler.NewSearchHandler(queries)
	mentionsHandler := handler.NewMentionsHandler(queries)

	// Periodic cleanup of expired tokens.
	go func() {
		ticker := time.NewTicker(1 * time.Hour)
		defer ticker.Stop()
		for {
			<-ticker.C
			if err := queries.DeleteExpiredRefreshTokens(context.Background()); err != nil {
				slog.Error("failed to clean expired refresh tokens", "error", err)
			}
			if err := queries.DeleteExpiredVerificationTokens(context.Background()); err != nil {
				slog.Error("failed to clean expired verification tokens", "error", err)
			}
		}
	}()

	r := chi.NewRouter()
	r.Use(chimw.RequestID)
	r.Use(chimw.RealIP)
	r.Use(chimw.Recoverer)
	r.Use(mw.CORS(cfg.AllowedOrigins))

	// Health check.
	r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"status":"ok"}`))
	})

	// Rate limiters for auth endpoints.
	authLimiter := mw.NewRateLimiter(rate.Every(12*time.Second), 5)   // 5 req/min burst 5
	signupLimiter := mw.NewRateLimiter(rate.Every(20*time.Second), 3) // 3 req/min burst 3

	// Public routes (no rate limiting).
	r.Post("/auth/google", authHandler.Google)
	r.Get("/auth/google/start", authHandler.GoogleStart)
	r.Get("/auth/google/callback", authHandler.GoogleCallback)
	r.Post("/auth/refresh", authHandler.Refresh)
	r.Post("/auth/logout", authHandler.Logout)
	r.Get("/users/{id}", usersHandler.GetByID)

	// Rate-limited auth routes.
	r.Group(func(r chi.Router) {
		r.Use(authLimiter.Limit)
		r.Post("/auth/email/signin", emailAuthHandler.Signin)
		r.Post("/auth/email/verify", emailAuthHandler.Verify)
		r.Post("/auth/email/forgot-password", emailAuthHandler.ForgotPassword)
		r.Post("/auth/email/reset-password", emailAuthHandler.ResetPassword)
	})
	r.Group(func(r chi.Router) {
		r.Use(signupLimiter.Limit)
		r.Post("/auth/email/signup", emailAuthHandler.Signup)
	})

	// WebSocket chat — outside auth middleware (auth via query param token).
	registry := chat.NewRegistry()
	registry.Register(chat.NewListTasksTool(queries))
	registry.Register(chat.NewCreateTaskTool(queries))
	registry.Register(chat.NewUpdateTaskTool(queries))
	registry.Register(chat.NewDeleteTaskTool(queries))
	registry.Register(chat.NewListHabitsTool(queries))
	registry.Register(chat.NewCreateHabitTool(queries))
	registry.Register(chat.NewToggleHabitTool(queries))
	registry.Register(chat.NewListNotesTool(queries))
	registry.Register(chat.NewCreateNoteTool(queries))
	registry.Register(chat.NewUpdateNoteTool(queries))
	registry.Register(chat.NewDeleteNoteTool(queries))
	registry.Register(chat.NewListProjectsTool(queries))
	registry.Register(chat.NewCreateProjectTool(queries))
	registry.Register(chat.NewSearchVaultTool(queries, semanticSearch))
	registry.Register(chat.NewGetVaultItemTool(queries))
	// Tier 1 — Analytics
	registry.Register(chat.NewGetHabitStatsTool(queries))
	registry.Register(chat.NewGetActivitySummaryTool(queries))
	registry.Register(chat.NewGetUserProfileTool(queries))
	// Tier 2 — Search & Detail
	registry.Register(chat.NewSearchTasksTool(queries))
	registry.Register(chat.NewSearchNotesTool(queries))
	registry.Register(chat.NewGetNoteContentTool(queries))
	registry.Register(chat.NewGetTaskDetailTool(queries))
	// Tier 3 — Power User
	registry.Register(chat.NewGetProjectStatsTool(queries))
	registry.Register(chat.NewDeleteHabitTool(queries))
	registry.Register(chat.NewUpdateHabitTool(queries))
	registry.Register(chat.NewSearchHabitsTool(queries))
	registry.Register(chat.NewUpdateProjectTool(queries))
	// Tier 4 — Intelligence
	registry.Register(chat.NewGetDailyBriefingTool(queries))
	registry.Register(chat.NewSearchEverythingTool(queries, semanticSearch))
	registry.Register(chat.NewGetHabitPatternsTool(queries))
	registry.Register(chat.NewComparePeriodsTool(queries))
	registry.Register(chat.NewGetStaleItemsTool(queries))
	orchestrator := chat.NewOrchestrator(queries, llmChain, registry)
	wsHandler := handler.NewWSHandler(orchestrator, cfg.JWTSecret, cfg.AllowedOrigins, queries)
	r.Get("/ws/chat", wsHandler.HandleChat)

	spaHandler := handler.NewSPAHandler(cfg.StaticDir)
	authenticatedHabitList := mw.Auth(cfg.JWTSecret)(http.HandlerFunc(habitsHandler.List))
	r.Get("/habits", func(w http.ResponseWriter, r *http.Request) {
		if acceptsHTML(r) {
			spaHandler.ServeHTTP(w, r)
			return
		}

		authenticatedHabitList.ServeHTTP(w, r)
	})

	// Protected routes.
	r.Group(func(r chi.Router) {
		r.Use(mw.Auth(cfg.JWTSecret))

		r.Post("/auth/ws-ticket", authHandler.WSTicket)

		r.Get("/activity", activityHandler.GetUserActivity)

		r.Get("/users/me", usersHandler.GetMe)
		r.Patch("/users/me", usersHandler.UpdateMe)

		// Tasks — register literal paths before {id} param.
		r.Get("/tasks", tasksHandler.List)
		r.Post("/tasks", tasksHandler.Create)
		r.Get("/tasks/count", tasksHandler.GetCount)
		r.Get("/tasks/unassigned", tasksHandler.GetUnassigned)
		r.Patch("/tasks/positions", tasksHandler.UpdatePositions)
		r.Post("/tasks/archive-completed", tasksHandler.ArchiveCompleted)
		r.Get("/tasks/{id}/connected-habits", mentionsHandler.ConnectedHabits)
		r.Get("/tasks/{id}", tasksHandler.Get)
		r.Patch("/tasks/{id}", tasksHandler.Update)
		r.Delete("/tasks/{id}", tasksHandler.Delete)

		// Habits.
		r.Post("/habits", habitsHandler.Create)
		r.Get("/habits/{id}", habitsHandler.Get)
		r.Patch("/habits/{id}", habitsHandler.Update)
		r.Delete("/habits/{id}", habitsHandler.Delete)
		r.Post("/habits/{id}/track", habitsHandler.Track)
		r.Delete("/habits/{id}/track", habitsHandler.Untrack)

		// Habit tracker.
		r.Get("/habit-tracker", habitTrackerHandler.List)

		// Notes — register /notes/count before /notes/{id}.
		r.Get("/notes", notesHandler.List)
		r.Post("/notes", notesHandler.Create)
		r.Get("/notes/count", notesHandler.GetCount)
		r.Get("/notes/{id}", notesHandler.Get)
		r.Patch("/notes/{id}", notesHandler.Update)
		r.Delete("/notes/{id}", notesHandler.Delete)

		// Projects — register /projects/stats before /projects/{id}.
		r.Get("/projects", projectsHandler.List)
		r.Post("/projects", projectsHandler.Create)
		r.Get("/projects/stats", projectsHandler.GetWithStats)
		r.Get("/projects/{id}", projectsHandler.Get)
		r.Patch("/projects/{id}", projectsHandler.Update)
		r.Delete("/projects/{id}", projectsHandler.Delete)
		r.Post("/projects/{id}/archive", projectsHandler.Archive)

		// Search.
		r.Get("/search/tasks", searchHandler.Tasks)
		r.Get("/search/habits", searchHandler.Habits)
		r.Get("/search/notes", searchHandler.Notes)

		// Mentions / connected knowledge.
		r.Get("/mentions/connected-notes", mentionsHandler.ConnectedNotes)

		// Sync.
		r.Post("/sync/bookmarks", bookmarksHandler.Sync)
		r.Post("/sync/reading-lists", readingListsHandler.Sync)

		// Saves (only if configured)
		if savesHandler != nil {
			r.Post("/saves", savesHandler.Create)
			r.Get("/saves", savesHandler.List)
			r.Post("/saves/search", savesHandler.Search)
			r.Get("/saves/{id}", savesHandler.Get)
			r.Delete("/saves/{id}", savesHandler.Delete)
			r.Post("/saves/{id}/commit", savesHandler.Commit)
		}

		// Chat.
		chatHandler := handler.NewChatHandler(queries, int64(cfg.MaxFileSizeMB)*1024*1024)
		r.Get("/conversations", chatHandler.ListConversations)
		r.Get("/conversations/{id}/messages", chatHandler.GetMessages)
		r.Delete("/conversations/{id}", chatHandler.DeleteConversation)
		r.Post("/chat/attachments", chatHandler.UploadAttachment)
	})

	// Media serving — outside auth group (handles its own auth via signed URLs or Bearer)
	if savesHandler != nil {
		r.Get("/media/*", savesHandler.ServeMedia(storage))
	}

	// SPA fallback — must be last
	r.Handle("/*", spaHandler)

	srv := &http.Server{
		Addr:         ":" + cfg.Port,
		Handler:      r,
		ReadTimeout:  10 * time.Second,
		WriteTimeout: 30 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	go func() {
		slog.Info("server starting", "port", cfg.Port)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			slog.Error("server error", "error", err)
			os.Exit(1)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	shutdownTimeout := 10 * time.Second
	if cfg.WorkerShutdownTimeout > shutdownTimeout {
		shutdownTimeout = cfg.WorkerShutdownTimeout
	}
	ctx, cancel := context.WithTimeout(context.Background(), shutdownTimeout)
	defer cancel()

	slog.Info("shutting down server")
	if dispatcher != nil {
		dispatcher.Stop()
	}
	if err := srv.Shutdown(ctx); err != nil {
		slog.Error("server shutdown error", "error", err)
	}
}

func acceptsHTML(r *http.Request) bool {
	return strings.Contains(r.Header.Get("Accept"), "text/html")
}
