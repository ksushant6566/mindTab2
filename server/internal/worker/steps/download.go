package steps

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"

	"github.com/google/uuid"
	"github.com/ksushant6566/mindtab/server/internal/services"
	"github.com/ksushant6566/mindtab/server/internal/worker"
)

// DownloadResult holds the path to the downloaded video file.
type DownloadResult struct {
	VideoFilePath string `json:"video_file_path"`
}

// Download downloads the YouTube video to a job-scoped temp directory.
func Download(ctx context.Context, ytdlp *services.YTDLP, sourceURL string, tempBasePath string, jobID uuid.UUID, maxHeight int) (*worker.StepResult, error) {
	if sourceURL == "" {
		return nil, fmt.Errorf("download: no source URL")
	}

	outputDir := filepath.Join(tempBasePath, jobID.String())
	if err := os.MkdirAll(outputDir, 0o755); err != nil {
		return nil, fmt.Errorf("download: create output dir: %w", err)
	}

	videoPath, err := ytdlp.Download(ctx, sourceURL, outputDir, maxHeight)
	if err != nil {
		return nil, fmt.Errorf("download: %w", err)
	}

	result := DownloadResult{VideoFilePath: videoPath}
	data, _ := json.Marshal(result)
	return &worker.StepResult{Data: data}, nil
}
