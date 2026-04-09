package steps

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"github.com/google/uuid"
	"github.com/ksushant6566/mindtab/server/internal/providers"
	"github.com/ksushant6566/mindtab/server/internal/testutil"
	"github.com/ksushant6566/mindtab/server/internal/worker"
)

func makeJobWithImage(imageData []byte, imageType string) *worker.Job {
	return &worker.Job{
		ID:          uuid.New(),
		ContentID:   uuid.New(),
		UserID:      "user-test",
		ContentType: "image",
		ImageData:   imageData,
		ImageType:   imageType,
	}
}

func TestVision_Success(t *testing.T) {
	payload := `{"extracted_text":"Hello World","visual_description":"A screenshot of text."}`

	mock := &testutil.MockLLMProvider{Response: payload}
	chain := makeLLMChain(mock)

	job := makeJobWithImage([]byte("fake-image-bytes"), "image/jpeg")

	result, err := Vision(context.Background(), chain, job)
	if err != nil {
		t.Fatalf("Vision: unexpected error: %v", err)
	}
	if result == nil {
		t.Fatal("Vision: expected non-nil result")
	}

	var vr VisionResult
	if err := json.Unmarshal(result.Data, &vr); err != nil {
		t.Fatalf("unmarshal VisionResult: %v", err)
	}

	if vr.ExtractedText != "Hello World" {
		t.Errorf("extracted_text: got %q, want %q", vr.ExtractedText, "Hello World")
	}
	if vr.VisualDescription != "A screenshot of text." {
		t.Errorf("visual_description: got %q, want %q", vr.VisualDescription, "A screenshot of text.")
	}

	if len(mock.Calls) != 1 {
		t.Fatalf("expected 1 LLM call, got %d", len(mock.Calls))
	}
	req := mock.Calls[0]
	if len(req.Images) != 1 {
		t.Errorf("expected 1 image in request, got %d", len(req.Images))
	}
	if req.Images[0].MediaType != "image/jpeg" {
		t.Errorf("image media type: got %q, want %q", req.Images[0].MediaType, "image/jpeg")
	}
}

func TestVision_LLMError(t *testing.T) {
	mock := &testutil.MockLLMProvider{
		Err: providers.NewPermanentError("mock", errTest("llm vision failure")),
	}
	chain := makeLLMChain(mock)

	job := makeJobWithImage([]byte("fake-image-bytes"), "image/jpeg")

	result, err := Vision(context.Background(), chain, job)
	if err == nil {
		t.Fatal("Vision: expected error when LLM fails")
	}
	if result != nil {
		t.Errorf("Vision: expected nil result on error, got %+v", result)
	}
}

func TestVision_NoImageData(t *testing.T) {
	mock := &testutil.MockLLMProvider{Response: "{}"}
	chain := makeLLMChain(mock)

	job := makeJobWithImage(nil, "image/jpeg")

	result, err := Vision(context.Background(), chain, job)
	if err == nil {
		t.Fatal("Vision: expected error when no image data")
	}
	if result != nil {
		t.Errorf("Vision: expected nil result, got %+v", result)
	}
}

func TestVision_MalformedJSONFallback(t *testing.T) {
	// Non-JSON response falls back to storing raw text in VisualDescription.
	raw := "This image shows a beautiful sunset over the ocean."
	mock := &testutil.MockLLMProvider{Response: raw}
	chain := makeLLMChain(mock)

	job := makeJobWithImage([]byte("fake-image-bytes"), "image/png")

	result, err := Vision(context.Background(), chain, job)
	if err != nil {
		t.Fatalf("Vision: unexpected error: %v", err)
	}
	if result == nil {
		t.Fatal("Vision: expected non-nil result")
	}

	var vr VisionResult
	if err := json.Unmarshal(result.Data, &vr); err != nil {
		t.Fatalf("unmarshal VisionResult: %v", err)
	}
	if vr.VisualDescription != raw {
		t.Errorf("fallback visual_description: got %q, want %q", vr.VisualDescription, raw)
	}
	if vr.ExtractedText != "" {
		t.Errorf("fallback extracted_text: expected empty, got %q", vr.ExtractedText)
	}
}

func TestBatchVision_Success(t *testing.T) {
	description := "Frames show a person coding at a desk."
	mock := &testutil.MockLLMProvider{Response: description}
	chain := makeLLMChain(mock)

	// Create temp frame files.
	dir := t.TempDir()
	framePaths := make([]string, 3)
	for i := 0; i < 3; i++ {
		path := filepath.Join(dir, "frame_"+string(rune('0'+i))+".jpg")
		if err := os.WriteFile(path, []byte("fake-frame-data"), 0644); err != nil {
			t.Fatalf("write temp frame: %v", err)
		}
		framePaths[i] = path
	}

	result, err := BatchVision(context.Background(), chain, framePaths)
	if err != nil {
		t.Fatalf("BatchVision: unexpected error: %v", err)
	}
	if result == nil {
		t.Fatal("BatchVision: expected non-nil result")
	}

	var bvr BatchVisionResult
	if err := json.Unmarshal(result.Data, &bvr); err != nil {
		t.Fatalf("unmarshal BatchVisionResult: %v", err)
	}

	if bvr.VisualDescription != description {
		t.Errorf("visual_description: got %q, want %q", bvr.VisualDescription, description)
	}
	if bvr.FrameCount != 3 {
		t.Errorf("frame_count: got %d, want 3", bvr.FrameCount)
	}

	// One LLM call for a single batch of 3 frames (under batchSize=20).
	if len(mock.Calls) != 1 {
		t.Errorf("expected 1 LLM call for 3 frames, got %d", len(mock.Calls))
	}
	if len(mock.Calls[0].Images) != 3 {
		t.Errorf("expected 3 images in LLM call, got %d", len(mock.Calls[0].Images))
	}
}

func TestBatchVision_EmptyFrames(t *testing.T) {
	mock := &testutil.MockLLMProvider{Response: "should not be called"}
	chain := makeLLMChain(mock)

	result, err := BatchVision(context.Background(), chain, []string{})
	if err != nil {
		t.Fatalf("BatchVision: unexpected error for empty frames: %v", err)
	}
	if result == nil {
		t.Fatal("BatchVision: expected non-nil result for empty frames")
	}

	var bvr BatchVisionResult
	if err := json.Unmarshal(result.Data, &bvr); err != nil {
		t.Fatalf("unmarshal BatchVisionResult: %v", err)
	}

	if bvr.FrameCount != 0 {
		t.Errorf("frame_count: got %d, want 0", bvr.FrameCount)
	}
	if bvr.VisualDescription != "" {
		t.Errorf("visual_description: expected empty, got %q", bvr.VisualDescription)
	}

	// LLM should never be called for empty frame list.
	if len(mock.Calls) != 0 {
		t.Errorf("expected 0 LLM calls for empty frames, got %d", len(mock.Calls))
	}
}

func TestBatchVision_MissingFrameFile(t *testing.T) {
	mock := &testutil.MockLLMProvider{Response: "desc"}
	chain := makeLLMChain(mock)

	// Provide a non-existent path.
	result, err := BatchVision(context.Background(), chain, []string{"/nonexistent/frame.jpg"})
	if err == nil {
		t.Fatal("BatchVision: expected error for missing frame file")
	}
	if result != nil {
		t.Errorf("BatchVision: expected nil result on error, got %+v", result)
	}
}
