package steps

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"

	"github.com/ksushant6566/mindtab/server/internal/services"
	"github.com/ksushant6566/mindtab/server/internal/worker"
)

// ExtractFramesResult holds the paths to extracted video frames.
type ExtractFramesResult struct {
	FramePaths []string `json:"frame_paths"`
	FrameCount int      `json:"frame_count"`
}

// ExtractFrames extracts scene-change frames from the downloaded video.
func ExtractFrames(
	ctx context.Context,
	ffmpeg *services.FFmpeg,
	videoFilePath string,
	durationSec int,
	sceneThreshold float64,
	framesPerMinCap int,
) (*worker.StepResult, error) {
	framesDir := filepath.Join(filepath.Dir(videoFilePath), "frames")
	if err := os.MkdirAll(framesDir, 0o755); err != nil {
		return nil, fmt.Errorf("extract_frames: create frames dir: %w", err)
	}

	paths, err := ffmpeg.ExtractFrames(ctx, videoFilePath, framesDir, sceneThreshold, framesPerMinCap, durationSec)
	if err != nil {
		return nil, fmt.Errorf("extract_frames: %w", err)
	}

	result := ExtractFramesResult{
		FramePaths: paths,
		FrameCount: len(paths),
	}
	data, _ := json.Marshal(result)
	return &worker.StepResult{Data: data}, nil
}

func ExtractUniformFrames(
	ctx context.Context,
	ffmpeg *services.FFmpeg,
	videoFilePath string,
	durationSec int,
	frameCount int,
) (*worker.StepResult, error) {
	framesDir := filepath.Join(filepath.Dir(videoFilePath), "frames")
	if err := os.MkdirAll(framesDir, 0o755); err != nil {
		return nil, fmt.Errorf("extract_uniform_frames: create frames dir: %w", err)
	}

	paths, err := ffmpeg.ExtractUniformFrames(ctx, videoFilePath, framesDir, frameCount, durationSec)
	if err != nil {
		return nil, fmt.Errorf("extract_uniform_frames: %w", err)
	}

	result := ExtractFramesResult{
		FramePaths: paths,
		FrameCount: len(paths),
	}
	data, _ := json.Marshal(result)
	return &worker.StepResult{Data: data}, nil
}
