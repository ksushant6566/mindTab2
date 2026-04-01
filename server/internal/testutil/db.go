//go:build integration

package testutil

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/wait"
)

// SetupTestDB boots a Postgres container with pgvector support, runs all migrations,
// and returns a connection pool. The container is terminated in t.Cleanup.
func SetupTestDB(t *testing.T) *pgxpool.Pool {
	t.Helper()

	ctx := context.Background()

	ctr, err := testcontainers.Run(ctx, "pgvector/pgvector:pg16",
		testcontainers.WithEnv(map[string]string{
			"POSTGRES_DB":       "mindtab_test",
			"POSTGRES_USER":     "test",
			"POSTGRES_PASSWORD": "test",
		}),
		testcontainers.WithExposedPorts("5432/tcp"),
		testcontainers.WithWaitStrategy(
			wait.ForLog("database system is ready to accept connections").
				WithOccurrence(2).
				WithStartupTimeout(30*time.Second),
		),
	)
	if err != nil {
		t.Fatalf("failed to start postgres container: %v", err)
	}

	t.Cleanup(func() {
		if err := testcontainers.TerminateContainer(ctr); err != nil {
			t.Logf("failed to terminate postgres container: %v", err)
		}
	})

	host, err := ctr.Host(ctx)
	if err != nil {
		t.Fatalf("failed to get container host: %v", err)
	}

	port, err := ctr.MappedPort(ctx, "5432/tcp")
	if err != nil {
		t.Fatalf("failed to get container port: %v", err)
	}

	connStr := fmt.Sprintf(
		"postgres://test:test@%s:%s/mindtab_test?sslmode=disable",
		host, port.Port(),
	)

	pool, err := pgxpool.New(ctx, connStr)
	if err != nil {
		t.Fatalf("failed to create pgxpool: %v", err)
	}

	t.Cleanup(func() {
		pool.Close()
	})

	if err := pool.Ping(ctx); err != nil {
		t.Fatalf("failed to ping database: %v", err)
	}

	runMigrations(t, pool)

	return pool
}

// TruncateAllTables truncates all mindmap_ tables in FK-safe order for test isolation.
func TruncateAllTables(t *testing.T, pool *pgxpool.Pool) {
	t.Helper()

	tables := []string{
		"mindmap_jobs", "mindmap_content", "mindmap_message", "mindmap_conversation",
		"mindmap_habit_tracker", "mindmap_habit", "mindmap_journal", "mindmap_goal",
		"mindmap_project", "mindmap_refresh_token", "mindmap_verification_token", "mindmap_user",
	}

	ctx := context.Background()
	for _, table := range tables {
		_, err := pool.Exec(ctx, fmt.Sprintf("TRUNCATE TABLE %s CASCADE", table))
		if err != nil {
			// Table may not exist yet (not all migrations present); log and continue.
			t.Logf("truncate %s: %v", table, err)
		}
	}
}

// runMigrations reads all *.up.sql files from the migrations directory in sorted order
// and executes them against the given pool.
func runMigrations(t *testing.T, pool *pgxpool.Pool) {
	t.Helper()

	migrationsDir := findMigrationsDir(t)

	entries, err := os.ReadDir(migrationsDir)
	if err != nil {
		t.Fatalf("failed to read migrations directory %s: %v", migrationsDir, err)
	}

	var upFiles []string
	for _, e := range entries {
		if !e.IsDir() && strings.HasSuffix(e.Name(), ".up.sql") {
			upFiles = append(upFiles, filepath.Join(migrationsDir, e.Name()))
		}
	}
	sort.Strings(upFiles)

	ctx := context.Background()
	for _, f := range upFiles {
		content, err := os.ReadFile(f)
		if err != nil {
			t.Fatalf("failed to read migration file %s: %v", f, err)
		}

		if _, err := pool.Exec(ctx, string(content)); err != nil {
			t.Fatalf("failed to execute migration %s: %v", filepath.Base(f), err)
		}
	}
}

// findMigrationsDir walks up from the current working directory to find a
// directory named "migrations" directly under a "server" directory, or a
// standalone "migrations" directory.
func findMigrationsDir(t *testing.T) string {
	t.Helper()

	// Start from the current working directory and walk up.
	dir, err := os.Getwd()
	if err != nil {
		t.Fatalf("failed to get working directory: %v", err)
	}

	for {
		// Check for server/migrations first.
		candidate := filepath.Join(dir, "server", "migrations")
		if info, err := os.Stat(candidate); err == nil && info.IsDir() {
			return candidate
		}

		// Check for migrations directly.
		candidate = filepath.Join(dir, "migrations")
		if info, err := os.Stat(candidate); err == nil && info.IsDir() {
			return candidate
		}

		parent := filepath.Dir(dir)
		if parent == dir {
			break
		}
		dir = parent
	}

	t.Fatalf("could not find migrations directory from working dir %s", dir)
	return ""
}
