package handler

import (
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"os"
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

// SavesHandler handles save CRUD and search endpoints.
type SavesHandler struct {
	queries  store.Querier
	producer *queue.Producer
	search   *search.SemanticSearch
	maxSize  int64
}

// NewSavesHandler creates a new SavesHandler.
func NewSavesHandler(queries store.Querier, producer *queue.Producer, search *search.SemanticSearch, maxSize int64) *SavesHandler {
	return &SavesHandler{
		queries:  queries,
		producer: producer,
		search:   search,
		maxSize:  maxSize,
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
		h.createImage(w, r, userID)
		return
	}
	h.createURL(w, r, userID)
}

type createURLRequest struct {
	URL     string `json:"url"`
	Content string `json:"content,omitempty"`
	Title   string `json:"title,omitempty"`
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
		WriteError(w, http.StatusBadRequest, "content must be at most 100000 characters")
		return
	}
	if len(req.Title) > 500 {
		WriteError(w, http.StatusBadRequest, "title must be at most 500 characters")
		return
	}

	// Create content record.
	var contentID pgtype.UUID

	if req.Content != "" {
		// Pre-extracted content provided — write extracted_text at create time.
		content, err := h.queries.CreateContentWithExtracted(r.Context(), store.CreateContentWithExtractedParams{
			UserID:        userID,
			SourceUrl:     pgtextFrom(req.URL),
			SourceType:    "article",
			SourceTitle:   pgtextFrom(req.Title),
			ExtractedText: pgtextFrom(req.Content),
		})
		if err != nil {
			slog.Error("failed to create content record", "error", err, "userID", userID)
			WriteError(w, http.StatusInternalServerError, "failed to create save")
			return
		}
		contentID = content.ID
	} else {
		content, err := h.queries.CreateContent(r.Context(), store.CreateContentParams{
			UserID:      userID,
			SourceUrl:   pgtextFrom(req.URL),
			SourceType:  "article",
			SourceTitle: pgtextFrom(req.Title),
		})
		if err != nil {
			slog.Error("failed to create content record", "error", err, "userID", userID)
			WriteError(w, http.StatusInternalServerError, "failed to create save")
			return
		}
		contentID = content.ID
	}

	// Create job record.
	jobID, err := h.queries.CreateJob(r.Context(), store.CreateJobParams{
		ContentID:   contentID,
		UserID:      userID,
		ContentType: "article",
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
		ContentType: "article",
		SourceURL:   req.URL,
		MaxAttempts: 5,
	}
	if err := h.producer.Enqueue(r.Context(), payload); err != nil {
		slog.Error("failed to enqueue job", "error", err, "jobID", uuidFromPgtype(jobID).String())
		WriteError(w, http.StatusInternalServerError, "failed to enqueue processing job")
		return
	}

	WriteJSON(w, http.StatusCreated, saveResponse{
		ID:     uuidToString(contentID),
		Status: "pending",
	})
}

func (h *SavesHandler) createImage(w http.ResponseWriter, r *http.Request, userID string) {
	maxSize := h.maxSize
	if maxSize <= 0 {
		maxSize = 10 << 20 // 10 MB default
	}

	if err := r.ParseMultipartForm(maxSize); err != nil {
		WriteError(w, http.StatusRequestEntityTooLarge, fmt.Sprintf("file too large (max %dMB)", maxSize/(1024*1024)))
		return
	}

	file, header, err := r.FormFile("image")
	if err != nil {
		WriteError(w, http.StatusBadRequest, "image field is required")
		return
	}
	defer file.Close()

	// Validate MIME type.
	buf := make([]byte, 512)
	n, err := file.Read(buf)
	if err != nil && err != io.EOF {
		WriteError(w, http.StatusBadRequest, "failed to read image")
		return
	}
	buf = buf[:n]
	mimeType := http.DetectContentType(buf)

	allowed := map[string]bool{
		"image/jpeg": true,
		"image/png":  true,
		"image/webp": true,
	}
	if !allowed[mimeType] {
		WriteError(w, http.StatusBadRequest, fmt.Sprintf("unsupported image type: %s (must be jpeg, png, or webp)", mimeType))
		return
	}

	// Save to temp file under /tmp/mindtab/{uuid}/.
	dirID := uuid.New()
	dirPath := fmt.Sprintf("/tmp/mindtab/%s", dirID.String())
	if err := os.MkdirAll(dirPath, 0o755); err != nil {
		slog.Error("failed to create temp dir", "error", err)
		WriteError(w, http.StatusInternalServerError, "failed to prepare image storage")
		return
	}

	ext := imageExtFromMIME(mimeType)
	tempPath := fmt.Sprintf("%s/%s%s", dirPath, dirID.String(), ext)
	f, err := os.Create(tempPath)
	if err != nil {
		slog.Error("failed to create temp file", "error", err)
		WriteError(w, http.StatusInternalServerError, "failed to store image")
		return
	}
	defer f.Close()

	// Write already-read bytes then the rest.
	if _, err := f.Write(buf); err != nil {
		slog.Error("failed to write image header to temp file", "error", err)
		WriteError(w, http.StatusInternalServerError, "failed to store image")
		return
	}
	if _, err := io.Copy(f, file); err != nil {
		slog.Error("failed to write image body to temp file", "error", err)
		WriteError(w, http.StatusInternalServerError, "failed to store image")
		return
	}

	// Determine a title from the original filename.
	title := header.Filename

	// Create content record.
	content, err := h.queries.CreateContent(r.Context(), store.CreateContentParams{
		UserID:      userID,
		SourceUrl:   pgtype.Text{},
		SourceType:  "image",
		SourceTitle: pgtextFrom(title),
	})
	if err != nil {
		os.RemoveAll(dirPath)
		slog.Error("failed to create content record for image", "error", err, "userID", userID)
		WriteError(w, http.StatusInternalServerError, "failed to create save")
		return
	}

	// Create job record.
	jobID, err := h.queries.CreateJob(r.Context(), store.CreateJobParams{
		ContentID:   content.ID,
		UserID:      userID,
		ContentType: "image",
	})
	if err != nil {
		os.RemoveAll(dirPath)
		slog.Error("failed to create job record for image", "error", err, "contentID", uuidToString(content.ID))
		WriteError(w, http.StatusInternalServerError, "failed to create processing job")
		return
	}

	// Enqueue to Redis with temp path.
	payload := queue.JobPayload{
		JobID:         uuidFromPgtype(jobID),
		ContentID:     uuidFromPgtype(content.ID),
		UserID:        userID,
		ContentType:   "image",
		TempImagePath: tempPath,
		ImageMIME:     mimeType,
		MaxAttempts:   5,
	}
	if err := h.producer.Enqueue(r.Context(), payload); err != nil {
		os.RemoveAll(dirPath)
		slog.Error("failed to enqueue image job", "error", err, "jobID", uuidFromPgtype(jobID).String())
		WriteError(w, http.StatusInternalServerError, "failed to enqueue processing job")
		return
	}

	WriteJSON(w, http.StatusCreated, saveResponse{
		ID:     uuidToString(content.ID),
		Status: "pending",
	})
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
		items = append(items, contentListJSON{
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
			ProcessingStatus:   row.ProcessingStatus,
			ProcessingError:    textToPtr(row.ProcessingError),
			CreatedAt:          timestamptzToPtr(row.CreatedAt),
			UpdatedAt:          timestamptzToPtr(row.UpdatedAt),
		})
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

	WriteJSON(w, http.StatusOK, contentJSON{
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
		ProcessingStatus:   row.ProcessingStatus,
		ProcessingError:    textToPtr(row.ProcessingError),
		CreatedAt:          timestamptzToPtr(row.CreatedAt),
		UpdatedAt:          timestamptzToPtr(row.UpdatedAt),
	})
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

// ServeMedia handles GET /media/* — serves stored media files behind auth.
func (h *SavesHandler) ServeMedia(storage services.StorageProvider) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID := middleware.UserIDFromContext(r.Context())
		key := chi.URLParam(r, "*")

		// Verify the key belongs to this user
		if !strings.HasPrefix(key, userID+"/") {
			WriteError(w, http.StatusForbidden, "access denied")
			return
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
