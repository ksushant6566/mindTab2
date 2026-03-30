package services

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

type VideoMetadata struct {
	ID           string `json:"id"`
	Title        string `json:"title"`
	Duration     int    `json:"duration"`
	ThumbnailURL string `json:"thumbnail"`
	Channel      string `json:"channel"`
	HasCaptions  bool
}

type YTDLP struct {
	binPath string
	logger  *slog.Logger
}

func NewYTDLP(binPath string, logger *slog.Logger) *YTDLP {
	return &YTDLP{binPath: binPath, logger: logger}
}

// GetMetadata extracts video metadata without downloading.
func (y *YTDLP) GetMetadata(ctx context.Context, url string) (*VideoMetadata, error) {
	cmd := exec.CommandContext(ctx, y.binPath, "--dump-json", "--no-download", url)
	out, err := cmd.Output()
	if err != nil {
		return nil, fmt.Errorf("yt-dlp metadata failed: %w", err)
	}

	var raw struct {
		ID                string         `json:"id"`
		Title             string         `json:"title"`
		Duration          int            `json:"duration"`
		Thumbnail         string         `json:"thumbnail"`
		Channel           string         `json:"channel"`
		Subtitles         map[string]any `json:"subtitles"`
		AutomaticCaptions map[string]any `json:"automatic_captions"`
	}
	if err := json.Unmarshal(out, &raw); err != nil {
		return nil, fmt.Errorf("yt-dlp metadata parse failed: %w", err)
	}

	hasCaptions := len(raw.Subtitles) > 0 || len(raw.AutomaticCaptions) > 0

	return &VideoMetadata{
		ID:           raw.ID,
		Title:        raw.Title,
		Duration:     raw.Duration,
		ThumbnailURL: raw.Thumbnail,
		Channel:      raw.Channel,
		HasCaptions:  hasCaptions,
	}, nil
}

// Download downloads the video at the specified max quality.
func (y *YTDLP) Download(ctx context.Context, url string, outputDir string, maxHeight int) (string, error) {
	if err := os.MkdirAll(outputDir, 0755); err != nil {
		return "", fmt.Errorf("create output dir: %w", err)
	}

	outputTemplate := filepath.Join(outputDir, "video.%(ext)s")
	formatStr := fmt.Sprintf("bestvideo[height<=%d]+bestaudio/best[height<=%d]", maxHeight, maxHeight)

	cmd := exec.CommandContext(ctx, y.binPath,
		"-f", formatStr,
		"--merge-output-format", "mp4",
		"-o", outputTemplate,
		"--no-playlist",
		url,
	)
	if out, err := cmd.CombinedOutput(); err != nil {
		return "", fmt.Errorf("yt-dlp download failed: %w\noutput: %s", err, string(out))
	}

	// Find the downloaded file
	matches, err := filepath.Glob(filepath.Join(outputDir, "video.*"))
	if err != nil || len(matches) == 0 {
		return "", fmt.Errorf("downloaded video file not found in %s", outputDir)
	}
	return matches[0], nil
}

// GetCaptions extracts captions/subtitles for the given language.
// Returns the caption text, or empty string if no captions available.
func (y *YTDLP) GetCaptions(ctx context.Context, url string, lang string, outputDir string) (string, error) {
	if err := os.MkdirAll(outputDir, 0755); err != nil {
		return "", fmt.Errorf("create output dir: %w", err)
	}

	outputTemplate := filepath.Join(outputDir, "subs")
	cmd := exec.CommandContext(ctx, y.binPath,
		"--write-auto-sub",
		"--write-sub",
		"--sub-lang", lang,
		"--sub-format", "vtt",
		"--skip-download",
		"-o", outputTemplate,
		url,
	)
	if out, err := cmd.CombinedOutput(); err != nil {
		y.logger.Warn("yt-dlp caption extraction failed", "error", err, "output", string(out))
		return "", nil // Not an error — fallback to Whisper
	}

	// Find the subtitle file
	matches, err := filepath.Glob(filepath.Join(outputDir, "subs*.vtt"))
	if err != nil || len(matches) == 0 {
		return "", nil // No captions found
	}

	data, err := os.ReadFile(matches[0])
	if err != nil {
		return "", fmt.Errorf("read caption file: %w", err)
	}

	return cleanVTT(string(data)), nil
}

// cleanVTT strips VTT headers and timestamps, returning plain text.
func cleanVTT(vtt string) string {
	lines := strings.Split(vtt, "\n")
	var text []string
	seen := make(map[string]bool)

	for _, line := range lines {
		line = strings.TrimSpace(line)
		// Skip VTT headers, timestamps, and empty lines
		if line == "" || line == "WEBVTT" || strings.Contains(line, "-->") ||
			strings.HasPrefix(line, "Kind:") || strings.HasPrefix(line, "Language:") ||
			strings.HasPrefix(line, "NOTE") {
			continue
		}
		// Skip numeric cue identifiers
		if _, err := fmt.Sscanf(line, "%d", new(int)); err == nil && !strings.Contains(line, " ") {
			continue
		}
		// Strip HTML tags from captions
		cleaned := stripHTMLTags(line)
		if cleaned != "" && !seen[cleaned] {
			seen[cleaned] = true
			text = append(text, cleaned)
		}
	}
	return strings.Join(text, " ")
}

// stripHTMLTags removes HTML tags from a string.
func stripHTMLTags(s string) string {
	var result strings.Builder
	inTag := false
	for _, r := range s {
		if r == '<' {
			inTag = true
			continue
		}
		if r == '>' {
			inTag = false
			continue
		}
		if !inTag {
			result.WriteRune(r)
		}
	}
	return strings.TrimSpace(result.String())
}
