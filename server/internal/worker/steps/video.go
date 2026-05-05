package steps

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"unicode/utf8"

	"github.com/ksushant6566/mindtab/server/internal/services"
	"github.com/ksushant6566/mindtab/server/internal/worker"
)

const (
	EvidenceStatusSuccess  = "success"
	EvidenceStatusSkipped  = "skipped"
	EvidenceStatusDegraded = "degraded"
	EvidenceStatusFailed   = "failed"
)

type EvidenceStatus struct {
	Source       string `json:"source"`
	Status       string `json:"status"`
	ErrorCode    string `json:"error_code,omitempty"`
	ErrorMessage string `json:"error_message,omitempty"`
}

type ResolvedVideo struct {
	LocalPath       string `json:"local_path"`
	SourceURL       string `json:"source_url,omitempty"`
	SourceType      string `json:"source_type"`
	Title           string `json:"title,omitempty"`
	Description     string `json:"description,omitempty"`
	Creator         string `json:"creator,omitempty"`
	DurationSeconds int    `json:"duration_seconds,omitempty"`
	ThumbnailURL    string `json:"thumbnail_url,omitempty"`
	HasCaptions     bool   `json:"has_captions,omitempty"`
}

type VideoFrameSelectionInput struct {
	LocalPath       string
	DurationSeconds int
	OutputDir       string
}

type SelectedFrame struct {
	Path             string  `json:"path"`
	Index            int     `json:"index"`
	TimestampSeconds float64 `json:"timestamp_seconds"`
}

type SelectedFrames struct {
	FramePaths      []string        `json:"frame_paths"`
	FrameCount      int             `json:"frame_count"`
	Frames          []SelectedFrame `json:"frames"`
	Policy          string          `json:"policy"`
	DurationSeconds int             `json:"duration_seconds,omitempty"`
	Status          EvidenceStatus  `json:"status"`
}

type SelectedFramesSummary struct {
	FrameCount        int       `json:"frame_count"`
	Policy            string    `json:"policy,omitempty"`
	DurationSeconds   int       `json:"duration_seconds,omitempty"`
	TimestampSeconds  []float64 `json:"timestamp_seconds,omitempty"`
	IncludesTempPaths bool      `json:"includes_temp_paths"`
}

type FrameSelector interface {
	SelectFrames(ctx context.Context, input VideoFrameSelectionInput) (SelectedFrames, error)
}

type FFmpegFrameSelector struct {
	ffmpeg *services.FFmpeg
}

func NewFFmpegFrameSelector(ffmpeg *services.FFmpeg) *FFmpegFrameSelector {
	return &FFmpegFrameSelector{ffmpeg: ffmpeg}
}

func VideoFrameTargetCount(durationSeconds int) int {
	switch {
	case durationSeconds <= 0:
		return 8
	case durationSeconds <= 30:
		return 8
	case durationSeconds <= 90:
		return 10
	default:
		return 12
	}
}

func (s *FFmpegFrameSelector) SelectFrames(ctx context.Context, input VideoFrameSelectionInput) (SelectedFrames, error) {
	if s == nil || s.ffmpeg == nil {
		return SelectedFrames{}, fmt.Errorf("frame selector: ffmpeg is not configured")
	}
	if input.LocalPath == "" {
		return SelectedFrames{}, fmt.Errorf("frame selector: empty video path")
	}

	outputDir := input.OutputDir
	if outputDir == "" {
		outputDir = filepath.Join(filepath.Dir(input.LocalPath), "frames")
	}

	targetCount := VideoFrameTargetCount(input.DurationSeconds)
	paths, err := s.ffmpeg.ExtractUniformFrames(ctx, input.LocalPath, outputDir, targetCount, input.DurationSeconds)
	if err != nil {
		return SelectedFrames{}, err
	}

	paths, err = dedupeExactFramePaths(paths)
	if err != nil {
		return SelectedFrames{}, err
	}

	frames := make([]SelectedFrame, 0, len(paths))
	for i, path := range paths {
		frames = append(frames, SelectedFrame{
			Path:             path,
			Index:            i,
			TimestampSeconds: approximateFrameTimestamp(i, len(paths), input.DurationSeconds),
		})
	}

	return SelectedFrames{
		FramePaths:      paths,
		FrameCount:      len(paths),
		Frames:          frames,
		Policy:          "uniform_timeline_v1",
		DurationSeconds: input.DurationSeconds,
		Status:          successStatus("frames"),
	}, nil
}

func SelectVideoFrames(ctx context.Context, selector FrameSelector, input VideoFrameSelectionInput) (*worker.StepResult, error) {
	if selector == nil {
		return marshalStepResult(SelectedFrames{
			Status: failedStatus("frames", "frame_selector_missing", "frame selector is not configured"),
		})
	}

	frames, err := selector.SelectFrames(ctx, input)
	if err != nil {
		return marshalStepResult(SelectedFrames{
			Policy:          "uniform_timeline_v1",
			DurationSeconds: input.DurationSeconds,
			Status:          failedStatus("frames", "frame_selection_failed", err.Error()),
		})
	}
	if frames.FrameCount == 0 {
		frames.Status = degradedStatus("frames", "no_frames_selected", "frame selector returned no frames")
	}
	return marshalStepResult(frames)
}

type FrameObservation struct {
	FrameIndex       int     `json:"frame_index"`
	TimestampSeconds float64 `json:"timestamp_seconds,omitempty"`
	Observation      string  `json:"observation"`
	OCRText          string  `json:"ocr_text,omitempty"`
}

type FrameUnderstanding struct {
	OCRText           string             `json:"ocr_text"`
	VisualTimeline    string             `json:"visual_timeline"`
	FrameObservations []FrameObservation `json:"frame_observations"`
	UncertaintyNotes  []string           `json:"uncertainty_notes"`
	FrameCount        int                `json:"frame_count"`
	Status            EvidenceStatus     `json:"status"`
}

type FrameUnderstandingProvider interface {
	UnderstandFrames(ctx context.Context, frames SelectedFrames) (FrameUnderstanding, error)
}

func UnderstandVideoFrames(ctx context.Context, provider FrameUnderstandingProvider, frames SelectedFrames) (*worker.StepResult, error) {
	if frames.FrameCount == 0 || len(frames.FramePaths) == 0 {
		return marshalStepResult(FrameUnderstanding{
			Status: skippedStatus("frame_understanding", "no_frames", "no selected frames to analyze"),
		})
	}
	if provider == nil {
		return marshalStepResult(FrameUnderstanding{
			FrameCount: frames.FrameCount,
			Status:     failedStatus("frame_understanding", "provider_missing", "frame understanding provider is not configured"),
		})
	}

	understanding, err := provider.UnderstandFrames(ctx, frames)
	if err != nil {
		return marshalStepResult(FrameUnderstanding{
			FrameCount: frames.FrameCount,
			Status:     failedStatus("frame_understanding", "frame_understanding_failed", err.Error()),
		})
	}
	understanding.FrameCount = frames.FrameCount
	if understanding.Status.Status == "" {
		understanding.Status = successStatus("frame_understanding")
	}
	return marshalStepResult(understanding)
}

type VideoEvidence struct {
	Metadata          ResolvedVideo         `json:"metadata"`
	Transcript        string                `json:"transcript,omitempty"`
	TranscriptSource  string                `json:"transcript_source,omitempty"`
	SelectedFrames    SelectedFramesSummary `json:"selected_frames"`
	OCRText           string                `json:"ocr_text,omitempty"`
	VisualTimeline    string                `json:"visual_timeline,omitempty"`
	FrameObservations []FrameObservation    `json:"frame_observations,omitempty"`
	UncertaintyNotes  []string              `json:"uncertainty_notes,omitempty"`
	EvidenceStatus    []EvidenceStatus      `json:"evidence_status"`
}

func BuildVideoEvidenceStep(sourceType, sourceURL string, prevResults worker.StepResults) (*worker.StepResult, error) {
	evidence, err := BuildVideoEvidenceFromResults(sourceType, sourceURL, prevResults)
	if err != nil {
		return nil, err
	}
	if !HasUsableVideoEvidence(evidence) {
		return nil, fmt.Errorf("video evidence: all evidence sources are empty or failed")
	}
	return marshalStepResult(evidence)
}

func BuildVideoEvidenceFromResults(sourceType, sourceURL string, prevResults worker.StepResults) (VideoEvidence, error) {
	var metadata MetadataResult
	var download DownloadResult
	var transcript TranscribeResult
	var selected SelectedFrames
	var understanding FrameUnderstanding

	hasMetadata := unmarshalStep(prevResults, "metadata", &metadata) == nil
	hasDownload := unmarshalStep(prevResults, "download", &download) == nil
	hasTranscript := unmarshalStep(prevResults, "transcribe", &transcript) == nil
	hasSelected := unmarshalStep(prevResults, "extract_frames", &selected) == nil
	hasUnderstanding := unmarshalStep(prevResults, "vision", &understanding) == nil

	if !hasDownload || strings.TrimSpace(download.VideoFilePath) == "" {
		return VideoEvidence{}, fmt.Errorf("video evidence: missing local video path")
	}

	if hasSelected && selected.FrameCount == 0 && len(selected.FramePaths) > 0 {
		selected.FrameCount = len(selected.FramePaths)
	}
	if hasUnderstanding && understanding.VisualTimeline == "" {
		var legacy BatchVisionResult
		if unmarshalStep(prevResults, "vision", &legacy) == nil {
			understanding.VisualTimeline = legacy.VisualDescription
			understanding.FrameCount = legacy.FrameCount
			if legacy.VisualDescription != "" && understanding.Status.Status == "" {
				understanding.Status = successStatus("frame_understanding")
			}
		}
	}

	evidence := VideoEvidence{
		Metadata: ResolvedVideo{
			LocalPath:       download.VideoFilePath,
			SourceURL:       sourceURL,
			SourceType:      sourceType,
			Title:           metadata.Title,
			Description:     metadata.Description,
			Creator:         metadata.Channel,
			DurationSeconds: metadata.Duration,
			ThumbnailURL:    metadata.ThumbnailURL,
			HasCaptions:     metadata.HasCaptions,
		},
		Transcript:        transcript.Transcript,
		TranscriptSource:  transcript.TranscriptSource,
		SelectedFrames:    selected.Summary(),
		OCRText:           understanding.OCRText,
		VisualTimeline:    understanding.VisualTimeline,
		FrameObservations: understanding.FrameObservations,
		UncertaintyNotes:  understanding.UncertaintyNotes,
	}

	if hasMetadata {
		evidence.EvidenceStatus = appendStatus(evidence.EvidenceStatus, metadata.Status, "metadata")
	}
	if hasTranscript {
		evidence.EvidenceStatus = appendStatus(evidence.EvidenceStatus, transcript.Status, "transcript")
	}
	if hasSelected {
		evidence.EvidenceStatus = appendStatus(evidence.EvidenceStatus, selected.Status, "frames")
	}
	if hasUnderstanding {
		evidence.EvidenceStatus = appendStatus(evidence.EvidenceStatus, understanding.Status, "frame_understanding")
	}

	return evidence, nil
}

func (s SelectedFrames) Summary() SelectedFramesSummary {
	timestamps := make([]float64, 0, len(s.Frames))
	for _, frame := range s.Frames {
		timestamps = append(timestamps, frame.TimestampSeconds)
	}
	return SelectedFramesSummary{
		FrameCount:        s.FrameCount,
		Policy:            s.Policy,
		DurationSeconds:   s.DurationSeconds,
		TimestampSeconds:  timestamps,
		IncludesTempPaths: len(s.FramePaths) > 0,
	}
}

func HasUsableVideoEvidence(evidence VideoEvidence) bool {
	return strings.TrimSpace(evidence.Transcript) != "" ||
		strings.TrimSpace(evidence.OCRText) != "" ||
		strings.TrimSpace(evidence.VisualTimeline) != "" ||
		strings.TrimSpace(evidence.Metadata.Description) != ""
}

func RenderVideoVisualDescription(evidence VideoEvidence) string {
	var b strings.Builder
	if strings.TrimSpace(evidence.VisualTimeline) != "" {
		b.WriteString(strings.TrimSpace(evidence.VisualTimeline))
	}
	if len(evidence.FrameObservations) > 0 {
		if b.Len() > 0 {
			b.WriteString("\n\n")
		}
		for _, obs := range evidence.FrameObservations {
			if strings.TrimSpace(obs.Observation) == "" {
				continue
			}
			b.WriteString(fmt.Sprintf("Frame %d", obs.FrameIndex+1))
			if obs.TimestampSeconds > 0 {
				b.WriteString(fmt.Sprintf(" (%.1fs)", obs.TimestampSeconds))
			}
			b.WriteString(": ")
			b.WriteString(strings.TrimSpace(obs.Observation))
			b.WriteString("\n")
		}
	}
	return strings.TrimSpace(b.String())
}

func VideoEmbeddingText(evidence VideoEvidence, summary SummarizeResult) string {
	var b strings.Builder
	writeSection := func(label, value string, max int) {
		value = strings.TrimSpace(value)
		if value == "" {
			return
		}
		if max > 0 && len(value) > max {
			value = truncateUTF8(value, max)
		}
		if b.Len() > 0 {
			b.WriteString("\n\n")
		}
		b.WriteString(label)
		b.WriteString(":\n")
		b.WriteString(value)
	}

	writeSection("Summary", summary.Summary, 0)
	writeSection("Transcript", evidence.Transcript, 2000)
	writeSection("Source description", evidence.Metadata.Description, 1200)
	writeSection("OCR text", evidence.OCRText, 1200)
	writeSection("Visual timeline", evidence.VisualTimeline, 1200)
	return b.String()
}

func truncateUTF8(value string, max int) string {
	if max <= 0 || len(value) <= max {
		return value
	}
	for max > 0 && !utf8.RuneStart(value[max]) {
		max--
	}
	return value[:max]
}

func unmarshalStep(prevResults worker.StepResults, key string, out any) error {
	raw, ok := prevResults[key]
	if !ok || raw == nil {
		return fmt.Errorf("missing %s result", key)
	}
	if err := json.Unmarshal(raw.Data, out); err != nil {
		return fmt.Errorf("parse %s result: %w", key, err)
	}
	return nil
}

func marshalStepResult(v any) (*worker.StepResult, error) {
	data, err := json.Marshal(v)
	if err != nil {
		return nil, err
	}
	return &worker.StepResult{Data: data}, nil
}

func successStatus(source string) EvidenceStatus {
	return EvidenceStatus{Source: source, Status: EvidenceStatusSuccess}
}

func skippedStatus(source, code, message string) EvidenceStatus {
	return EvidenceStatus{Source: source, Status: EvidenceStatusSkipped, ErrorCode: code, ErrorMessage: message}
}

func degradedStatus(source, code, message string) EvidenceStatus {
	return EvidenceStatus{Source: source, Status: EvidenceStatusDegraded, ErrorCode: code, ErrorMessage: message}
}

func failedStatus(source, code, message string) EvidenceStatus {
	return EvidenceStatus{Source: source, Status: EvidenceStatusFailed, ErrorCode: code, ErrorMessage: message}
}

func appendStatus(statuses []EvidenceStatus, status EvidenceStatus, fallbackSource string) []EvidenceStatus {
	if status.Status == "" {
		status = successStatus(fallbackSource)
	}
	if status.Source == "" {
		status.Source = fallbackSource
	}
	return append(statuses, status)
}

func dedupeExactFramePaths(paths []string) ([]string, error) {
	seen := make(map[[32]byte]bool, len(paths))
	result := make([]string, 0, len(paths))
	for _, path := range paths {
		data, err := os.ReadFile(path)
		if err != nil {
			return nil, fmt.Errorf("dedupe frame %s: %w", path, err)
		}
		sum := sha256.Sum256(data)
		if seen[sum] {
			continue
		}
		seen[sum] = true
		result = append(result, path)
	}
	return result, nil
}

func approximateFrameTimestamp(index, frameCount, durationSeconds int) float64 {
	if frameCount <= 1 || durationSeconds <= 0 {
		return 0
	}
	return float64(index) * float64(durationSeconds) / float64(frameCount-1)
}
