package steps

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/ksushant6566/mindtab/server/internal/services"
	"github.com/ksushant6566/mindtab/server/internal/worker"
)

// MetadataResult holds YouTube video metadata from yt-dlp.
type MetadataResult struct {
	VideoID      string `json:"video_id"`
	Title        string `json:"title"`
	Duration     int    `json:"duration"`
	ThumbnailURL string `json:"thumbnail_url"`
	Channel      string `json:"channel"`
	HasCaptions  bool   `json:"has_captions"`
}

// Metadata extracts YouTube video metadata via yt-dlp.
// Returns a permanent error if the video exceeds maxDuration seconds.
func Metadata(ctx context.Context, ytdlp *services.YTDLP, sourceURL string, maxDuration int) (*worker.StepResult, error) {
	if sourceURL == "" {
		return nil, fmt.Errorf("metadata: no source URL")
	}

	meta, err := ytdlp.GetMetadata(ctx, sourceURL)
	if err != nil {
		return nil, fmt.Errorf("metadata: %w", err)
	}

	if maxDuration > 0 && meta.Duration > maxDuration {
		return nil, fmt.Errorf("metadata: video duration %ds exceeds maximum %ds", meta.Duration, maxDuration)
	}

	result := MetadataResult{
		VideoID:      meta.ID,
		Title:        meta.Title,
		Duration:     meta.Duration,
		ThumbnailURL: meta.ThumbnailURL,
		Channel:      meta.Channel,
		HasCaptions:  meta.HasCaptions,
	}

	data, _ := json.Marshal(result)
	return &worker.StepResult{Data: data}, nil
}
