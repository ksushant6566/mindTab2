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
	Transcript       string         `json:"transcript"`
	TranscriptSource string         `json:"transcript_source"`
	Status           EvidenceStatus `json:"status"`
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
	if hasCaptions && ytdlp != nil {
		captionsDir := filepath.Dir(videoFilePath)
		captions, err := ytdlp.GetCaptions(ctx, sourceURL, "en", captionsDir)
		if err != nil {
			return nil, fmt.Errorf("transcribe: get captions: %w", err)
		}
		if captions != "" {
			result := TranscribeResult{
				Transcript:       captions,
				TranscriptSource: "captions",
				Status:           successStatus("transcript"),
			}
			data, _ := json.Marshal(result)
			return &worker.StepResult{Data: data}, nil
		}
		// Empty captions — fall through to audio transcription.
	}

	// Fallback: extract audio and transcribe with Whisper.
	if ffmpeg == nil {
		return nil, fmt.Errorf("transcribe: ffmpeg is not configured")
	}
	if transcriptionChain == nil {
		return nil, fmt.Errorf("transcribe: transcription provider chain is not configured")
	}
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
		Status:           successStatus("transcript"),
	}
	data, _ := json.Marshal(result)
	return &worker.StepResult{Data: data}, nil
}

func TranscribeVideo(
	ctx context.Context,
	ytdlp *services.YTDLP,
	ffmpeg *services.FFmpeg,
	transcriptionChain *providers.Chain[transcription.TranscriptionProvider],
	video ResolvedVideo,
) (*worker.StepResult, error) {
	if video.LocalPath == "" {
		return nil, fmt.Errorf("transcribe: missing local video path")
	}
	if transcriptionChain == nil {
		return marshalStepResult(TranscribeResult{
			Status: skippedStatus("transcript", "transcription_not_configured", "transcription provider chain is not configured"),
		})
	}

	if ffmpeg == nil && !video.HasCaptions {
		return marshalStepResult(TranscribeResult{
			Status: failedStatus("transcript", "ffmpeg_not_configured", "ffmpeg is not configured"),
		})
	}

	result, err := Transcribe(ctx, ytdlp, ffmpeg, transcriptionChain, video.SourceURL, video.LocalPath, video.HasCaptions)
	if err != nil {
		return marshalStepResult(TranscribeResult{
			Status: failedStatus("transcript", "transcription_failed", err.Error()),
		})
	}

	var transcript TranscribeResult
	if err := json.Unmarshal(result.Data, &transcript); err != nil {
		return nil, fmt.Errorf("transcribe: parse transcript result: %w", err)
	}
	if transcript.Transcript == "" {
		transcript.Status = degradedStatus("transcript", "empty_transcript", "transcription completed with empty text")
	} else if transcript.Status.Status == "" {
		transcript.Status = successStatus("transcript")
	}
	return marshalStepResult(transcript)
}
