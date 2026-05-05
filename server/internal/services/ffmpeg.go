package services

import (
	"bytes"
	"context"
	"fmt"
	"log/slog"
	"math"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
)

// FFmpeg wraps the ffmpeg binary for video processing.
type FFmpeg struct {
	binPath string
	logger  *slog.Logger
}

// NewFFmpeg creates a new FFmpeg service.
func NewFFmpeg(binPath string, logger *slog.Logger) *FFmpeg {
	return &FFmpeg{binPath: binPath, logger: logger}
}

// ProbeDuration returns the media duration in whole seconds, rounded up.
func (f *FFmpeg) ProbeDuration(ctx context.Context, inputPath string) (int32, error) {
	args := []string{
		"-v", "error",
		"-show_entries", "format=duration",
		"-of", "default=noprint_wrappers=1:nokey=1",
		inputPath,
	}
	cmd := exec.CommandContext(ctx, f.ffprobePath(), args...)
	f.logger.Debug("probing media duration", "input", inputPath)

	out, err := cmd.CombinedOutput()
	if err != nil {
		return 0, fmt.Errorf("ffprobe duration: %w\noutput: %s", err, string(out))
	}

	raw := strings.TrimSpace(string(out))
	duration, err := strconv.ParseFloat(raw, 64)
	if err != nil || duration <= 0 || math.IsNaN(duration) || math.IsInf(duration, 0) {
		return 0, fmt.Errorf("ffprobe duration: invalid duration %q", raw)
	}

	return int32(math.Ceil(duration)), nil
}

func (f *FFmpeg) ffprobePath() string {
	if f.binPath == "" {
		return "ffprobe"
	}
	dir := filepath.Dir(f.binPath)
	base := filepath.Base(f.binPath)
	if strings.Contains(base, "ffmpeg") {
		return filepath.Join(dir, strings.Replace(base, "ffmpeg", "ffprobe", 1))
	}
	return "ffprobe"
}

// ExtractFrames extracts scene-change frames from a video file.
// It applies a cap of framesPerMinCap * duration_minutes frames, downsampling uniformly if exceeded.
// Returns paths to the extracted JPEG frames.
func (f *FFmpeg) ExtractFrames(ctx context.Context, videoPath, outputDir string, sceneThreshold float64, framesPerMinCap int, durationSec int) ([]string, error) {
	outputPattern := filepath.Join(outputDir, "frame_%05d.jpg")

	// Build the vf filter: scene detection + scale to 360p
	vfFilter := fmt.Sprintf("select='gt(scene,%.3f)',scale=-1:360", sceneThreshold)

	args := []string{
		"-i", videoPath,
		"-vf", vfFilter,
		"-vsync", "vfr",
		"-q:v", "2",
		outputPattern,
	}

	cmd := exec.CommandContext(ctx, f.binPath, args...)
	f.logger.Debug("extracting frames", "video", videoPath, "threshold", sceneThreshold)

	if out, err := cmd.CombinedOutput(); err != nil {
		return nil, fmt.Errorf("ffmpeg extract frames: %w\noutput: %s", err, string(out))
	}

	// Collect output files
	matches, err := filepath.Glob(filepath.Join(outputDir, "frame_*.jpg"))
	if err != nil {
		return nil, fmt.Errorf("glob frames: %w", err)
	}
	sort.Strings(matches)

	// Apply per-minute cap
	if framesPerMinCap > 0 && durationSec > 0 {
		durationMin := math.Max(1, float64(durationSec)/60.0)
		cap := int(math.Ceil(durationMin * float64(framesPerMinCap)))
		if len(matches) > cap {
			f.logger.Debug("downsampling frames", "original", len(matches), "cap", cap)
			matches = uniformDownsample(matches, cap)
		}
	}

	return matches, nil
}

// ExtractUniformFrames samples frames across the whole video timeline. This is
// useful for short social videos where scene-change extraction can return a
// single static-looking frame and miss the actual action.
func (f *FFmpeg) ExtractUniformFrames(ctx context.Context, videoPath, outputDir string, frameCount int, durationSec int) ([]string, error) {
	if frameCount <= 0 {
		return nil, nil
	}
	if err := os.MkdirAll(outputDir, 0o755); err != nil {
		return nil, fmt.Errorf("create uniform frames dir: %w", err)
	}
	stale, err := filepath.Glob(filepath.Join(outputDir, "frame_*.jpg"))
	if err != nil {
		return nil, fmt.Errorf("glob stale uniform frames: %w", err)
	}
	for _, path := range stale {
		if err := os.Remove(path); err != nil {
			return nil, fmt.Errorf("remove stale uniform frame %s: %w", path, err)
		}
	}

	outputPattern := filepath.Join(outputDir, "frame_%05d.jpg")
	duration := math.Max(1, float64(durationSec))
	fps := float64(frameCount) / duration
	vfFilter := fmt.Sprintf("fps=%f,scale=-1:360", fps)

	args := []string{
		"-i", videoPath,
		"-vf", vfFilter,
		"-frames:v", strconv.Itoa(frameCount),
		"-q:v", "2",
		"-y",
		outputPattern,
	}

	cmd := exec.CommandContext(ctx, f.binPath, args...)
	f.logger.Debug("extracting uniform frames", "video", videoPath, "frames", frameCount)
	if out, err := cmd.CombinedOutput(); err != nil {
		return nil, fmt.Errorf("ffmpeg extract uniform frames: %w\noutput: %s", err, string(out))
	}

	matches, err := filepath.Glob(filepath.Join(outputDir, "frame_*.jpg"))
	if err != nil {
		return nil, fmt.Errorf("glob uniform frames: %w", err)
	}
	sort.Strings(matches)
	if len(matches) > frameCount {
		matches = uniformDownsample(matches, frameCount)
	}
	return matches, nil
}

// ExtractAudio extracts audio from a video file as Opus at 48kbps.
func (f *FFmpeg) ExtractAudio(ctx context.Context, videoPath, outputPath string) error {
	args := []string{
		"-i", videoPath,
		"-vn",
		"-c:a", "libopus",
		"-b:a", "48k",
		"-y",
		outputPath,
	}

	cmd := exec.CommandContext(ctx, f.binPath, args...)
	f.logger.Debug("extracting audio", "video", videoPath, "output", outputPath)

	if out, err := cmd.CombinedOutput(); err != nil {
		return fmt.Errorf("ffmpeg extract audio: %w\noutput: %s", err, string(out))
	}

	return nil
}

// SilenceMarker is one [silence_start, silence_end] pair from ffmpeg's silencedetect filter.
type SilenceMarker struct {
	StartSec float64
	EndSec   float64
}

// DetectSilence runs ffmpeg with the silencedetect filter against the input file
// and returns sorted silence regions. noiseDB is the dB threshold below which
// audio is considered silence (e.g. -30); minDurationSec is the minimum length
// of a silence region to report (e.g. 0.5).
func (f *FFmpeg) DetectSilence(ctx context.Context, inputPath string, noiseDB float64, minDurationSec float64) ([]SilenceMarker, error) {
	// ffmpeg writes silencedetect output to STDERR
	args := []string{
		"-i", inputPath,
		"-af", fmt.Sprintf("silencedetect=noise=%fdB:d=%f", noiseDB, minDurationSec),
		"-f", "null", "-",
	}
	cmd := exec.CommandContext(ctx, f.binPath, args...)
	var stderr bytes.Buffer
	cmd.Stderr = &stderr
	f.logger.Debug("detecting silence", "input", inputPath, "noiseDB", noiseDB, "minDuration", minDurationSec)
	if err := cmd.Run(); err != nil {
		return nil, fmt.Errorf("ffmpeg silencedetect: %w (stderr: %s)", err, stderr.String())
	}
	markers := parseSilenceLog(stderr.String())
	f.logger.Debug("silence detection complete", "input", inputPath, "regions", len(markers))
	return markers, nil
}

func parseSilenceLog(log string) []SilenceMarker {
	var out []SilenceMarker
	var pending *SilenceMarker
	re := regexp.MustCompile(`silence_(start|end): (\d+(?:\.\d+)?)`)
	for _, m := range re.FindAllStringSubmatch(log, -1) {
		ts, _ := strconv.ParseFloat(m[2], 64)
		if m[1] == "start" {
			pending = &SilenceMarker{StartSec: ts}
		} else if m[1] == "end" && pending != nil {
			pending.EndSec = ts
			out = append(out, *pending)
			pending = nil
		}
	}
	return out
}

// SplitSegment writes [startSec, endSec) of inputPath to outputPath using stream copy
// (no re-encode). Truncates outputPath if it exists.
func (f *FFmpeg) SplitSegment(ctx context.Context, inputPath string, startSec, endSec float64, outputPath string) error {
	args := []string{
		"-y",
		"-ss", strconv.FormatFloat(startSec, 'f', 3, 64),
		"-to", strconv.FormatFloat(endSec, 'f', 3, 64),
		"-i", inputPath,
		"-c", "copy",
		outputPath,
	}
	cmd := exec.CommandContext(ctx, f.binPath, args...)
	f.logger.Debug("splitting segment", "input", inputPath, "start", startSec, "end", endSec, "output", outputPath)
	out, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("ffmpeg split: %w (output: %s)", err, string(out))
	}
	return nil
}

// uniformDownsample selects n items uniformly spaced from items.
func uniformDownsample(items []string, n int) []string {
	if n <= 0 {
		return nil
	}
	if n >= len(items) {
		return items
	}

	result := make([]string, n)
	for i := 0; i < n; i++ {
		idx := int(math.Round(float64(i) * float64(len(items)-1) / float64(n-1)))
		if idx >= len(items) {
			idx = len(items) - 1
		}
		result[i] = items[idx]
	}
	return result
}
