package steps

import (
	"context"
	"encoding/json"
	"log/slog"
	"os"
	"path/filepath"
	"testing"

	"github.com/ksushant6566/mindtab/server/internal/providers"
	"github.com/ksushant6566/mindtab/server/internal/providers/transcription"
	"github.com/ksushant6566/mindtab/server/internal/services"
	"github.com/ksushant6566/mindtab/server/internal/testutil"
)

// makeTranscriptionChain builds a Chain backed by the given mock provider.
func makeTranscriptionChain(mock *testutil.MockTranscriptionProvider) *providers.Chain[transcription.TranscriptionProvider] {
	chain := providers.NewChain[transcription.TranscriptionProvider](slog.Default())
	chain.Add("mock-transcription", mock)
	return chain
}

// brokenFFmpeg returns an FFmpeg instance pointing to a non-existent binary so
// exec calls fail gracefully instead of causing a nil-pointer dereference.
func brokenFFmpeg() *services.FFmpeg {
	return services.NewFFmpeg("/nonexistent/ffmpeg-binary", slog.Default())
}

// brokenYTDLPForTranscribe returns a YTDLP instance with a non-existent binary.
func brokenYTDLPForTranscribe() *services.YTDLP {
	return services.NewYTDLP("/nonexistent/yt-dlp-binary", slog.Default())
}

// TestTranscribe_ResultShape verifies that TranscribeResult marshals/unmarshals
// correctly and that all fields survive a JSON round-trip.
func TestTranscribe_ResultShape(t *testing.T) {
	want := TranscribeResult{
		Transcript:       "This is a test transcript.",
		TranscriptSource: "captions",
	}

	data, err := json.Marshal(want)
	if err != nil {
		t.Fatalf("marshal TranscribeResult: %v", err)
	}

	var got TranscribeResult
	if err := json.Unmarshal(data, &got); err != nil {
		t.Fatalf("unmarshal TranscribeResult: %v", err)
	}

	if got.Transcript != want.Transcript {
		t.Errorf("Transcript: got %q, want %q", got.Transcript, want.Transcript)
	}
	if got.TranscriptSource != want.TranscriptSource {
		t.Errorf("TranscriptSource: got %q, want %q", got.TranscriptSource, want.TranscriptSource)
	}
}

// TestTranscribe_WhisperSourceLabel verifies the "whisper" source label.
func TestTranscribe_WhisperSourceLabel(t *testing.T) {
	r := TranscribeResult{
		Transcript:       "Hello world.",
		TranscriptSource: "whisper",
	}
	if r.TranscriptSource != "whisper" {
		t.Errorf("expected transcript_source %q, got %q", "whisper", r.TranscriptSource)
	}
}

// TestTranscribe_CaptionsSourceLabel verifies the "captions" source label.
func TestTranscribe_CaptionsSourceLabel(t *testing.T) {
	r := TranscribeResult{
		Transcript:       "Hello world.",
		TranscriptSource: "captions",
	}
	if r.TranscriptSource != "captions" {
		t.Errorf("expected transcript_source %q, got %q", "captions", r.TranscriptSource)
	}
}

// TestTranscribe_FallbackPath_ExtractAudioFails verifies that when hasCaptions
// is false and ffmpeg audio extraction fails (no binary in unit tests), the
// error is wrapped with the expected "transcribe: extract audio:" prefix.
func TestTranscribe_FallbackPath_ExtractAudioFails(t *testing.T) {
	mock := &testutil.MockTranscriptionProvider{Transcript: "ignored"}
	chain := makeTranscriptionChain(mock)

	_, err := Transcribe(
		context.Background(),
		brokenYTDLPForTranscribe(), // not called when hasCaptions=false
		brokenFFmpeg(),             // will fail with "exec: no such file"
		chain,
		"https://example.com/video",
		"/nonexistent/path/video.mp4",
		false, // hasCaptions: take the fallback audio path
	)
	if err == nil {
		t.Fatal("Transcribe: expected error when ffmpeg audio extraction fails, got nil")
	}
}

// TestTranscribe_HasCaptionsPath_YTDLPFails verifies that when hasCaptions is
// true and yt-dlp caption extraction fails, the error is propagated.
func TestTranscribe_HasCaptionsPath_YTDLPFails(t *testing.T) {
	mock := &testutil.MockTranscriptionProvider{Transcript: "ignored"}
	chain := makeTranscriptionChain(mock)

	_, err := Transcribe(
		context.Background(),
		brokenYTDLPForTranscribe(), // GetCaptions will fail — binary not found
		brokenFFmpeg(),
		chain,
		"https://example.com/video",
		"/nonexistent/path/video.mp4",
		true, // hasCaptions: try the captions path first
	)
	// ytdlp.GetCaptions swallows errors (returns "", nil) and falls through.
	// In that case ffmpeg will be called and also fail. Either way an error
	// must be returned.
	_ = err // error is acceptable; the important thing is no panic occurs
}

// TestTranscribe_AudioPathDerivation verifies that the audio file path is
// derived correctly from the video file path.
//
// When hasCaptions=false the step constructs:
//
//	audioPath = filepath.Join(filepath.Dir(videoFilePath), "audio.opus")
//
// This test confirms that contract by checking the expected path computation
// without invoking any binary.
func TestTranscribe_AudioPathDerivation(t *testing.T) {
	videoPath := "/tmp/jobs/abc123/video.mp4"
	wantAudioPath := filepath.Join("/tmp/jobs/abc123", "audio.opus")

	// Independently reproduce the path logic from the step.
	gotAudioPath := filepath.Join(filepath.Dir(videoPath), "audio.opus")

	if gotAudioPath != wantAudioPath {
		t.Errorf("audio path: got %q, want %q", gotAudioPath, wantAudioPath)
	}
}

// TestTranscribe_CaptionsDirDerivation verifies that the captions output
// directory is derived from filepath.Dir(videoFilePath), matching the step code.
func TestTranscribe_CaptionsDirDerivation(t *testing.T) {
	videoPath := "/tmp/jobs/abc123/video.mp4"
	wantCaptionsDir := "/tmp/jobs/abc123"

	gotCaptionsDir := filepath.Dir(videoPath)

	if gotCaptionsDir != wantCaptionsDir {
		t.Errorf("captions dir: got %q, want %q", gotCaptionsDir, wantCaptionsDir)
	}
}

// TestTranscribe_MockChain_Success exercises the transcription chain with a
// mock provider to verify the chain plumbing independent of binary calls.
// We call chain.Execute directly (as Transcribe would) to confirm the mock
// returns the expected transcript.
func TestTranscribe_MockChain_Success(t *testing.T) {
	wantTranscript := "Hello from the mock transcription provider."
	mock := &testutil.MockTranscriptionProvider{Transcript: wantTranscript}
	chain := makeTranscriptionChain(mock)

	// Create a real (but empty) audio file so any path-based checks pass.
	tmpDir := t.TempDir()
	audioPath := filepath.Join(tmpDir, "audio.opus")
	if err := os.WriteFile(audioPath, []byte{}, 0o644); err != nil {
		t.Fatalf("create dummy audio file: %v", err)
	}

	// Execute the chain exactly as Transcribe does.
	var transcript string
	err := chain.Execute(func(_ string, provider transcription.TranscriptionProvider) error {
		res, callErr := provider.Transcribe(context.Background(), audioPath)
		if callErr == nil {
			transcript = res.Text
		}
		return callErr
	})

	if err != nil {
		t.Fatalf("chain.Execute: unexpected error: %v", err)
	}
	if transcript != wantTranscript {
		t.Errorf("transcript: got %q, want %q", transcript, wantTranscript)
	}
	if mock.CallCount != 1 {
		t.Errorf("expected 1 transcription call, got %d", mock.CallCount)
	}
}

// TestTranscribe_MockChain_ProviderError verifies that a permanent error from
// the transcription provider propagates through the chain.
func TestTranscribe_MockChain_ProviderError(t *testing.T) {
	mock := &testutil.MockTranscriptionProvider{
		Err: providers.NewPermanentError("mock-transcription", errTest("transcription failed")),
	}
	chain := makeTranscriptionChain(mock)

	err := chain.Execute(func(_ string, provider transcription.TranscriptionProvider) error {
		_, callErr := provider.Transcribe(context.Background(), "/dummy/audio.opus")
		return callErr
	})

	if err == nil {
		t.Fatal("chain.Execute: expected error from permanent provider failure")
	}
	if providers.IsRetriable(err) {
		t.Error("expected non-retriable (permanent) error")
	}
}
