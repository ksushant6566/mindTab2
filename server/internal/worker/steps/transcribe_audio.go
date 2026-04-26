package steps

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"os"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/ksushant6566/mindtab/server/internal/providers"
	"github.com/ksushant6566/mindtab/server/internal/providers/transcription"
	"github.com/ksushant6566/mindtab/server/internal/services"
	"github.com/ksushant6566/mindtab/server/internal/store"
	"github.com/ksushant6566/mindtab/server/internal/worker"
)

// TranscribeAudioResult is the step's persisted output (consumed by Summarize and Store).
type TranscribeAudioResult struct {
	ExtractedText    string `json:"extracted_text"`
	TranscriptSource string `json:"transcript_source"`
}

// audioChunkSizeThresholdBytes — files at or below 24 MB are sent in a single Whisper call.
// Anything larger is rejected for now; chunking lands in Chunk 6.
const audioChunkSizeThresholdBytes int64 = 24 * 1024 * 1024

// TranscribeAudio reads the audio file pointed to by the row's media_key, transcribes
// it via the chain, and returns the resulting text wrapped as a StepResult.
func TranscribeAudio(
	ctx context.Context,
	chain *providers.Chain[transcription.TranscriptionProvider],
	storage services.StorageProvider,
	queries store.Querier,
	job *worker.Job,
) (*worker.StepResult, error) {
	row, err := queries.GetContentByID(ctx, store.GetContentByIDParams{
		ID:     pgtype.UUID{Bytes: job.ContentID, Valid: true},
		UserID: job.UserID,
	})
	if err != nil {
		return nil, fmt.Errorf("transcribe_audio: load row: %w", err)
	}
	if !row.MediaKey.Valid || row.MediaKey.String == "" {
		return nil, fmt.Errorf("transcribe_audio: row %s has no media_key", job.ContentID)
	}

	tmpFile, err := stageToTemp(ctx, storage, row.MediaKey.String)
	if err != nil {
		return nil, err
	}
	defer os.Remove(tmpFile)

	// Stat to check size before sending to Whisper.
	info, statErr := os.Stat(tmpFile)
	if statErr != nil {
		return nil, fmt.Errorf("transcribe_audio: stat: %w", statErr)
	}
	if info.Size() > audioChunkSizeThresholdBytes {
		return nil, fmt.Errorf("transcribe_audio: file %d bytes exceeds 24 MB; chunking not yet implemented", info.Size())
	}

	var text string
	err = chain.Execute(func(_ string, p transcription.TranscriptionProvider) error {
		res, perr := p.Transcribe(ctx, tmpFile)
		if perr != nil {
			return perr
		}
		text = res.Text
		return nil
	})
	if err != nil {
		return nil, fmt.Errorf("transcribe_audio: chain failed: %w", err)
	}

	data, err := json.Marshal(TranscribeAudioResult{
		ExtractedText:    text,
		TranscriptSource: "whisper",
	})
	if err != nil {
		return nil, err
	}
	return &worker.StepResult{Data: data}, nil
}

// stageToTemp downloads the object at mediaKey from storage into a local temp file
// and returns the temp file path. The caller is responsible for removing it.
func stageToTemp(ctx context.Context, storage services.StorageProvider, mediaKey string) (string, error) {
	rc, err := storage.Get(ctx, mediaKey)
	if err != nil {
		return "", fmt.Errorf("transcribe_audio: storage get: %w", err)
	}
	defer rc.Close()

	f, err := os.CreateTemp("", "audio-*")
	if err != nil {
		return "", err
	}
	if _, err := io.Copy(f, rc); err != nil {
		f.Close()
		os.Remove(f.Name())
		return "", err
	}
	if err := f.Close(); err != nil {
		os.Remove(f.Name())
		return "", err
	}
	return f.Name(), nil
}
