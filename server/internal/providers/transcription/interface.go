package transcription

import "context"

type TranscriptionResult struct {
	Text string
}

type TranscriptionProvider interface {
	Transcribe(ctx context.Context, audioPath string) (*TranscriptionResult, error)
	Name() string
}
