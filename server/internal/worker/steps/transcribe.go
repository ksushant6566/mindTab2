package steps

import (
	"context"
	"encoding/json"
	"fmt"
	"path/filepath"

	"github.com/ksushant6566/mindtab/server/internal/providers"
	"github.com/ksushant6566/mindtab/server/internal/providers/transcription"
	"github.com/ksushant6566/mindtab/server/internal/services"
	"github.com/ksushant6566/mindtab/server/internal/worker"
)

// TranscribeResult holds the transcript text and its source.
type TranscribeResult struct {
	Transcript       string `json:"transcript"`
	TranscriptSource string `json:"transcript_source"`
}

// Transcribe produces a transcript for a YouTube video.
//
// Primary path (hasCaptions == true): fetch captions via yt-dlp.
// Fallback: extract audio with ffmpeg, then transcribe with the transcription chain.
func Transcribe(
	ctx context.Context,
	ytdlp *services.YTDLP,
	ffmpeg *services.FFmpeg,
	transcriptionChain *providers.Chain[transcription.TranscriptionProvider],
	sourceURL string,
	videoFilePath string,
	hasCaptions bool,
) (*worker.StepResult, error) {
	// Primary: try yt-dlp captions.
	if hasCaptions {
		captionsDir := filepath.Dir(videoFilePath)
		captions, err := ytdlp.GetCaptions(ctx, sourceURL, "en", captionsDir)
		if err != nil {
			return nil, fmt.Errorf("transcribe: get captions: %w", err)
		}
		if captions != "" {
			result := TranscribeResult{
				Transcript:       captions,
				TranscriptSource: "captions",
			}
			data, _ := json.Marshal(result)
			return &worker.StepResult{Data: data}, nil
		}
		// Empty captions — fall through to audio transcription.
	}

	// Fallback: extract audio and transcribe with Whisper.
	audioPath := filepath.Join(filepath.Dir(videoFilePath), "audio.opus")
	if err := ffmpeg.ExtractAudio(ctx, videoFilePath, audioPath); err != nil {
		return nil, fmt.Errorf("transcribe: extract audio: %w", err)
	}

	var transcript string
	err := transcriptionChain.Execute(func(_ string, provider transcription.TranscriptionProvider) error {
		res, callErr := provider.Transcribe(ctx, audioPath)
		if callErr == nil {
			transcript = res.Text
		}
		return callErr
	})
	if err != nil {
		return nil, fmt.Errorf("transcribe: %w", err)
	}

	result := TranscribeResult{
		Transcript:       transcript,
		TranscriptSource: "whisper",
	}
	data, _ := json.Marshal(result)
	return &worker.StepResult{Data: data}, nil
}
