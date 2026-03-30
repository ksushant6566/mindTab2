package services

import (
	"context"
	"fmt"
	"log/slog"
	"math"
	"os/exec"
	"path/filepath"
	"sort"
)

// FFmpeg wraps the ffmpeg binary for video processing.
type FFmpeg struct {
	binPath string
	logger  *slog.Logger
}

// NewFFmpeg creates a new FFmpeg service.
func NewFFmpeg(binPath string, logger *slog.Logger) *FFmpeg {
	return &FFmpeg{binPath: binPath, logger: logger}
}

// ExtractFrames extracts scene-change frames from a video file.
// It applies a cap of framesPerMinCap * duration_minutes frames, downsampling uniformly if exceeded.
// Returns paths to the extracted JPEG frames.
func (f *FFmpeg) ExtractFrames(ctx context.Context, videoPath, outputDir string, sceneThreshold float64, framesPerMinCap int, durationSec int) ([]string, error) {
	outputPattern := filepath.Join(outputDir, "frame_%05d.jpg")

	// Build the vf filter: scene detection + scale to 360p
	vfFilter := fmt.Sprintf("select='gt(scene,%.3f)',scale=-1:360", sceneThreshold)

	args := []string{
		"-i", videoPath,
		"-vf", vfFilter,
		"-vsync", "vfr",
		"-q:v", "2",
		outputPattern,
	}

	cmd := exec.CommandContext(ctx, f.binPath, args...)
	f.logger.Debug("extracting frames", "video", videoPath, "threshold", sceneThreshold)

	if out, err := cmd.CombinedOutput(); err != nil {
		return nil, fmt.Errorf("ffmpeg extract frames: %w\noutput: %s", err, string(out))
	}

	// Collect output files
	matches, err := filepath.Glob(filepath.Join(outputDir, "frame_*.jpg"))
	if err != nil {
		return nil, fmt.Errorf("glob frames: %w", err)
	}
	sort.Strings(matches)

	// Apply per-minute cap
	if framesPerMinCap > 0 && durationSec > 0 {
		durationMin := math.Max(1, float64(durationSec)/60.0)
		cap := int(math.Ceil(durationMin * float64(framesPerMinCap)))
		if len(matches) > cap {
			f.logger.Debug("downsampling frames", "original", len(matches), "cap", cap)
			matches = uniformDownsample(matches, cap)
		}
	}

	return matches, nil
}

// ExtractAudio extracts audio from a video file as Opus at 48kbps.
func (f *FFmpeg) ExtractAudio(ctx context.Context, videoPath, outputPath string) error {
	args := []string{
		"-i", videoPath,
		"-vn",
		"-c:a", "libopus",
		"-b:a", "48k",
		"-y",
		outputPath,
	}

	cmd := exec.CommandContext(ctx, f.binPath, args...)
	f.logger.Debug("extracting audio", "video", videoPath, "output", outputPath)

	if out, err := cmd.CombinedOutput(); err != nil {
		return fmt.Errorf("ffmpeg extract audio: %w\noutput: %s", err, string(out))
	}

	return nil
}

// uniformDownsample selects n items uniformly spaced from items.
func uniformDownsample(items []string, n int) []string {
	if n <= 0 {
		return nil
	}
	if n >= len(items) {
		return items
	}

	result := make([]string, n)
	for i := 0; i < n; i++ {
		idx := int(math.Round(float64(i) * float64(len(items)-1) / float64(n-1)))
		if idx >= len(items) {
			idx = len(items) - 1
		}
		result[i] = items[idx]
	}
	return result
}
