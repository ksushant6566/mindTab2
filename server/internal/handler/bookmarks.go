package handler

import (
	"fmt"
	"log/slog"
	"net/http"
	"strings"

	"github.com/ksushant6566/mindtab/server/internal/middleware"
	"github.com/ksushant6566/mindtab/server/internal/store"
)

// BookmarksHandler handles bookmark sync endpoints.
type BookmarksHandler struct {
	queries store.Querier
}

// NewBookmarksHandler creates a new BookmarksHandler.
func NewBookmarksHandler(queries store.Querier) *BookmarksHandler {
	return &BookmarksHandler{queries: queries}
}

type syncItem struct {
	ID        *string `json:"id,omitempty"`
	Title     string  `json:"title"`
	URL       string  `json:"url"`
	DateAdded *string `json:"dateAdded,omitempty"`
}

type syncMetadata struct {
	Source string `json:"source"`
	Count  int    `json:"count"`
}

type syncRequest struct {
	Items    []syncItem   `json:"items"`
	Metadata syncMetadata `json:"metadata"`
}

func categorizeURL(url string) string {
	lower := strings.ToLower(url)
	if strings.Contains(lower, "youtube") || strings.Contains(lower, "vimeo") || strings.Contains(lower, "dailymotion") {
		return "video"
	}
	if strings.Contains(lower, "podcast") || strings.Contains(lower, "spotify") || strings.Contains(lower, "anchor") {
		return "podcast"
	}
	// Common article domains
	articleDomains := []string{"medium.com", "dev.to", "hackernoon.com", "substack.com", "blog", "article", "news"}
	for _, d := range articleDomains {
		if strings.Contains(lower, d) {
			return "article"
		}
	}
	return "website"
}

func buildSyncContent(url string) string {
	return fmt.Sprintf(`<p><a target="_blank" rel="noopener noreferrer" href="%s?ref=mindtab.in">%s</a></p>`, url, url)
}

// Sync handles POST /sync/bookmarks.
func (h *BookmarksHandler) Sync(w http.ResponseWriter, r *http.Request) {
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
			Source:  "bookmark",
			Type:    journalType,
		}); err != nil {
			slog.Error("failed to upsert journal from bookmark sync", "error", err, "title", title)
		}
	}

	WriteJSON(w, http.StatusOK, map[string]interface{}{
		"success":   true,
		"message":   fmt.Sprintf("Synced %d items", len(req.Items)),
		"itemCount": len(req.Items),
	})
}
