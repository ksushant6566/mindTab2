package handler

import (
	"fmt"
	"log/slog"
	"net/http"
	"regexp"
	"time"

	"github.com/google/uuid"

	"github.com/ksushant6566/mindtab/server/internal/middleware"
	"github.com/ksushant6566/mindtab/server/internal/store"
)

// MentionsHandler handles mention-related endpoints.
type MentionsHandler struct {
	queries store.Querier
}

// NewMentionsHandler creates a new MentionsHandler.
func NewMentionsHandler(queries store.Querier) *MentionsHandler {
	return &MentionsHandler{queries: queries}
}

// --- JSON response types ---

type connectedNoteJSON struct {
	ID        string     `json:"id"`
	Title     string     `json:"title"`
	Preview   string     `json:"preview"`
	UpdatedAt *time.Time `json:"updatedAt"`
	CreatedAt *time.Time `json:"createdAt"`
}

// --- HTML stripping for preview ---

var htmlTagRe = regexp.MustCompile(`<[^>]*>`)

func stripHTML(s string) string {
	return htmlTagRe.ReplaceAllString(s, "")
}

func truncate(s string, maxLen int) string {
	runes := []rune(s)
	if len(runes) <= maxLen {
		return s
	}
	return string(runes[:maxLen]) + "…"
}

// ConnectedNotes handles GET /mentions/connected-notes?entityType=task&entityId=UUID
func (h *MentionsHandler) ConnectedNotes(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())

	entityType := r.URL.Query().Get("entityType")
	entityID := r.URL.Query().Get("entityId")

	if entityType == "" || entityID == "" {
		WriteError(w, http.StatusBadRequest, "entityType and entityId are required")
		return
	}

	// Validate entityType
	switch entityType {
	case "task", "note":
		// ok
	default:
		WriteError(w, http.StatusBadRequest, "entityType must be task or note")
		return
	}

	// Validate UUID
	if _, err := uuid.Parse(entityID); err != nil {
		WriteError(w, http.StatusBadRequest, "invalid entityId")
		return
	}

	// For notes, the data-id format uses "note" on mobile but could also be "note"
	mentionID := fmt.Sprintf("%s:%s", entityType, entityID)
	pattern := fmt.Sprintf("%%data-id=\"%s\"%%", mentionID)

	notes, err := h.queries.GetConnectedNotes(r.Context(), store.GetConnectedNotesParams{
		UserID:  userID,
		Content: pattern,
	})
	if err != nil {
		slog.Error("failed to get connected notes", "error", err)
		WriteError(w, http.StatusInternalServerError, "failed to get connected notes")
		return
	}

	result := make([]connectedNoteJSON, 0, len(notes))
	for _, n := range notes {
		preview := truncate(stripHTML(n.Content), 200)
		result = append(result, connectedNoteJSON{
			ID:        uuidToString(n.ID),
			Title:     n.Title,
			Preview:   preview,
			UpdatedAt: timestamptzToPtr(n.UpdatedAt),
			CreatedAt: timestamptzToPtr(n.CreatedAt),
		})
	}

	WriteJSON(w, http.StatusOK, result)
}
