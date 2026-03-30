package services

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
)

// VideoMetadata holds extracted metadata for a YouTube video.
type VideoMetadata struct {
	ID           string
	Title        string
	Duration     int
	ThumbnailURL string
	Channel      string
	HasCaptions  bool
}

// YTDLP wraps the yt-dlp binary.
type YTDLP struct {
	binPath string
	logger  *slog.Logger
}

// NewYTDLP creates a new YTDLP service.
func NewYTDLP(binPath string, logger *slog.Logger) *YTDLP {
	return &YTDLP{binPath: binPath, logger: logger}
}

// ytdlpJSON is the subset of yt-dlp JSON output we care about.
type ytdlpJSON struct {
	ID         string  `json:"id"`
	Title      string  `json:"title"`
	Duration   float64 `json:"duration"`
	Thumbnail  string  `json:"thumbnail"`
	Channel    string  `json:"channel"`
	Subtitles  map[string]interface{} `json:"subtitles"`
	AutoCaptions map[string]interface{} `json:"automatic_captions"`
}

// GetMetadata runs yt-dlp --dump-json --no-download and returns VideoMetadata.
func (y *YTDLP) GetMetadata(ctx context.Context, url string) (*VideoMetadata, error) {
	args := []string{"--dump-json", "--no-download", url}
	cmd := exec.CommandContext(ctx, y.binPath, args...)

	y.logger.Debug("running yt-dlp metadata", "url", url)

	out, err := cmd.Output()
	if err != nil {
		return nil, fmt.Errorf("yt-dlp metadata: %w", err)
	}

	var raw ytdlpJSON
	if err := json.Unmarshal(out, &raw); err != nil {
		return nil, fmt.Errorf("yt-dlp parse json: %w", err)
	}

	hasCaptions := len(raw.Subtitles) > 0 || len(raw.AutoCaptions) > 0

	return &VideoMetadata{
		ID:           raw.ID,
		Title:        raw.Title,
		Duration:     int(raw.Duration),
		ThumbnailURL: raw.Thumbnail,
		Channel:      raw.Channel,
		HasCaptions:  hasCaptions,
	}, nil
}

// Download downloads the video at the given URL to outputDir, limited to maxHeight.
// Returns the path to the downloaded file.
func (y *YTDLP) Download(ctx context.Context, url, outputDir string, maxHeight int) (string, error) {
	format := fmt.Sprintf("bestvideo[height<=%d][ext=mp4]+bestaudio[ext=m4a]/best[height<=%d][ext=mp4]/best[height<=%d]/best", maxHeight, maxHeight, maxHeight)
	outputTemplate := filepath.Join(outputDir, "%(id)s.%(ext)s")

	args := []string{
		"-f", format,
		"-o", outputTemplate,
		"--no-playlist",
		url,
	}

	cmd := exec.CommandContext(ctx, y.binPath, args...)
	y.logger.Debug("running yt-dlp download", "url", url, "maxHeight", maxHeight)

	if out, err := cmd.CombinedOutput(); err != nil {
		return "", fmt.Errorf("yt-dlp download: %w\noutput: %s", err, string(out))
	}

	// Find the downloaded file
	matches, err := filepath.Glob(filepath.Join(outputDir, "*.mp4"))
	if err != nil {
		return "", fmt.Errorf("glob output dir: %w", err)
	}
	if len(matches) == 0 {
		// Try any video extension
		for _, ext := range []string{"*.mkv", "*.webm", "*.mov", "*.avi"} {
			m, _ := filepath.Glob(filepath.Join(outputDir, ext))
			matches = append(matches, m...)
		}
	}
	if len(matches) == 0 {
		return "", fmt.Errorf("yt-dlp download: no output file found in %s", outputDir)
	}

	return matches[0], nil
}

// GetCaptions extracts captions for the given URL and language, returns plain text.
func (y *YTDLP) GetCaptions(ctx context.Context, url, lang, outputDir string) (string, error) {
	args := []string{
		"--write-auto-sub",
		"--write-sub",
		"--sub-lang", lang,
		"--sub-format", "vtt",
		"--skip-download",
		"-o", filepath.Join(outputDir, "%(id)s.%(ext)s"),
		url,
	}

	cmd := exec.CommandContext(ctx, y.binPath, args...)
	y.logger.Debug("running yt-dlp captions", "url", url, "lang", lang)

	if out, err := cmd.CombinedOutput(); err != nil {
		y.logger.Warn("yt-dlp caption extraction failed", "error", err, "output", string(out))
		return "", nil // Not an error — fallback to Whisper
	}

	// Find the VTT file
	matches, err := filepath.Glob(filepath.Join(outputDir, "*.vtt"))
	if err != nil || len(matches) == 0 {
		return "", nil // No captions found
	}

	data, err := os.ReadFile(matches[0])
	if err != nil {
		return "", fmt.Errorf("read vtt file: %w", err)
	}

	return cleanVTT(string(data)), nil
}

// cleanVTT strips VTT headers, timestamps, and HTML tags, then deduplicates lines.
func cleanVTT(vtt string) string {
	lines := strings.Split(vtt, "\n")
	// Regex patterns
	timestampRe := regexp.MustCompile(`^\d{2}:\d{2}:\d{2}\.\d{3}\s*-->\s*\d{2}:\d{2}:\d{2}\.\d{3}`)
	headerRe := regexp.MustCompile(`^WEBVTT|^NOTE|^STYLE|^REGION`)
	sequenceRe := regexp.MustCompile(`^\d+$`)

	seen := make(map[string]bool)
	var result []string

	for _, line := range lines {
		trimmed := strings.TrimSpace(line)

		// Skip empty lines, headers, timestamps, and sequence numbers
		if trimmed == "" {
			continue
		}
		if headerRe.MatchString(trimmed) {
			continue
		}
		if timestampRe.MatchString(trimmed) {
			continue
		}
		if sequenceRe.MatchString(trimmed) {
			continue
		}

		// Strip HTML tags
		cleaned := stripHTMLTags(trimmed)
		cleaned = strings.TrimSpace(cleaned)
		if cleaned == "" {
			continue
		}

		// Deduplicate
		if !seen[cleaned] {
			seen[cleaned] = true
			result = append(result, cleaned)
		}
	}

	return strings.Join(result, " ")
}

// stripHTMLTags removes HTML/XML tags from s.
func stripHTMLTags(s string) string {
	tagRe := regexp.MustCompile(`<[^>]+>`)
	return tagRe.ReplaceAllString(s, "")
}
