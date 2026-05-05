package steps

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"

	"github.com/ksushant6566/mindtab/server/internal/providers"
	"github.com/ksushant6566/mindtab/server/internal/services"
	"github.com/ksushant6566/mindtab/server/internal/worker"
)

var ErrVideoDurationExceeded = errors.New("video duration exceeds maximum")

// MetadataResult holds YouTube video metadata from yt-dlp.
type MetadataResult struct {
	VideoID      string         `json:"video_id"`
	Title        string         `json:"title"`
	Description  string         `json:"description,omitempty"`
	Duration     int            `json:"duration"`
	ThumbnailURL string         `json:"thumbnail_url"`
	Channel      string         `json:"channel"`
	HasCaptions  bool           `json:"has_captions"`
	Status       EvidenceStatus `json:"status"`
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
		return nil, providers.NewPermanentError("metadata", fmt.Errorf("%w: %ds exceeds maximum %ds", ErrVideoDurationExceeded, meta.Duration, maxDuration))
	}

	result := MetadataResult{
		VideoID:      meta.ID,
		Title:        meta.Title,
		Description:  meta.Description,
		Duration:     meta.Duration,
		ThumbnailURL: meta.ThumbnailURL,
		Channel:      meta.Channel,
		HasCaptions:  meta.HasCaptions,
		Status:       successStatus("metadata"),
	}

	data, _ := json.Marshal(result)
	return &worker.StepResult{Data: data}, nil
}

func DegradedMetadataResult(err error) (*worker.StepResult, error) {
	msg := "unknown error"
	if err != nil {
		msg = err.Error()
	}
	result := MetadataResult{
		Status: degradedStatus("metadata", "metadata_unavailable", msg),
	}
	data, marshalErr := json.Marshal(result)
	if marshalErr != nil {
		return nil, marshalErr
	}
	return &worker.StepResult{Data: data}, nil
}
