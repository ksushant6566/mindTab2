package handler

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/ksushant6566/mindtab/server/internal/middleware"
	"github.com/ksushant6566/mindtab/server/internal/queue"
	"github.com/ksushant6566/mindtab/server/internal/search"
	"github.com/ksushant6566/mindtab/server/internal/services"
	"github.com/ksushant6566/mindtab/server/internal/store"
)

const maxAudioBytes int64 = 500 * 1024 * 1024
const maxAudioDurationSeconds int32 = 5400 // 90 min

var allowedAudioMIMEs = map[string]string{
	"audio/mp4":  ".m4a",
	"audio/mpeg": ".mp3",
	"audio/wav":  ".wav",
	"audio/ogg":  ".ogg",
	"audio/webm": ".webm",
	"audio/flac": ".flac",
}

// enqueuer abstracts the job queue producer for testability.
type enqueuer interface {
	Enqueue(ctx context.Context, payload queue.JobPayload) error
}

// searcher abstracts semantic search for testability.
type searcher interface {
	Search(ctx context.Context, userID string, query string, limit int) ([]search.SearchResult, error)
}

// SavesHandler handles save CRUD and search endpoints.
type SavesHandler struct {
	queries   store.Querier
	producer  enqueuer
	search    searcher
	storage   services.StorageProvider
	maxSize   int64
	jwtSecret string
}

// NewSavesHandler creates a new SavesHandler.
func NewSavesHandler(queries store.Querier, producer enqueuer, search searcher, storage services.StorageProvider, maxSize int64, jwtSecret string) *SavesHandler {
	return &SavesHandler{
		queries:   queries,
		producer:  producer,
		search:    search,
		storage:   storage,
		maxSize:   maxSize,
		jwtSecret: jwtSecret,
	}
}

// saveResponse is the response body for POST /saves.
type saveResponse struct {
	ID     string `json:"id"`
	Status string `json:"status"`
}

// contentJSON is the response body for list/get responses.
type contentJSON struct {
	ID                 string     `json:"id"`
	UserID             string     `json:"user_id"`
	SourceURL          *string    `json:"source_url,omitempty"`
	SourceType         string     `json:"source_type"`
	SourceTitle        *string    `json:"source_title,omitempty"`
	SourceThumbnailURL *string    `json:"source_thumbnail_url,omitempty"`
	ExtractedText      *string    `json:"extracted_text,omitempty"`
	VisualDescription  *string    `json:"visual_description,omitempty"`
	Summary            *string    `json:"summary,omitempty"`
	Tags               []string   `json:"tags"`
	KeyTopics          []string   `json:"key_topics"`
	SummaryProvider    *string    `json:"summary_provider,omitempty"`
	EmbeddingProvider  *string    `json:"embedding_provider,omitempty"`
	EmbeddingModel     *string    `json:"embedding_model,omitempty"`
	MediaKey           *string    `json:"media_key,omitempty"`
	SourceMediaURL     *string    `json:"source_media_url,omitempty"`
	DurationSeconds    *int32     `json:"duration_seconds,omitempty"`
	VideoThumbnailURL  *string    `json:"video_thumbnail_url,omitempty"`
	VideoChannel       *string    `json:"video_channel,omitempty"`
	TranscriptSource   *string    `json:"transcript_source,omitempty"`
	ProcessingStatus   string     `json:"processing_status"`
	ProcessingError    *string    `json:"processing_error,omitempty"`
	CreatedAt          *time.Time `json:"created_at,omitempty"`
	UpdatedAt          *time.Time `json:"updated_at,omitempty"`
}

// contentListJSON is a minimal response for list items (no extracted_text/visual_description/embedding fields).
type contentListJSON struct {
	ID                 string     `json:"id"`
	UserID             string     `json:"user_id"`
	SourceURL          *string    `json:"source_url,omitempty"`
	SourceType         string     `json:"source_type"`
	SourceTitle        *string    `json:"source_title,omitempty"`
	SourceThumbnailURL *string    `json:"source_thumbnail_url,omitempty"`
	Summary            *string    `json:"summary,omitempty"`
	Tags               []string   `json:"tags"`
	KeyTopics          []string   `json:"key_topics"`
	MediaKey           *string    `json:"media_key,omitempty"`
	SourceMediaURL     *string    `json:"source_media_url,omitempty"`
	DurationSeconds    *int32     `json:"duration_seconds,omitempty"`
	VideoThumbnailURL  *string    `json:"video_thumbnail_url,omitempty"`
	VideoChannel       *string    `json:"video_channel,omitempty"`
	ProcessingStatus   string     `json:"processing_status"`
	ProcessingError    *string    `json:"processing_error,omitempty"`
	CreatedAt          *time.Time `json:"created_at,omitempty"`
	UpdatedAt          *time.Time `json:"updated_at,omitempty"`
}

// uuidFromPgtype converts a pgtype.UUID to a uuid.UUID for use in Redis payloads.
func uuidFromPgtype(u pgtype.UUID) uuid.UUID {
	if !u.Valid {
		return uuid.Nil
	}
	return uuid.UUID(u.Bytes)
}

// Create handles POST /saves.
// Content-Type application/json → article pipeline.
// Content-Type multipart/form-data → image pipeline.
func (h *SavesHandler) Create(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())
	ct := r.Header.Get("Content-Type")

	if strings.HasPrefix(ct, "multipart/form-data") {
		// Apply size cap. We use the audio cap (500 MB) since it's larger than the image cap;
		// image-specific size validation already happens inside createImage.
		r.Body = http.MaxBytesReader(w, r.Body, maxAudioBytes)
		if err := r.ParseMultipartForm(32 << 20); err != nil {
			var maxErr *http.MaxBytesError
			if errors.As(err, &maxErr) {
				WriteError(w, http.StatusRequestEntityTooLarge, "file too large")
				return
			}
			WriteError(w, http.StatusBadRequest, "invalid multipart body")
			return
		}
		autoCommit := parseFormFlag(r, "auto_commit")
		startProcessing := parseFormFlag(r, "start_processing")
		if _, _, err := r.FormFile("audio"); err == nil {
			h.createAudio(w, r, userID, autoCommit, startProcessing)
			return
		}
		if _, _, err := r.FormFile("image"); err == nil {
			h.createImage(w, r, userID, autoCommit, startProcessing)
			return
		}
		WriteError(w, http.StatusBadRequest, "missing file (expected audio or image field)")
		return
	}
	h.createURL(w, r, userID)
}

type createURLRequest struct {
	URL             string `json:"url"`
	Content         string `json:"content,omitempty"`
	Title           string `json:"title,omitempty"`
	AutoCommit      *bool  `json:"auto_commit,omitempty"`
	StartProcessing *bool  `json:"start_processing,omitempty"`
}

// resolveLifecycleFlags maps the nullable auto_commit / start_processing flags
// to the string values stored in the DB.  Both flags default to true when omitted.
func resolveLifecycleFlags(autoCommit, startProcessing *bool) (commit string, processing string) {
	ac := true
	if autoCommit != nil {
		ac = *autoCommit
	}
	sp := true
	if startProcessing != nil {
		sp = *startProcessing
	}
	if ac {
		commit = "committed"
	} else {
		commit = "draft"
	}
	if sp {
		processing = "pending"
	} else {
		processing = "deferred"
	}
	return
}

// parseFormFlag reads a multipart form field as a *bool.
// Returns nil when the field is absent, &true when "true", &false otherwise.
func parseFormFlag(r *http.Request, name string) *bool {
	v := r.FormValue(name)
	if v == "" {
		return nil
	}
	b := v == "true"
	return &b
}

func (h *SavesHandler) createURL(w http.ResponseWriter, r *http.Request, userID string) {
	var req createURLRequest
	if err := ReadJSON(r, &req); err != nil {
		WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	// Validate URL.
	if req.URL == "" {
		WriteError(w, http.StatusBadRequest, "url is required")
		return
	}
	if len(req.URL) > 2048 {
		WriteError(w, http.StatusBadRequest, "url must be at most 2048 characters")
		return
	}
	parsed, err := url.ParseRequestURI(req.URL)
	if err != nil || (parsed.Scheme != "http" && parsed.Scheme != "https") {
		WriteError(w, http.StatusBadRequest, "url must be a valid http or https URL")
		return
	}

	// Validate optional fields.
	if len(req.Content) > 100000 {
		WriteError(w, http.StatusBadRequest, "content must be at most 100000 bytes")
		return
	}
	if len(req.Title) > 500 {
		WriteError(w, http.StatusBadRequest, "title must be at most 500 bytes")
		return
	}

	contentType := "article"
	if isYouTubeURL(req.URL) {
		contentType = "youtube"
	}

	commitStatus, processingStatus := resolveLifecycleFlags(req.AutoCommit, req.StartProcessing)

	// Create content record.
	var contentID pgtype.UUID

	if req.Content != "" {
		// Pre-extracted content provided — write extracted_text at create time.
		content, err := h.queries.CreateContentWithExtracted(r.Context(), store.CreateContentWithExtractedParams{
			ID:               uuidFromGoogle(uuid.New()),
			UserID:           userID,
			SourceUrl:        pgtextFrom(req.URL),
			SourceType:       contentType,
			SourceTitle:      pgtextFrom(req.Title),
			ExtractedText:    pgtextFrom(req.Content),
			ProcessingStatus: processingStatus,
			CommitStatus:     commitStatus,
		})
		if err != nil {
			slog.Error("failed to create content record", "error", err, "userID", userID)
			WriteError(w, http.StatusInternalServerError, "failed to create save")
			return
		}
		contentID = content.ID
	} else {
		content, err := h.queries.CreateContent(r.Context(), store.CreateContentParams{
			ID:               uuidFromGoogle(uuid.New()),
			UserID:           userID,
			SourceUrl:        pgtextFrom(req.URL),
			SourceType:       contentType,
			SourceTitle:      pgtextFrom(req.Title),
			ProcessingStatus: processingStatus,
			CommitStatus:     commitStatus,
		})
		if err != nil {
			slog.Error("failed to create content record", "error", err, "userID", userID)
			WriteError(w, http.StatusInternalServerError, "failed to create save")
			return
		}
		contentID = content.ID
	}

	if processingStatus == "deferred" {
		WriteJSON(w, http.StatusCreated, saveResponse{
			ID:     uuidToString(contentID),
			Status: processingStatus,
		})
		return
	}

	// Create job record.
	jobID, err := h.queries.CreateJob(r.Context(), store.CreateJobParams{
		ContentID:   contentID,
		UserID:      userID,
		ContentType: contentType,
	})
	if err != nil {
		slog.Error("failed to create job record", "error", err, "contentID", uuidToString(contentID))
		WriteError(w, http.StatusInternalServerError, "failed to create processing job")
		return
	}

	// Enqueue to Redis.
	payload := queue.JobPayload{
		JobID:       uuidFromPgtype(jobID),
		ContentID:   uuidFromPgtype(contentID),
		UserID:      userID,
		ContentType: contentType,
		MaxAttempts: 5,
	}
	if err := h.producer.Enqueue(r.Context(), payload); err != nil {
		slog.Error("failed to enqueue job", "error", err, "jobID", uuidFromPgtype(jobID).String())
		WriteError(w, http.StatusInternalServerError, "failed to enqueue processing job")
		return
	}

	WriteJSON(w, http.StatusCreated, saveResponse{
		ID:     uuidToString(contentID),
		Status: processingStatus,
	})
}

func (h *SavesHandler) createImage(w http.ResponseWriter, r *http.Request, userID string, autoCommit, startProcessing *bool) {
	// r.ParseMultipartForm has already been called by Create before dispatching here.
	// Calling it again is a no-op; we skip it.

	file, header, err := r.FormFile("image")
	if err != nil {
		WriteError(w, http.StatusBadRequest, "image field is required")
		return
	}
	defer file.Close()

	// Validate MIME type from the part's Content-Type header first;
	// fall back to sniffing the first 512 bytes.
	mime := header.Header.Get("Content-Type")
	if !isAllowedImageMIME(mime) {
		// Sniff bytes for cases where the client sends an incorrect or missing Content-Type.
		sniff := make([]byte, 512)
		n, readErr := file.Read(sniff)
		if readErr != nil && readErr != io.EOF {
			WriteError(w, http.StatusBadRequest, "failed to read image")
			return
		}
		sniff = sniff[:n]
		mime = http.DetectContentType(sniff)
		if !isAllowedImageMIME(mime) {
			WriteError(w, http.StatusBadRequest, fmt.Sprintf("unsupported image type: %s (must be jpeg, png, or webp)", mime))
			return
		}
		// Re-create a reader from the sniffed bytes + remaining file content.
		file2 := io.MultiReader(bytes.NewReader(sniff), file)
		buf, readErr2 := io.ReadAll(file2)
		if readErr2 != nil {
			slog.Error("failed to read image body", "error", readErr2)
			WriteError(w, http.StatusInternalServerError, "failed to read image")
			return
		}
		h.writeImageRecord(w, r, userID, autoCommit, startProcessing, header.Filename, mime, buf)
		return
	}

	// Happy path: MIME was valid from Content-Type header.
	buf, err := io.ReadAll(file)
	if err != nil {
		slog.Error("failed to read image body", "error", err)
		WriteError(w, http.StatusInternalServerError, "failed to read image")
		return
	}
	h.writeImageRecord(w, r, userID, autoCommit, startProcessing, header.Filename, mime, buf)
}

// writeImageRecord stores the image bytes to permanent storage, creates the DB record, and enqueues.
func (h *SavesHandler) writeImageRecord(
	w http.ResponseWriter, r *http.Request,
	userID string, autoCommit, startProcessing *bool,
	filename, mime string, buf []byte,
) {
	contentID := uuid.New()
	ext := imageExtFromMIME(mime)
	mediaKey := fmt.Sprintf("%s/%s/image%s", userID, contentID.String(), ext)

	if err := h.storage.Save(r.Context(), mediaKey, bytes.NewReader(buf), mime); err != nil {
		slog.Error("failed to store image", "error", err, "mediaKey", mediaKey)
		WriteError(w, http.StatusInternalServerError, "failed to store image")
		return
	}

	commitStatus, procStatus := resolveLifecycleFlags(autoCommit, startProcessing)

	row, err := h.queries.CreateContent(r.Context(), store.CreateContentParams{
		ID:               uuidFromGoogle(contentID),
		UserID:           userID,
		SourceType:       "image",
		SourceTitle:      pgtextFrom(filename),
		MediaKey:         pgtype.Text{String: mediaKey, Valid: true},
		MediaMime:        pgtype.Text{String: mime, Valid: true},
		MediaFileBytes:   pgtype.Int8{Int64: int64(len(buf)), Valid: true},
		ProcessingStatus: procStatus,
		CommitStatus:     commitStatus,
	})
	if err != nil {
		slog.Error("failed to create content record for image", "error", err, "userID", userID)
		WriteError(w, http.StatusInternalServerError, "failed to create save")
		return
	}

	if procStatus == "pending" {
		jobID, err := h.queries.CreateJob(r.Context(), store.CreateJobParams{
			ContentID:   row.ID,
			UserID:      userID,
			ContentType: "image",
		})
		if err != nil {
			slog.Error("failed to create job record for image", "error", err, "contentID", uuidToString(row.ID))
			WriteError(w, http.StatusInternalServerError, "failed to create processing job")
			return
		}
		if err := h.producer.Enqueue(r.Context(), queue.JobPayload{
			JobID:       uuidFromPgtype(jobID),
			ContentID:   uuidFromPgtype(row.ID),
			UserID:      userID,
			ContentType: "image",
			MaxAttempts: 5,
		}); err != nil {
			slog.Error("failed to enqueue image job", "error", err, "jobID", uuidFromPgtype(jobID).String())
			WriteError(w, http.StatusInternalServerError, "failed to enqueue processing job")
			return
		}
	}

	writeSaveResponse(w, row, h.storage)
}

func (h *SavesHandler) createAudio(w http.ResponseWriter, r *http.Request, userID string, autoCommit, startProcessing *bool) {
	file, header, err := r.FormFile("audio")
	if err != nil {
		WriteError(w, http.StatusBadRequest, "missing audio file")
		return
	}
	defer file.Close()

	mime := header.Header.Get("Content-Type")
	ext, ok := allowedAudioMIMEs[mime]
	if !ok {
		WriteError(w, http.StatusUnsupportedMediaType, "unsupported audio type")
		return
	}

	durationStr := r.FormValue("duration_seconds")
	if durationStr == "" {
		WriteError(w, http.StatusBadRequest, "duration_seconds required")
		return
	}
	durSec64, err := strconv.ParseInt(durationStr, 10, 32)
	if err != nil || durSec64 <= 0 || int32(durSec64) > maxAudioDurationSeconds {
		WriteError(w, http.StatusBadRequest, "duration_seconds out of range")
		return
	}
	durSec := int32(durSec64)

	contentID := uuid.New()
	mediaKey := fmt.Sprintf("%s/%s/audio%s", userID, contentID, ext)

	buf, err := io.ReadAll(file)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "read upload")
		return
	}
	if err := h.storage.Save(r.Context(), mediaKey, bytes.NewReader(buf), mime); err != nil {
		slog.Error("failed to store audio", "error", err, "mediaKey", mediaKey)
		WriteError(w, http.StatusInternalServerError, "store audio")
		return
	}

	commitStatus, processingStatus := resolveLifecycleFlags(autoCommit, startProcessing)

	nowTitle := fmt.Sprintf("Voice note · %s", time.Now().Format("Jan 2, 3:04 PM"))

	row, err := h.queries.CreateContent(r.Context(), store.CreateContentParams{
		ID:               uuidFromGoogle(contentID),
		UserID:           userID,
		SourceUrl:        pgtype.Text{},
		SourceType:       "audio",
		SourceTitle:      pgtype.Text{String: nowTitle, Valid: true},
		ExtractedText:    pgtype.Text{},
		MediaKey:         pgtype.Text{String: mediaKey, Valid: true},
		MediaMime:        pgtype.Text{String: mime, Valid: true},
		MediaFileBytes:   pgtype.Int8{Int64: int64(len(buf)), Valid: true},
		DurationSeconds:  pgtype.Int4{Int32: durSec, Valid: true},
		ProcessingStatus: processingStatus,
		CommitStatus:     commitStatus,
	})
	if err != nil {
		slog.Error("failed to create content record for audio", "error", err, "userID", userID)
		// Best-effort cleanup of the stored file.
		_ = h.storage.Delete(r.Context(), mediaKey)
		WriteError(w, http.StatusInternalServerError, "create content")
		return
	}

	if processingStatus == "pending" {
		jobID, err := h.queries.CreateJob(r.Context(), store.CreateJobParams{
			ContentID:   row.ID,
			UserID:      userID,
			ContentType: "audio",
		})
		if err != nil {
			slog.Error("failed to create job record for audio", "error", err, "contentID", uuidToString(row.ID))
			WriteError(w, http.StatusInternalServerError, "create job")
			return
		}
		if err := h.producer.Enqueue(r.Context(), queue.JobPayload{
			JobID:       uuidFromPgtype(jobID),
			ContentID:   uuidFromPgtype(row.ID),
			UserID:      userID,
			ContentType: "audio",
			MaxAttempts: 5,
		}); err != nil {
			slog.Error("failed to enqueue audio job", "error", err, "jobID", uuidFromPgtype(jobID).String())
			WriteError(w, http.StatusInternalServerError, "enqueue")
			return
		}
	}

	writeSaveResponse(w, row, h.storage)
}

// List handles GET /saves.
// Query params: limit (default 20, max 100), offset (default 0).
func (h *SavesHandler) List(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())

	limit := int32(20)
	offset := int32(0)

	if v := r.URL.Query().Get("limit"); v != "" {
		n, err := strconv.ParseInt(v, 10, 32)
		if err != nil || n < 1 {
			WriteError(w, http.StatusBadRequest, "limit must be a positive integer")
			return
		}
		if n > 100 {
			n = 100
		}
		limit = int32(n)
	}
	if v := r.URL.Query().Get("offset"); v != "" {
		n, err := strconv.ParseInt(v, 10, 32)
		if err != nil || n < 0 {
			WriteError(w, http.StatusBadRequest, "offset must be a non-negative integer")
			return
		}
		offset = int32(n)
	}

	rows, err := h.queries.ListContent(r.Context(), store.ListContentParams{
		UserID: userID,
		Limit:  limit,
		Offset: offset,
	})
	if err != nil {
		slog.Error("failed to list content", "error", err, "userID", userID)
		WriteError(w, http.StatusInternalServerError, "failed to list saves")
		return
	}

	items := make([]contentListJSON, 0, len(rows))
	for _, row := range rows {
		item := contentListJSON{
			ID:                 uuidToString(row.ID),
			UserID:             row.UserID,
			SourceURL:          textToPtr(row.SourceUrl),
			SourceType:         row.SourceType,
			SourceTitle:        textToPtr(row.SourceTitle),
			SourceThumbnailURL: textToPtr(row.SourceThumbnailUrl),
			Summary:            textToPtr(row.Summary),
			Tags:               nullableStringSlice(row.Tags),
			KeyTopics:          nullableStringSlice(row.KeyTopics),
			MediaKey:           textToPtr(row.MediaKey),
			DurationSeconds:    int4ToPtr(row.DurationSeconds),
			VideoThumbnailURL:  textToPtr(row.VideoThumbnailUrl),
			VideoChannel:       textToPtr(row.VideoChannel),
			ProcessingStatus:   row.ProcessingStatus,
			ProcessingError:    textToPtr(row.ProcessingError),
			CreatedAt:          timestamptzToPtr(row.CreatedAt),
			UpdatedAt:          timestamptzToPtr(row.UpdatedAt),
		}
		if row.MediaKey.Valid {
			signed := h.signMediaURL(row.MediaKey.String, 1*time.Hour)
			item.SourceMediaURL = &signed
		}
		items = append(items, item)
	}

	WriteJSON(w, http.StatusOK, items)
}

// Get handles GET /saves/{id}.
func (h *SavesHandler) Get(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())

	id, err := GetUUIDParam(r, "id")
	if err != nil {
		WriteError(w, http.StatusBadRequest, err.Error())
		return
	}

	row, err := h.queries.GetContentByID(r.Context(), store.GetContentByIDParams{
		ID:     uuidFromGoogle(id),
		UserID: userID,
	})
	if err != nil {
		if isNotFound(err) {
			WriteError(w, http.StatusNotFound, "save not found")
			return
		}
		slog.Error("failed to get content", "error", err, "id", id, "userID", userID)
		WriteError(w, http.StatusInternalServerError, "failed to get save")
		return
	}

	item := contentJSON{
		ID:                 uuidToString(row.ID),
		UserID:             row.UserID,
		SourceURL:          textToPtr(row.SourceUrl),
		SourceType:         row.SourceType,
		SourceTitle:        textToPtr(row.SourceTitle),
		SourceThumbnailURL: textToPtr(row.SourceThumbnailUrl),
		ExtractedText:      textToPtr(row.ExtractedText),
		VisualDescription:  textToPtr(row.VisualDescription),
		Summary:            textToPtr(row.Summary),
		Tags:               nullableStringSlice(row.Tags),
		KeyTopics:          nullableStringSlice(row.KeyTopics),
		SummaryProvider:    textToPtr(row.SummaryProvider),
		EmbeddingProvider:  textToPtr(row.EmbeddingProvider),
		EmbeddingModel:     textToPtr(row.EmbeddingModel),
		MediaKey:           textToPtr(row.MediaKey),
		DurationSeconds:    int4ToPtr(row.DurationSeconds),
		VideoThumbnailURL:  textToPtr(row.VideoThumbnailUrl),
		VideoChannel:       textToPtr(row.VideoChannel),
		TranscriptSource:   textToPtr(row.TranscriptSource),
		ProcessingStatus:   row.ProcessingStatus,
		ProcessingError:    textToPtr(row.ProcessingError),
		CreatedAt:          timestamptzToPtr(row.CreatedAt),
		UpdatedAt:          timestamptzToPtr(row.UpdatedAt),
	}
	if row.MediaKey.Valid {
		signed := h.signMediaURL(row.MediaKey.String, 1*time.Hour)
		item.SourceMediaURL = &signed
	}
	WriteJSON(w, http.StatusOK, item)
}

// Delete handles DELETE /saves/{id}.
func (h *SavesHandler) Delete(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())

	id, err := GetUUIDParam(r, "id")
	if err != nil {
		WriteError(w, http.StatusBadRequest, err.Error())
		return
	}

	if err := h.queries.SoftDeleteContent(r.Context(), store.SoftDeleteContentParams{
		ID:     uuidFromGoogle(id),
		UserID: userID,
	}); err != nil {
		slog.Error("failed to delete content", "error", err, "id", id, "userID", userID)
		WriteError(w, http.StatusInternalServerError, "failed to delete save")
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

type commitRequest struct {
	Title string `json:"title,omitempty"`
}

// Commit handles POST /saves/{id}/commit.
// Flips a draft save to committed and, if processing was deferred, enqueues it.
func (h *SavesHandler) Commit(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())

	id, err := GetUUIDParam(r, "id")
	if err != nil {
		WriteError(w, http.StatusBadRequest, err.Error())
		return
	}

	var body commitRequest
	if r.ContentLength > 0 {
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			WriteError(w, http.StatusBadRequest, "bad body")
			return
		}
	}

	row, err := h.queries.GetContentByID(r.Context(), store.GetContentByIDParams{
		ID:     uuidFromGoogle(id),
		UserID: userID,
	})
	if err != nil {
		if isNotFound(err) {
			WriteError(w, http.StatusNotFound, "save not found")
			return
		}
		slog.Error("failed to get content for commit", "error", err, "id", id, "userID", userID)
		WriteError(w, http.StatusInternalServerError, "failed to get save")
		return
	}

	type commitResponse struct {
		ID               string `json:"id"`
		CommitStatus     string `json:"commit_status"`
		ProcessingStatus string `json:"processing_status"`
	}

	// Idempotent no-op: already committed and not deferred.
	if row.CommitStatus == "committed" && row.ProcessingStatus != "deferred" {
		WriteJSON(w, http.StatusOK, commitResponse{
			ID:               uuidToString(row.ID),
			CommitStatus:     row.CommitStatus,
			ProcessingStatus: row.ProcessingStatus,
		})
		return
	}

	// Flip commit_status (and optional title via COALESCE).
	if err := h.queries.UpdateContentCommitStatus(r.Context(), store.UpdateContentCommitStatusParams{
		ID:           row.ID,
		CommitStatus: "committed",
		SourceTitle:  pgtextFrom(body.Title),
		UserID:       userID,
	}); err != nil {
		slog.Error("failed to update commit status", "error", err, "id", id)
		WriteError(w, http.StatusInternalServerError, "failed to commit save")
		return
	}

	// If processing was deferred, flip to pending and enqueue.
	if row.ProcessingStatus == "deferred" {
		if err := h.queries.UpdateContentProcessingStatusToPending(r.Context(), row.ID); err != nil {
			slog.Error("failed to update processing status", "error", err, "id", id)
			WriteError(w, http.StatusInternalServerError, "failed to update processing status")
			return
		}
		// Insert the jobs row before enqueueing so the dispatcher's
		// StartJob/UpdateJobStatus/etc. updates have a target row.
		jobID, err := h.queries.CreateJob(r.Context(), store.CreateJobParams{
			ContentID:   row.ID,
			UserID:      userID,
			ContentType: row.SourceType,
		})
		if err != nil {
			slog.Error("failed to create job record", "error", err, "id", id)
			WriteError(w, http.StatusInternalServerError, "failed to create processing job")
			return
		}
		if err := h.producer.Enqueue(r.Context(), queue.JobPayload{
			JobID:       uuidFromPgtype(jobID),
			ContentID:   uuidFromPgtype(row.ID),
			UserID:      userID,
			ContentType: row.SourceType,
			MaxAttempts: 5,
		}); err != nil {
			slog.Error("failed to enqueue commit job", "error", err, "id", id)
			WriteError(w, http.StatusInternalServerError, "failed to enqueue processing job")
			return
		}
	}

	finalProcessing := row.ProcessingStatus
	if row.ProcessingStatus == "deferred" {
		finalProcessing = "pending"
	}

	WriteJSON(w, http.StatusOK, commitResponse{
		ID:               uuidToString(row.ID),
		CommitStatus:     "committed",
		ProcessingStatus: finalProcessing,
	})
}

type searchRequest struct {
	Query string `json:"query"`
	Limit int    `json:"limit"`
}

// Search handles POST /saves/search.
func (h *SavesHandler) Search(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())

	var req searchRequest
	if err := ReadJSON(r, &req); err != nil {
		WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if req.Query == "" {
		WriteError(w, http.StatusBadRequest, "query is required")
		return
	}

	limit := req.Limit
	if limit <= 0 {
		limit = 10
	}
	if limit > 50 {
		limit = 50
	}

	results, err := h.search.Search(r.Context(), userID, req.Query, limit)
	if err != nil {
		slog.Error("semantic search failed", "error", err, "userID", userID, "query", req.Query)
		WriteError(w, http.StatusInternalServerError, "search failed")
		return
	}

	if results == nil {
		results = []search.SearchResult{}
	}

	WriteJSON(w, http.StatusOK, results)
}

// signMediaURL generates an HMAC-signed URL for a media key with the given TTL.
func (h *SavesHandler) signMediaURL(key string, ttl time.Duration) string {
	exp := time.Now().Add(ttl).Unix()
	mac := hmac.New(sha256.New, []byte(h.jwtSecret))
	fmt.Fprintf(mac, "%s:%d", key, exp)
	sig := base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
	return fmt.Sprintf("/media/%s?sig=%s&exp=%d", key, sig, exp)
}

// verifyMediaSignature checks that the HMAC signature and expiry are valid.
func (h *SavesHandler) verifyMediaSignature(key, sig string, exp int64) bool {
	if time.Now().Unix() > exp {
		return false
	}
	mac := hmac.New(sha256.New, []byte(h.jwtSecret))
	fmt.Fprintf(mac, "%s:%d", key, exp)
	expected := base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
	return hmac.Equal([]byte(sig), []byte(expected))
}

// ServeMedia handles GET /media/* — serves stored media files.
// Supports two auth methods:
//  1. Signed URL: ?sig={hmac}&exp={timestamp} — self-authenticating, no middleware needed
//  2. Bearer token: Authorization header — requires auth middleware (backward compat)
func (h *SavesHandler) ServeMedia(storage services.StorageProvider) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		key := chi.URLParam(r, "*")

		sig := r.URL.Query().Get("sig")
		expStr := r.URL.Query().Get("exp")

		if sig != "" && expStr != "" {
			// Path 1: Signed URL verification
			exp, err := strconv.ParseInt(expStr, 10, 64)
			if err != nil || !h.verifyMediaSignature(key, sig, exp) {
				WriteError(w, http.StatusForbidden, "invalid or expired signature")
				return
			}
		} else {
			// Path 2: Bearer token — user ID from auth middleware
			userID := middleware.UserIDFromContext(r.Context())
			if userID == "" {
				WriteError(w, http.StatusUnauthorized, "authentication required")
				return
			}
			if !strings.HasPrefix(key, userID+"/") {
				WriteError(w, http.StatusForbidden, "access denied")
				return
			}
		}

		rc, err := storage.Get(r.Context(), key)
		if err != nil {
			WriteError(w, http.StatusNotFound, "file not found")
			return
		}
		defer rc.Close()

		io.Copy(w, rc)
	}
}

// --- helpers ---

// nullableStringSlice returns an empty slice instead of nil for JSON marshalling.
func nullableStringSlice(s []string) []string {
	if s == nil {
		return []string{}
	}
	return s
}

// isYouTubeURL reports whether rawURL points to a YouTube video.
func isYouTubeURL(rawURL string) bool {
	u, err := url.Parse(rawURL)
	if err != nil {
		return false
	}
	host := strings.ToLower(u.Hostname())
	path := u.Path

	switch host {
	case "youtu.be":
		// Short link — path must be more than just "/"
		return len(path) > 1
	case "youtube.com", "www.youtube.com", "m.youtube.com",
		"youtube-nocookie.com", "www.youtube-nocookie.com":
		return strings.HasPrefix(path, "/watch") ||
			strings.HasPrefix(path, "/shorts/") ||
			strings.HasPrefix(path, "/embed/") ||
			strings.HasPrefix(path, "/v/")
	}
	return false
}

// isAllowedImageMIME reports whether the MIME type is a supported image format.
func isAllowedImageMIME(m string) bool {
	switch m {
	case "image/jpeg", "image/png", "image/webp":
		return true
	}
	return false
}

// writeSaveResponse encodes the newly created content row as a JSON response.
func writeSaveResponse(w http.ResponseWriter, row store.CreateContentRow, storage services.StorageProvider) {
	resp := struct {
		ID               string `json:"id"`
		CommitStatus     string `json:"commit_status"`
		ProcessingStatus string `json:"processing_status"`
		MediaURL         string `json:"media_url,omitempty"`
	}{
		ID:               uuidToString(row.ID),
		CommitStatus:     row.CommitStatus,
		ProcessingStatus: row.ProcessingStatus,
	}
	if row.MediaKey.Valid {
		resp.MediaURL = storage.URL(row.MediaKey.String)
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(resp)
}

// imageExtFromMIME returns the file extension for a given image MIME type.
func imageExtFromMIME(mime string) string {
	switch mime {
	case "image/jpeg":
		return ".jpg"
	case "image/png":
		return ".png"
	case "image/webp":
		return ".webp"
	default:
		return ""
	}
}

// isNotFound returns true if the error indicates a not-found result from pgx.
func isNotFound(err error) bool {
	return err != nil && strings.Contains(err.Error(), "no rows")
}
