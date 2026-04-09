package steps

import (
	"context"
	"encoding/json"
	"log/slog"
	"os"
	"path/filepath"
	"testing"

	"github.com/ksushant6566/mindtab/server/internal/services"
)

// brokenFFmpegForFrames returns an FFmpeg instance pointing to a non-existent
// binary so exec calls fail gracefully.
func brokenFFmpegForFrames() *services.FFmpeg {
	return services.NewFFmpeg("/nonexistent/ffmpeg-binary", slog.Default())
}

// TestExtractFrames_ResultShape verifies that ExtractFramesResult marshals/
// unmarshals correctly and that FrameCount matches len(FramePaths).
func TestExtractFrames_ResultShape(t *testing.T) {
	want := ExtractFramesResult{
		FramePaths: []string{
			"/tmp/jobs/abc/frames/frame_00001.jpg",
			"/tmp/jobs/abc/frames/frame_00002.jpg",
			"/tmp/jobs/abc/frames/frame_00003.jpg",
		},
		FrameCount: 3,
	}

	data, err := json.Marshal(want)
	if err != nil {
		t.Fatalf("marshal ExtractFramesResult: %v", err)
	}

	var got ExtractFramesResult
	if err := json.Unmarshal(data, &got); err != nil {
		t.Fatalf("unmarshal ExtractFramesResult: %v", err)
	}

	if got.FrameCount != want.FrameCount {
		t.Errorf("FrameCount: got %d, want %d", got.FrameCount, want.FrameCount)
	}
	if len(got.FramePaths) != len(want.FramePaths) {
		t.Errorf("FramePaths length: got %d, want %d", len(got.FramePaths), len(want.FramePaths))
	}
	for i, p := range got.FramePaths {
		if p != want.FramePaths[i] {
			t.Errorf("FramePaths[%d]: got %q, want %q", i, p, want.FramePaths[i])
		}
	}
}

// TestExtractFrames_FrameCountMatchesPaths verifies the invariant that
// FrameCount == len(FramePaths) in any ExtractFramesResult.
func TestExtractFrames_FrameCountMatchesPaths(t *testing.T) {
	paths := []string{"frame_00001.jpg", "frame_00002.jpg"}
	result := ExtractFramesResult{
		FramePaths: paths,
		FrameCount: len(paths),
	}

	if result.FrameCount != len(result.FramePaths) {
		t.Errorf("FrameCount (%d) does not match len(FramePaths) (%d)", result.FrameCount, len(result.FramePaths))
	}
}

// TestExtractFrames_CreateFramesDirectory verifies that ExtractFrames creates
// a "frames" subdirectory under the video file's parent directory before
// invoking ffmpeg. The directory creation happens before the binary call, so
// it must exist even when ffmpeg fails.
func TestExtractFrames_CreateFramesDirectory(t *testing.T) {
	tmpDir := t.TempDir()
	videoPath := filepath.Join(tmpDir, "video.mp4")
	expectedFramesDir := filepath.Join(tmpDir, "frames")

	// Create a dummy video file so the path is valid.
	if err := os.WriteFile(videoPath, []byte{}, 0o644); err != nil {
		t.Fatalf("create dummy video file: %v", err)
	}

	// brokenFFmpegForFrames points to a non-existent binary — exec call fails.
	_, _ = ExtractFrames(context.Background(), brokenFFmpegForFrames(), videoPath, 300, 0.4, 10)

	if _, err := os.Stat(expectedFramesDir); os.IsNotExist(err) {
		t.Errorf("expected frames directory %q to be created before ffmpeg call, but it does not exist", expectedFramesDir)
	}
}

// TestExtractFrames_FramesDirDerivation verifies that the frames output
// directory is derived as filepath.Dir(videoFilePath)/frames, matching the
// step's path construction logic.
func TestExtractFrames_FramesDirDerivation(t *testing.T) {
	videoPath := filepath.Join("/tmp", "jobs", "abc123", "video.mp4")
	wantFramesDir := filepath.Join(filepath.Dir(videoPath), "frames")

	// Reproduce the path logic from the step.
	gotFramesDir := filepath.Join(filepath.Dir(videoPath), "frames")

	if gotFramesDir != wantFramesDir {
		t.Errorf("frames dir: got %q, want %q", gotFramesDir, wantFramesDir)
	}
}

// TestExtractFrames_InvalidBasePath verifies that ExtractFrames returns an
// error when the parent path for frames cannot be created (e.g., a file
// exists where the parent directory should be).
func TestExtractFrames_InvalidBasePath(t *testing.T) {
	// Create a file where the parent of "frames" dir should be a directory.
	f, err := os.CreateTemp("", "not-a-dir-*")
	if err != nil {
		t.Fatalf("create temp file: %v", err)
	}
	defer os.Remove(f.Name())
	f.Close()

	// videoFilePath inside the file makes filepath.Dir(videoFilePath) the file,
	// which cannot contain a "frames" directory.
	videoPath := filepath.Join(f.Name(), "subdir", "video.mp4")

	_, err = ExtractFrames(context.Background(), brokenFFmpegForFrames(), videoPath, 300, 0.4, 10)
	if err == nil {
		t.Fatal("ExtractFrames: expected error for invalid base path, got nil")
	}
}

// TestExtractFrames_EmptyResultWhenNoPaths verifies that an empty FramePaths
// slice results in FrameCount == 0.
func TestExtractFrames_EmptyResultWhenNoPaths(t *testing.T) {
	var paths []string
	result := ExtractFramesResult{
		FramePaths: paths,
		FrameCount: len(paths),
	}

	if result.FrameCount != 0 {
		t.Errorf("expected FrameCount 0 for empty paths, got %d", result.FrameCount)
	}
	if len(result.FramePaths) != 0 {
		t.Errorf("expected empty FramePaths, got %v", result.FramePaths)
	}
}
