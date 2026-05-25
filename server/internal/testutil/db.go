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

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	pgxvector "github.com/pgvector/pgvector-go/pgx"
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

	// First, run migrations using a one-off connection (no pgvector codec yet —
	// the vector type doesn't exist until 000003_saves.up.sql creates the extension).
	bootConn, err := pgx.Connect(ctx, connStr)
	if err != nil {
		t.Fatalf("failed to open bootstrap connection: %v", err)
	}
	runMigrationsOnConn(t, bootConn)
	if err := bootConn.Close(ctx); err != nil {
		t.Logf("failed to close bootstrap connection: %v", err)
	}

	// Now create the pool with AfterConnect that registers pgvector types — safe
	// because the vector extension is in place.
	cfg, err := pgxpool.ParseConfig(connStr)
	if err != nil {
		t.Fatalf("failed to parse pgxpool config: %v", err)
	}
	cfg.AfterConnect = func(ctx context.Context, conn *pgx.Conn) error {
		return pgxvector.RegisterTypes(ctx, conn)
	}

	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		t.Fatalf("failed to create pgxpool: %v", err)
	}

	t.Cleanup(func() {
		pool.Close()
	})

	if err := pool.Ping(ctx); err != nil {
		t.Fatalf("failed to ping database: %v", err)
	}

	return pool
}

// TruncateAllTables discovers application tables dynamically and truncates them
// with CASCADE for test isolation. This avoids a hardcoded list that falls out of
// sync when new migrations add tables.
func TruncateAllTables(t *testing.T, pool *pgxpool.Pool) {
	t.Helper()

	ctx := context.Background()

	rows, err := pool.Query(ctx,
		`SELECT tablename
		 FROM pg_tables
		 WHERE schemaname = 'public'
		   AND tablename <> 'schema_migrations'`,
	)
	if err != nil {
		t.Fatalf("failed to discover application tables: %v", err)
	}
	defer rows.Close()

	var tables []string
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			t.Fatalf("failed to scan table name: %v", err)
		}
		tables = append(tables, name)
	}

	for _, table := range tables {
		tableName := pgx.Identifier{"public", table}.Sanitize()
		if _, err := pool.Exec(ctx, fmt.Sprintf("TRUNCATE TABLE %s CASCADE", tableName)); err != nil {
			t.Logf("truncate %s: %v", table, err)
		}
	}
}

// runMigrationsOnConn reads all *.up.sql files from the migrations directory in sorted order
// and executes them against the given connection.
func runMigrationsOnConn(t *testing.T, conn *pgx.Conn) {
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

		if _, err := conn.Exec(ctx, string(content)); err != nil {
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
