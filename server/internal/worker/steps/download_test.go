package steps

import (
	"context"
	"encoding/json"
	"log/slog"
	"os"
	"path/filepath"
	"testing"

	"github.com/google/uuid"
	"github.com/ksushant6566/mindtab/server/internal/services"
)

// brokenYTDLP returns a YTDLP instance pointing to a non-existent binary so
// that any exec call fails with "exec: no such file" rather than a nil-pointer
// dereference.
func brokenYTDLP() *services.YTDLP {
	return services.NewYTDLP("/nonexistent/yt-dlp-binary", slog.Default())
}

// TestDownload_EmptySourceURL verifies that Download returns an error
// immediately when no source URL is provided, before creating directories
// or invoking yt-dlp.
func TestDownload_EmptySourceURL(t *testing.T) {
	tmpDir := t.TempDir()
	jobID := uuid.New()

	_, err := Download(context.Background(), brokenYTDLP(), "", tmpDir, jobID, 720)
	if err == nil {
		t.Fatal("Download: expected error for empty source URL, got nil")
	}
}

// TestDownload_CreatesJobScopedDirectory verifies that Download creates a
// job-scoped subdirectory under tempBasePath before calling yt-dlp.
//
// Since Download creates the dir before calling ytdlp.Download, the error
// from the missing binary should not prevent dir creation.
func TestDownload_CreatesJobScopedDirectory(t *testing.T) {
	tmpDir := t.TempDir()
	jobID := uuid.New()
	expectedDir := filepath.Join(tmpDir, jobID.String())

	// The binary call will fail; we only care that the directory was created.
	_, _ = Download(context.Background(), brokenYTDLP(), "https://example.com/video", tmpDir, jobID, 720)

	if _, err := os.Stat(expectedDir); os.IsNotExist(err) {
		t.Errorf("expected job-scoped directory %q to be created before yt-dlp call, but it does not exist", expectedDir)
	}
}

// TestDownload_ResultShape verifies that DownloadResult marshals/unmarshals
// correctly and that the video file path field survives a JSON round-trip.
func TestDownload_ResultShape(t *testing.T) {
	want := DownloadResult{VideoFilePath: "/tmp/jobs/abc/video.mp4"}

	data, err := json.Marshal(want)
	if err != nil {
		t.Fatalf("marshal DownloadResult: %v", err)
	}

	var got DownloadResult
	if err := json.Unmarshal(data, &got); err != nil {
		t.Fatalf("unmarshal DownloadResult: %v", err)
	}

	if got.VideoFilePath != want.VideoFilePath {
		t.Errorf("VideoFilePath: got %q, want %q", got.VideoFilePath, want.VideoFilePath)
	}
}

// TestDownload_InvalidTempBasePathFails verifies that Download returns an
// error when the tempBasePath cannot be created (e.g., parent is a file).
func TestDownload_InvalidTempBasePathFails(t *testing.T) {
	// Create a file where tempBasePath should be a directory.
	f, err := os.CreateTemp("", "not-a-dir-*")
	if err != nil {
		t.Fatalf("create temp file: %v", err)
	}
	defer os.Remove(f.Name())
	f.Close()

	// Use a path nested inside the file — MkdirAll must fail.
	jobID := uuid.New()
	_, err = Download(context.Background(), brokenYTDLP(), "https://example.com/video", filepath.Join(f.Name(), "subdir"), jobID, 720)
	if err == nil {
		t.Fatal("Download: expected error when tempBasePath is not a valid directory")
	}
}
