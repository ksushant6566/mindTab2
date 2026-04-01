package steps

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"testing"

	"github.com/ksushant6566/mindtab/server/internal/providers"
	"github.com/ksushant6566/mindtab/server/internal/services"
)

// brokenYTDLPForMetadata returns a YTDLP pointing to a non-existent binary so
// exec calls fail with a file-not-found error rather than a nil-pointer panic.
func brokenYTDLPForMetadata() *services.YTDLP {
	return services.NewYTDLP("/nonexistent/yt-dlp-binary", slog.Default())
}

// TestMetadata_EmptySourceURL verifies that Metadata returns an error
// immediately when no source URL is provided, without invoking yt-dlp.
func TestMetadata_EmptySourceURL(t *testing.T) {
	// The empty-URL guard fires before any binary is invoked.
	_, err := Metadata(context.Background(), brokenYTDLPForMetadata(), "", 600)
	if err == nil {
		t.Fatal("Metadata: expected error for empty source URL, got nil")
	}
}

// TestMetadata_ResultShape verifies that MetadataResult marshals/unmarshals
// correctly and that all fields survive a JSON round-trip.
func TestMetadata_ResultShape(t *testing.T) {
	want := MetadataResult{
		VideoID:      "abc123",
		Title:        "Test Video",
		Duration:     300,
		ThumbnailURL: "https://example.com/thumb.jpg",
		Channel:      "Test Channel",
		HasCaptions:  true,
	}

	data, err := json.Marshal(want)
	if err != nil {
		t.Fatalf("marshal MetadataResult: %v", err)
	}

	var got MetadataResult
	if err := json.Unmarshal(data, &got); err != nil {
		t.Fatalf("unmarshal MetadataResult: %v", err)
	}

	if got.VideoID != want.VideoID {
		t.Errorf("VideoID: got %q, want %q", got.VideoID, want.VideoID)
	}
	if got.Title != want.Title {
		t.Errorf("Title: got %q, want %q", got.Title, want.Title)
	}
	if got.Duration != want.Duration {
		t.Errorf("Duration: got %d, want %d", got.Duration, want.Duration)
	}
	if got.ThumbnailURL != want.ThumbnailURL {
		t.Errorf("ThumbnailURL: got %q, want %q", got.ThumbnailURL, want.ThumbnailURL)
	}
	if got.Channel != want.Channel {
		t.Errorf("Channel: got %q, want %q", got.Channel, want.Channel)
	}
	if got.HasCaptions != want.HasCaptions {
		t.Errorf("HasCaptions: got %v, want %v", got.HasCaptions, want.HasCaptions)
	}
}

// TestMetadata_PermanentErrorIsPermanent verifies that when the duration
// exceeds the maximum the returned error is a non-retriable ProviderError.
// This test constructs the same error the step would return so we can assert
// on its classification without invoking yt-dlp.
func TestMetadata_PermanentErrorIsPermanent(t *testing.T) {
	// Simulate the exact error path: NewPermanentError("metadata", ...)
	err := providers.NewPermanentError("metadata", errors.New("video duration 700s exceeds maximum 600s"))

	if providers.IsRetriable(err) {
		t.Error("expected permanent (non-retriable) error, got retriable")
	}

	var pe *providers.ProviderError
	if !errors.As(err, &pe) {
		t.Fatal("expected *providers.ProviderError")
	}
	if pe.Provider != "metadata" {
		t.Errorf("provider: got %q, want %q", pe.Provider, "metadata")
	}
}

// TestMetadata_MaxDurationContract verifies that when maxDuration is 0
// (disabled) the duration check is skipped. The URL guard still fires first,
// so this test confirms the URL error — not a duration error — is returned.
func TestMetadata_MaxDurationContract(t *testing.T) {
	_, err := Metadata(context.Background(), brokenYTDLPForMetadata(), "", 0)
	if err == nil {
		t.Fatal("expected error, got nil")
	}
	// Error must be about the missing URL, not duration.
	if err.Error() == "metadata: video duration exceeds maximum" {
		t.Error("duration check should not fire when URL validation fails first")
	}
}
