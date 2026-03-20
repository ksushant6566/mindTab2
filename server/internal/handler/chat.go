package handler

import (
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"strconv"
	"time"

	"github.com/google/uuid"
	"github.com/ksushant6566/mindtab/server/internal/middleware"
	"github.com/ksushant6566/mindtab/server/internal/store"
)

// ChatHandler handles conversation and message REST endpoints.
type ChatHandler struct {
	queries store.Querier
	maxSize int64
}

// NewChatHandler creates a new ChatHandler.
func NewChatHandler(queries store.Querier, maxSize int64) *ChatHandler {
	return &ChatHandler{
		queries: queries,
		maxSize: maxSize,
	}
}

// conversationListItem is the JSON shape for a single conversation in list responses.
type conversationListItem struct {
	ID        string     `json:"id"`
	Title     *string    `json:"title"`
	CreatedAt *time.Time `json:"created_at"`
	UpdatedAt *time.Time `json:"updated_at"`
}

// messageItem is the JSON shape for a single message in list responses.
type messageItem struct {
	ID         string          `json:"id"`
	Role       string          `json:"role"`
	Content    string          `json:"content"`
	Attachments json.RawMessage `json:"attachments"`
	ToolCalls  json.RawMessage  `json:"tool_calls"`
	ToolCallID *string          `json:"tool_call_id"`
	CreatedAt  *time.Time       `json:"created_at"`
}

// attachmentUploadResponse is the JSON shape for POST /chat/attachments.
type attachmentUploadResponse struct {
	MediaKey string `json:"media_key"`
	Filename string `json:"filename"`
	MimeType string `json:"mime_type"`
	Size     int64  `json:"size"`
}

// ListConversations handles GET /conversations.
// Query params: limit (default 20, max 100), offset (default 0).
func (h *ChatHandler) ListConversations(w http.ResponseWriter, r *http.Request) {
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

	rows, err := h.queries.ListConversations(r.Context(), store.ListConversationsParams{
		UserID: userID,
		Limit:  limit,
		Offset: offset,
	})
	if err != nil {
		slog.Error("failed to list conversations", "error", err, "userID", userID)
		WriteError(w, http.StatusInternalServerError, "failed to list conversations")
		return
	}

	total, err := h.queries.CountConversations(r.Context(), userID)
	if err != nil {
		slog.Error("failed to count conversations", "error", err, "userID", userID)
		WriteError(w, http.StatusInternalServerError, "failed to count conversations")
		return
	}

	items := make([]conversationListItem, 0, len(rows))
	for _, row := range rows {
		items = append(items, conversationListItem{
			ID:        uuidToString(row.ID),
			Title:     textToPtr(row.Title),
			CreatedAt: timestamptzToPtr(row.CreatedAt),
			UpdatedAt: timestamptzToPtr(row.UpdatedAt),
		})
	}

	WriteJSON(w, http.StatusOK, map[string]any{
		"items": items,
		"total": total,
	})
}

// GetMessages handles GET /conversations/{id}/messages.
// Query params: limit (default 50, max 100), offset (default 0).
func (h *ChatHandler) GetMessages(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())

	id, err := GetUUIDParam(r, "id")
	if err != nil {
		WriteError(w, http.StatusBadRequest, err.Error())
		return
	}

	// Verify conversation ownership.
	_, err = h.queries.GetConversation(r.Context(), store.GetConversationParams{
		ID:     uuidFromGoogle(id),
		UserID: userID,
	})
	if err != nil {
		if isNotFound(err) {
			WriteError(w, http.StatusNotFound, "conversation not found")
			return
		}
		slog.Error("failed to get conversation", "error", err, "id", id, "userID", userID)
		WriteError(w, http.StatusInternalServerError, "failed to get conversation")
		return
	}

	limit := int32(50)
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

	rows, err := h.queries.ListMessages(r.Context(), store.ListMessagesParams{
		ConversationID: uuidFromGoogle(id),
		Limit:          limit,
		Offset:         offset,
	})
	if err != nil {
		slog.Error("failed to list messages", "error", err, "conversationID", id, "userID", userID)
		WriteError(w, http.StatusInternalServerError, "failed to list messages")
		return
	}

	total, err := h.queries.CountMessages(r.Context(), uuidFromGoogle(id))
	if err != nil {
		slog.Error("failed to count messages", "error", err, "conversationID", id, "userID", userID)
		WriteError(w, http.StatusInternalServerError, "failed to count messages")
		return
	}

	items := make([]messageItem, 0, len(rows))
	for _, row := range rows {
		items = append(items, messageItem{
			ID:          uuidToString(row.ID),
			Role:        row.Role,
			Content:     row.Content,
			Attachments: rawJSONOrNull(row.Attachments),
			ToolCalls:   rawJSONOrNull(row.ToolCalls),
			ToolCallID:  textToPtr(row.ToolCallID),
			CreatedAt:   timestamptzToPtr(row.CreatedAt),
		})
	}

	WriteJSON(w, http.StatusOK, map[string]any{
		"items": items,
		"total": total,
	})
}

// DeleteConversation handles DELETE /conversations/{id}.
func (h *ChatHandler) DeleteConversation(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())

	id, err := GetUUIDParam(r, "id")
	if err != nil {
		WriteError(w, http.StatusBadRequest, err.Error())
		return
	}

	if err := h.queries.SoftDeleteConversation(r.Context(), store.SoftDeleteConversationParams{
		ID:     uuidFromGoogle(id),
		UserID: userID,
	}); err != nil {
		slog.Error("failed to delete conversation", "error", err, "id", id, "userID", userID)
		WriteError(w, http.StatusInternalServerError, "failed to delete conversation")
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// UploadAttachment handles POST /chat/attachments.
// Accepts multipart/form-data with a "file" field.
// Storage integration is deferred — this returns the prospective media_key without saving.
func (h *ChatHandler) UploadAttachment(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())

	maxSize := h.maxSize
	if maxSize <= 0 {
		maxSize = 10 << 20 // 10 MB default
	}

	if err := r.ParseMultipartForm(maxSize); err != nil {
		WriteError(w, http.StatusRequestEntityTooLarge, fmt.Sprintf("file too large (max %dMB)", maxSize/(1024*1024)))
		return
	}

	file, header, err := r.FormFile("file")
	if err != nil {
		WriteError(w, http.StatusBadRequest, "file field is required")
		return
	}
	defer file.Close()

	// Detect MIME type from first 512 bytes.
	buf := make([]byte, 512)
	n, err := file.Read(buf)
	if err != nil && err != io.EOF {
		WriteError(w, http.StatusBadRequest, "failed to read file")
		return
	}
	buf = buf[:n]
	mimeType := http.DetectContentType(buf)

	allowed := map[string]bool{
		"image/jpeg":      true,
		"image/png":       true,
		"image/webp":      true,
		"application/pdf": true,
	}
	if !allowed[mimeType] {
		WriteError(w, http.StatusBadRequest, fmt.Sprintf("unsupported file type: %s (must be jpeg, png, webp, or pdf)", mimeType))
		return
	}

	// Determine the total file size (already-read bytes + the rest).
	remaining, err := io.Copy(io.Discard, file)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "failed to read file")
		return
	}
	size := int64(n) + remaining

	// Build media_key: chat/{userID}/{uuid}/{filename} — storage comes later.
	fileID := uuid.New()
	mediaKey := fmt.Sprintf("chat/%s/%s/%s", userID, fileID.String(), header.Filename)

	WriteJSON(w, http.StatusCreated, attachmentUploadResponse{
		MediaKey: mediaKey,
		Filename: header.Filename,
		MimeType: mimeType,
		Size:     size,
	})
}

// rawJSONOrNull converts a raw []byte into json.RawMessage, returning null for empty/nil slices.
func rawJSONOrNull(b []byte) json.RawMessage {
	if len(b) == 0 {
		return json.RawMessage("null")
	}
	return json.RawMessage(b)
}
