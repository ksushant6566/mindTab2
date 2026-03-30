package transcription

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"os"
	"path/filepath"
	"time"

	"github.com/ksushant6566/mindtab/server/internal/providers"
)

const groqTranscriptionURL = "https://api.groq.com/openai/v1/audio/transcriptions"

// GroqProvider implements TranscriptionProvider using Groq's Whisper API.
type GroqProvider struct {
	apiKey string
	client *http.Client
}

// NewGroqProvider creates a new GroqProvider with a 10-minute HTTP timeout.
func NewGroqProvider(apiKey string) *GroqProvider {
	return &GroqProvider{
		apiKey: apiKey,
		client: &http.Client{Timeout: 10 * time.Minute},
	}
}

// Name returns the provider identifier.
func (g *GroqProvider) Name() string {
	return "groq-whisper"
}

// Transcribe sends the audio file at audioPath to Groq Whisper and returns the transcript.
func (g *GroqProvider) Transcribe(ctx context.Context, audioPath string) (*TranscriptionResult, error) {
	f, err := os.Open(audioPath)
	if err != nil {
		return nil, fmt.Errorf("open audio file: %w", err)
	}
	defer f.Close()

	var body bytes.Buffer
	mw := multipart.NewWriter(&body)

	// Add the audio file field
	part, err := mw.CreateFormFile("file", filepath.Base(audioPath))
	if err != nil {
		return nil, fmt.Errorf("create form file: %w", err)
	}
	if _, err := io.Copy(part, f); err != nil {
		return nil, fmt.Errorf("copy audio data: %w", err)
	}

	// Add model field
	if err := mw.WriteField("model", "whisper-large-v3"); err != nil {
		return nil, fmt.Errorf("write model field: %w", err)
	}

	// Add response_format field
	if err := mw.WriteField("response_format", "text"); err != nil {
		return nil, fmt.Errorf("write response_format field: %w", err)
	}

	if err := mw.Close(); err != nil {
		return nil, fmt.Errorf("close multipart writer: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, groqTranscriptionURL, &body)
	if err != nil {
		return nil, fmt.Errorf("create request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+g.apiKey)
	req.Header.Set("Content-Type", mw.FormDataContentType())

	resp, err := g.client.Do(req)
	if err != nil {
		return nil, providers.NewRetriableError(g.Name(), fmt.Errorf("http request: %w", err))
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, providers.NewRetriableError(g.Name(), fmt.Errorf("read response body: %w", err))
	}

	switch {
	case resp.StatusCode == http.StatusOK:
		return &TranscriptionResult{Text: string(respBody)}, nil
	case resp.StatusCode == http.StatusUnauthorized || resp.StatusCode == http.StatusForbidden:
		return nil, providers.NewPermanentError(g.Name(), fmt.Errorf("auth error %d: %s", resp.StatusCode, string(respBody)))
	case resp.StatusCode == http.StatusTooManyRequests || resp.StatusCode >= 500:
		return nil, providers.NewRetriableError(g.Name(), fmt.Errorf("server error %d: %s", resp.StatusCode, string(respBody)))
	default:
		return nil, providers.NewPermanentError(g.Name(), fmt.Errorf("unexpected status %d: %s", resp.StatusCode, string(respBody)))
	}
}
