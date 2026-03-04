package handler

import (
	"fmt"
	"log/slog"
	"net/http"

	"github.com/ksushant6566/mindtab/server/internal/middleware"
	"github.com/ksushant6566/mindtab/server/internal/store"
)

// ReadingListsHandler handles reading list sync endpoints.
type ReadingListsHandler struct {
	queries store.Querier
}

// NewReadingListsHandler creates a new ReadingListsHandler.
func NewReadingListsHandler(queries store.Querier) *ReadingListsHandler {
	return &ReadingListsHandler{queries: queries}
}

// Sync handles POST /sync/reading-lists.
func (h *ReadingListsHandler) Sync(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())

	var req syncRequest
	if err := ReadJSON(r, &req); err != nil {
		WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	for _, item := range req.Items {
		journalType := categorizeURL(item.URL)
		content := buildSyncContent(item.URL)

		title := item.Title
		if title == "" {
			title = item.URL
		}

		if err := h.queries.UpsertJournalFromSync(r.Context(), store.UpsertJournalFromSyncParams{
			Title:   title,
			Content: content,
			UserID:  userID,
			Source:  "reading-list",
			Type:    journalType,
		}); err != nil {
			slog.Error("failed to upsert journal from reading list sync", "error", err, "title", title)
		}
	}

	WriteJSON(w, http.StatusOK, map[string]interface{}{
		"success":   true,
		"message":   fmt.Sprintf("Synced %d items", len(req.Items)),
		"itemCount": len(req.Items),
	})
}
