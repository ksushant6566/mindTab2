package steps

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/ksushant6566/mindtab/server/internal/store"
	"github.com/ksushant6566/mindtab/server/internal/worker"
	pgvector "github.com/pgvector/pgvector-go"
)

// pgint4From converts an int to pgtype.Int4. Zero value means not set.
func pgint4From(n int) pgtype.Int4 {
	if n == 0 {
		return pgtype.Int4{}
	}
	return pgtype.Int4{Int32: int32(n), Valid: true}
}

func Store(
	ctx context.Context,
	queries store.Querier,
	job *worker.Job,
	prevResults worker.StepResults,
) (*worker.StepResult, error) {
	contentID := pgtype.UUID{Bytes: job.ContentID, Valid: true}

	// Check if content was deleted during processing
	isDeleted, err := queries.IsContentDeleted(ctx, contentID)
	if err != nil {
		return nil, fmt.Errorf("check deleted: %w", err)
	}
	if isDeleted {
		return nil, nil
	}

	// Parse step results
	var extractResult ExtractResult
	var visionResult VisionResult
	var summarizeResult SummarizeResult
	var embedResult EmbedResult
	var metadataResult MetadataResult
	var transcribeResult TranscribeResult
	var transcribeAudioResult TranscribeAudioResult
	var videoEvidence VideoEvidence
	var mediaKey string

	if r, ok := prevResults["extract"]; ok && r != nil {
		json.Unmarshal(r.Data, &extractResult)
	}
	if r, ok := prevResults["vision"]; ok && r != nil {
		json.Unmarshal(r.Data, &visionResult)
	}
	if r, ok := prevResults["summarize"]; ok && r != nil {
		json.Unmarshal(r.Data, &summarizeResult)
	}
	if r, ok := prevResults["embed"]; ok && r != nil {
		json.Unmarshal(r.Data, &embedResult)
	}
	if r, ok := prevResults["metadata"]; ok && r != nil {
		json.Unmarshal(r.Data, &metadataResult)
	}
	if r, ok := prevResults["transcribe"]; ok && r != nil {
		json.Unmarshal(r.Data, &transcribeResult)
		json.Unmarshal(r.Data, &transcribeAudioResult)
	}
	if r, ok := prevResults["evidence"]; ok && r != nil {
		json.Unmarshal(r.Data, &videoEvidence)
	}
	if r, ok := prevResults["save"]; ok && r != nil {
		var saveResult map[string]string
		json.Unmarshal(r.Data, &saveResult)
		mediaKey = saveResult["media_key"]
	}

	// Build extracted text: prefer article text, fall back to transcript (YouTube/audio), then vision OCR text.
	extractedText := extractResult.Text
	if extractedText == "" && transcribeResult.Transcript != "" {
		extractedText = transcribeResult.Transcript
	}
	if extractedText == "" && videoEvidence.Transcript != "" {
		extractedText = videoEvidence.Transcript
	}
	if extractedText == "" && transcribeAudioResult.ExtractedText != "" {
		extractedText = transcribeAudioResult.ExtractedText
	}
	if extractedText == "" {
		extractedText = visionResult.ExtractedText
	}

	// Build visual description from image vision or the shared video evidence timeline.
	visualDescription := visionResult.VisualDescription
	if visualDescription == "" && (videoEvidence.VisualTimeline != "" || len(videoEvidence.FrameObservations) > 0) {
		visualDescription = RenderVideoVisualDescription(videoEvidence)
	}

	// Prefer extract title (articles), fall back to metadata title, then summarize title.
	title := extractResult.Title
	if title == "" {
		title = metadataResult.Title
	}
	if title == "" {
		title = videoEvidence.Metadata.Title
	}
	if title == "" {
		title = summarizeResult.Title
	}

	// Update content results
	err = queries.UpdateContentResults(ctx, store.UpdateContentResultsParams{
		ID:                contentID,
		ExtractedText:     pgtextFrom(extractedText),
		VisualDescription: pgtextFrom(visualDescription),
		Summary:           pgtextFrom(summarizeResult.Summary),
		Tags:              summarizeResult.Tags,
		KeyTopics:         summarizeResult.KeyTopics,
		SourceTitle:       pgtextFrom(title),
		SummaryProvider:   pgtextFrom(summarizeResult.Provider),
		EmbeddingProvider: pgtextFrom(embedResult.Provider),
		EmbeddingModel:    pgtextFrom(embedResult.Model),
		MediaKey:          pgtextFrom(mediaKey),
	})
	if err != nil {
		return nil, fmt.Errorf("update content results: %w", err)
	}

	// Update embedding via sqlc-generated query
	if len(embedResult.Embedding) > 0 {
		vec := pgvector.NewVector(embedResult.Embedding)
		err = queries.UpdateContentEmbedding(ctx, store.UpdateContentEmbeddingParams{
			ID:        contentID,
			Embedding: vec,
		})
		if err != nil {
			return nil, fmt.Errorf("update embedding: %w", err)
		}
	}

	videoDuration := metadataResult.Duration
	videoThumbnail := metadataResult.ThumbnailURL
	videoChannel := metadataResult.Channel
	transcriptSource := transcribeResult.TranscriptSource
	if videoDuration == 0 {
		videoDuration = videoEvidence.Metadata.DurationSeconds
	}
	if videoThumbnail == "" {
		videoThumbnail = videoEvidence.Metadata.ThumbnailURL
	}
	if videoChannel == "" {
		videoChannel = videoEvidence.Metadata.Creator
	}
	if transcriptSource == "" {
		transcriptSource = videoEvidence.TranscriptSource
	}

	// Update video fields when video metadata is present.
	if metadataResult.VideoID != "" || videoEvidence.Metadata.LocalPath != "" {
		err = queries.UpdateContentYoutubeFields(ctx, store.UpdateContentYoutubeFieldsParams{
			ID:                contentID,
			DurationSeconds:   pgint4From(videoDuration),
			VideoThumbnailUrl: pgtextFrom(videoThumbnail),
			VideoChannel:      pgtextFrom(videoChannel),
			TranscriptSource:  pgtextFrom(transcriptSource),
		})
		if err != nil {
			return nil, fmt.Errorf("update youtube fields: %w", err)
		}
	}

	// Update transcript_source for audio content (no video metadata, but has audio transcript).
	// Use the dedicated query so we don't overwrite duration_seconds (set at upload time)
	// or the unrelated video_* columns with NULLs.
	if metadataResult.VideoID == "" && transcribeAudioResult.TranscriptSource != "" {
		err = queries.UpdateContentTranscriptSource(ctx, store.UpdateContentTranscriptSourceParams{
			ID:               contentID,
			TranscriptSource: pgtextFrom(transcribeAudioResult.TranscriptSource),
		})
		if err != nil {
			return nil, fmt.Errorf("update audio transcript source: %w", err)
		}
	}

	return nil, nil
}

func pgtextFrom(s string) pgtype.Text {
	if s == "" {
		return pgtype.Text{}
	}
	return pgtype.Text{String: s, Valid: true}
}
