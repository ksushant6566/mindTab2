package steps

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"os"
	"strings"

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
const audioChunkSizeThresholdBytes int64 = 24 * 1024 * 1024

const targetSegmentSec = 20 * 60.0
const chunkToleranceSec = 2 * 60.0
const silenceNoiseDB = -30.0
const silenceMinSec = 0.5

// TranscribeAudio reads the audio file pointed to by the row's media_key, transcribes
// it via the chain, and returns the resulting text wrapped as a StepResult.
// For files larger than 24 MB it uses ffmpeg silence-aware chunking.
func TranscribeAudio(
	ctx context.Context,
	chain *providers.Chain[transcription.TranscriptionProvider],
	storage services.StorageProvider,
	queries store.Querier,
	job *worker.Job,
	ffmpeg *services.FFmpeg,
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
	fileBytes := info.Size()

	if fileBytes <= audioChunkSizeThresholdBytes {
		// Single-call path — fits within Whisper limit.
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
		return resultBlob(text)
	}

	// Chunked path — file exceeds 24 MB.
	// We need the duration; use DurationSeconds from the row.
	if !row.DurationSeconds.Valid {
		return nil, fmt.Errorf("transcribe_audio: cannot chunk without duration_seconds")
	}
	durSec := float64(row.DurationSeconds.Int32)

	silences, err := ffmpeg.DetectSilence(ctx, tmpFile, silenceNoiseDB, silenceMinSec)
	if err != nil {
		return nil, fmt.Errorf("transcribe_audio: silence detect: %w", err)
	}
	boundaries := pickSplitPoints(durSec, targetSegmentSec, chunkToleranceSec, silences)

	var fullText strings.Builder
	for i, b := range boundaries {
		chunkPath := fmt.Sprintf("%s.chunk%03d", tmpFile, i)
		if err := ffmpeg.SplitSegment(ctx, tmpFile, b[0], b[1], chunkPath); err != nil {
			return nil, fmt.Errorf("transcribe_audio: split %d: %w", i, err)
		}
		paths, err := halveUntilSafe(ctx, ffmpeg, chunkPath, b[0], b[1])
		if err != nil {
			return nil, fmt.Errorf("transcribe_audio: halve: %w", err)
		}
		for _, cp := range paths {
			var t string
			err := chain.Execute(func(_ string, p transcription.TranscriptionProvider) error {
				r, perr := p.Transcribe(ctx, cp)
				if perr != nil {
					return perr
				}
				t = r.Text
				return nil
			})
			os.Remove(cp)
			if err != nil {
				return nil, fmt.Errorf("transcribe_audio: chunk %s: %w", cp, err)
			}
			if fullText.Len() > 0 {
				fullText.WriteString("\n\n")
			}
			fullText.WriteString(t)
		}
	}

	return resultBlob(fullText.String())
}

// pickSplitPoints divides [0, durationSec] into segments of roughly targetSec,
// preferring the midpoint of any silence region within ±toleranceSec of each
// target. Returns [start, end) pairs in order.
func pickSplitPoints(durationSec, targetSec, toleranceSec float64, silences []services.SilenceMarker) [][2]float64 {
	if durationSec <= targetSec {
		return [][2]float64{{0, durationSec}}
	}
	var bounds []float64
	bounds = append(bounds, 0)
	cursor := targetSec
	for cursor < durationSec {
		// Find the silence whose midpoint is closest to `cursor` AND past the previous bound,
		// within tolerance.
		best := cursor
		bestDist := toleranceSec + 1
		for _, s := range silences {
			mid := (s.StartSec + s.EndSec) / 2
			if mid <= bounds[len(bounds)-1] {
				continue
			}
			d := math.Abs(mid - cursor)
			if d < bestDist && d <= toleranceSec {
				best = mid
				bestDist = d
			}
		}
		bounds = append(bounds, best)
		cursor = best + targetSec
	}
	bounds = append(bounds, durationSec)
	out := make([][2]float64, 0, len(bounds)-1)
	for i := 0; i < len(bounds)-1; i++ {
		out = append(out, [2]float64{bounds[i], bounds[i+1]})
	}
	return out
}

// halveUntilSafe recursively halves a chunk file until each piece is <= 24 MB.
// Removes the input on success (it's been replaced by halves).
func halveUntilSafe(ctx context.Context, ff *services.FFmpeg, inputPath string, startSec, endSec float64) ([]string, error) {
	info, err := os.Stat(inputPath)
	if err != nil {
		return nil, err
	}
	if info.Size() <= audioChunkSizeThresholdBytes {
		return []string{inputPath}, nil
	}
	mid := (startSec + endSec) / 2
	leftPath := inputPath + ".L"
	rightPath := inputPath + ".R"
	if err := ff.SplitSegment(ctx, inputPath, startSec, mid, leftPath); err != nil {
		return nil, err
	}
	if err := ff.SplitSegment(ctx, inputPath, mid, endSec, rightPath); err != nil {
		return nil, err
	}
	os.Remove(inputPath)
	leftPaths, err := halveUntilSafe(ctx, ff, leftPath, startSec, mid)
	if err != nil {
		return nil, err
	}
	rightPaths, err := halveUntilSafe(ctx, ff, rightPath, mid, endSec)
	if err != nil {
		return nil, err
	}
	return append(leftPaths, rightPaths...), nil
}

// resultBlob marshals a TranscribeAudioResult and wraps it in a StepResult.
func resultBlob(text string) (*worker.StepResult, error) {
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
