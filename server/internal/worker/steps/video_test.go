package steps

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"github.com/ksushant6566/mindtab/server/internal/worker"
)

type fakeFrameSelector struct {
	frames SelectedFrames
	err    error
}

func (f fakeFrameSelector) SelectFrames(ctx context.Context, input VideoFrameSelectionInput) (SelectedFrames, error) {
	return f.frames, f.err
}

type fakeFrameUnderstandingProvider struct {
	understanding FrameUnderstanding
	err           error
}

func (f fakeFrameUnderstandingProvider) UnderstandFrames(ctx context.Context, frames SelectedFrames) (FrameUnderstanding, error) {
	return f.understanding, f.err
}

func TestVideoFrameTargetCountPolicy(t *testing.T) {
	tests := map[string]struct {
		duration int
		want     int
	}{
		"unknown duration": {duration: 0, want: 8},
		"short video":      {duration: 9, want: 8},
		"thirty seconds":   {duration: 30, want: 8},
		"medium video":     {duration: 90, want: 10},
		"long video":       {duration: 300, want: 12},
	}

	for name, tc := range tests {
		t.Run(name, func(t *testing.T) {
			if got := VideoFrameTargetCount(tc.duration); got != tc.want {
				t.Errorf("VideoFrameTargetCount(%d) = %d, want %d", tc.duration, got, tc.want)
			}
		})
	}
}

func TestDedupeExactFramePaths(t *testing.T) {
	dir := t.TempDir()
	frameA := filepath.Join(dir, "a.jpg")
	frameB := filepath.Join(dir, "b.jpg")
	frameC := filepath.Join(dir, "c.jpg")
	if err := os.WriteFile(frameA, []byte("same"), 0o644); err != nil {
		t.Fatalf("write frame A: %v", err)
	}
	if err := os.WriteFile(frameB, []byte("same"), 0o644); err != nil {
		t.Fatalf("write frame B: %v", err)
	}
	if err := os.WriteFile(frameC, []byte("different"), 0o644); err != nil {
		t.Fatalf("write frame C: %v", err)
	}

	got, err := dedupeExactFramePaths([]string{frameA, frameB, frameC})
	if err != nil {
		t.Fatalf("dedupeExactFramePaths: %v", err)
	}
	if len(got) != 2 {
		t.Fatalf("deduped frame count = %d, want 2 (%v)", len(got), got)
	}
	if got[0] != frameA || got[1] != frameC {
		t.Errorf("deduped frames = %v, want [%s %s]", got, frameA, frameC)
	}
}

func TestSelectVideoFrames_FakeSelectorResultShape(t *testing.T) {
	want := SelectedFrames{
		FramePaths:      []string{"/tmp/frame1.jpg", "/tmp/frame2.jpg"},
		FrameCount:      2,
		Policy:          "uniform_timeline_v1",
		DurationSeconds: 12,
		Status:          successStatus("frames"),
	}
	result, err := SelectVideoFrames(context.Background(), fakeFrameSelector{frames: want}, VideoFrameSelectionInput{
		LocalPath:       "/tmp/video.mp4",
		DurationSeconds: 12,
	})
	if err != nil {
		t.Fatalf("SelectVideoFrames: %v", err)
	}

	var got SelectedFrames
	if err := json.Unmarshal(result.Data, &got); err != nil {
		t.Fatalf("unmarshal SelectedFrames: %v", err)
	}
	if got.FrameCount != 2 {
		t.Errorf("FrameCount = %d, want 2", got.FrameCount)
	}
	if got.Status.Status != EvidenceStatusSuccess {
		t.Errorf("Status = %q, want success", got.Status.Status)
	}
}

func TestUnderstandVideoFrames_FakeProvider(t *testing.T) {
	frames := SelectedFrames{
		FramePaths: []string{"/tmp/frame1.jpg"},
		FrameCount: 1,
	}
	result, err := UnderstandVideoFrames(context.Background(), fakeFrameUnderstandingProvider{
		understanding: FrameUnderstanding{
			OCRText:        "visible overlay",
			VisualTimeline: "a person points at a chart",
			FrameObservations: []FrameObservation{{
				FrameIndex:  0,
				Observation: "a chart is visible",
			}},
			UncertaintyNotes: []string{"audio unavailable"},
		},
	}, frames)
	if err != nil {
		t.Fatalf("UnderstandVideoFrames: %v", err)
	}

	var got FrameUnderstanding
	if err := json.Unmarshal(result.Data, &got); err != nil {
		t.Fatalf("unmarshal FrameUnderstanding: %v", err)
	}
	if got.OCRText != "visible overlay" {
		t.Errorf("OCRText = %q", got.OCRText)
	}
	if got.Status.Status != EvidenceStatusSuccess {
		t.Errorf("Status = %q, want success", got.Status.Status)
	}
}

func TestBuildVideoEvidenceFromResults_Complete(t *testing.T) {
	prev := worker.StepResults{
		"metadata": {Data: mustMarshalVideoTest(t, MetadataResult{
			Title:        "Clip title",
			Description:  "source caption",
			Duration:     9,
			ThumbnailURL: "https://example.com/thumb.jpg",
			Channel:      "creator",
			HasCaptions:  true,
			Status:       successStatus("metadata"),
		})},
		"download": {Data: mustMarshalVideoTest(t, DownloadResult{VideoFilePath: "/tmp/video.mp4"})},
		"transcribe": {Data: mustMarshalVideoTest(t, TranscribeResult{
			Transcript:       "spoken words",
			TranscriptSource: "captions",
			Status:           successStatus("transcript"),
		})},
		"extract_frames": {Data: mustMarshalVideoTest(t, SelectedFrames{
			FramePaths:      []string{"/tmp/frame1.jpg", "/tmp/frame2.jpg"},
			FrameCount:      2,
			Policy:          "uniform_timeline_v1",
			DurationSeconds: 9,
			Frames: []SelectedFrame{
				{Path: "/tmp/frame1.jpg", Index: 0, TimestampSeconds: 0},
				{Path: "/tmp/frame2.jpg", Index: 1, TimestampSeconds: 9},
			},
			Status: successStatus("frames"),
		})},
		"vision": {Data: mustMarshalVideoTest(t, FrameUnderstanding{
			OCRText:        "overlay words",
			VisualTimeline: "two frames show a person entering a car",
			FrameCount:     2,
			Status:         successStatus("frame_understanding"),
		})},
	}

	evidence, err := BuildVideoEvidenceFromResults("instagram_reel", "https://example.com/reel", prev)
	if err != nil {
		t.Fatalf("BuildVideoEvidenceFromResults: %v", err)
	}
	if evidence.Metadata.Description != "source caption" {
		t.Errorf("description = %q", evidence.Metadata.Description)
	}
	if evidence.Transcript != "spoken words" {
		t.Errorf("transcript = %q", evidence.Transcript)
	}
	if evidence.OCRText != "overlay words" {
		t.Errorf("ocr = %q", evidence.OCRText)
	}
	if evidence.SelectedFrames.FrameCount != 2 {
		t.Errorf("selected frame count = %d, want 2", evidence.SelectedFrames.FrameCount)
	}
	if !HasUsableVideoEvidence(evidence) {
		t.Fatal("expected complete evidence to be usable")
	}
}

func TestBuildVideoEvidenceStep_MinimumViableEvidenceRules(t *testing.T) {
	t.Run("source description alone is usable", func(t *testing.T) {
		prev := worker.StepResults{
			"metadata": {Data: mustMarshalVideoTest(t, MetadataResult{
				Description: "caption gives the context",
				Status:      successStatus("metadata"),
			})},
			"download": {Data: mustMarshalVideoTest(t, DownloadResult{VideoFilePath: "/tmp/video.mp4"})},
		}
		if _, err := BuildVideoEvidenceStep("instagram_reel", "https://example.com/reel", prev); err != nil {
			t.Fatalf("BuildVideoEvidenceStep: %v", err)
		}
	})

	t.Run("no evidence fails", func(t *testing.T) {
		prev := worker.StepResults{
			"metadata": {Data: mustMarshalVideoTest(t, MetadataResult{
				Status: degradedStatus("metadata", "metadata_unavailable", "metadata failed"),
			})},
			"download": {Data: mustMarshalVideoTest(t, DownloadResult{VideoFilePath: "/tmp/video.mp4"})},
			"transcribe": {Data: mustMarshalVideoTest(t, TranscribeResult{
				Status: failedStatus("transcript", "transcription_failed", "audio failed"),
			})},
			"extract_frames": {Data: mustMarshalVideoTest(t, SelectedFrames{
				Status: failedStatus("frames", "frame_selection_failed", "ffmpeg failed"),
			})},
			"vision": {Data: mustMarshalVideoTest(t, FrameUnderstanding{
				Status: failedStatus("frame_understanding", "frame_understanding_failed", "vision failed"),
			})},
		}
		if _, err := BuildVideoEvidenceStep("instagram_reel", "https://example.com/reel", prev); err == nil {
			t.Fatal("BuildVideoEvidenceStep: expected no-evidence failure")
		}
	})
}

func TestBuildVideoEvidenceStep_DegradesWithPartialEvidence(t *testing.T) {
	prev := worker.StepResults{
		"metadata": {Data: mustMarshalVideoTest(t, MetadataResult{
			Description: "caption gives the main joke",
			Status:      successStatus("metadata"),
		})},
		"download": {Data: mustMarshalVideoTest(t, DownloadResult{VideoFilePath: "/tmp/video.mp4"})},
		"transcribe": {Data: mustMarshalVideoTest(t, TranscribeResult{
			Status: failedStatus("transcript", "transcription_failed", "audio failed"),
		})},
		"extract_frames": {Data: mustMarshalVideoTest(t, SelectedFrames{
			Status: failedStatus("frames", "frame_selection_failed", "ffmpeg failed"),
		})},
		"vision": {Data: mustMarshalVideoTest(t, FrameUnderstanding{
			Status: failedStatus("frame_understanding", "frame_understanding_failed", "vision failed"),
		})},
	}

	result, err := BuildVideoEvidenceStep("instagram_reel", "https://example.com/reel", prev)
	if err != nil {
		t.Fatalf("BuildVideoEvidenceStep: %v", err)
	}

	var evidence VideoEvidence
	if err := json.Unmarshal(result.Data, &evidence); err != nil {
		t.Fatalf("unmarshal evidence: %v", err)
	}
	if evidence.Metadata.Description == "" {
		t.Fatal("expected source description evidence to be preserved")
	}
	if len(evidence.EvidenceStatus) < 4 {
		t.Fatalf("expected degraded statuses, got %v", evidence.EvidenceStatus)
	}
}

func mustMarshalVideoTest(t *testing.T, v any) json.RawMessage {
	t.Helper()
	data, err := json.Marshal(v)
	if err != nil {
		t.Fatalf("marshal test data: %v", err)
	}
	return data
}
