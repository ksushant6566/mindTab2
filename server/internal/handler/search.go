package handler

import (
	"log/slog"
	"net/http"

	"github.com/jackc/pgx/v5/pgtype"

	"github.com/ksushant6566/mindtab/server/internal/middleware"
	"github.com/ksushant6566/mindtab/server/internal/store"
)

// SearchHandler handles search endpoints.
type SearchHandler struct {
	queries store.Querier
}

// NewSearchHandler creates a new SearchHandler.
func NewSearchHandler(queries store.Querier) *SearchHandler {
	return &SearchHandler{queries: queries}
}

// Tasks handles GET /search/tasks?q=.
func (h *SearchHandler) Tasks(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())
	q := r.URL.Query().Get("q")

	if q == "" {
		WriteJSON(w, http.StatusOK, []taskJSON{})
		return
	}

	tasks, err := h.queries.SearchTasks(r.Context(), store.SearchTasksParams{
		UserID:  userID,
		Column2: pgtype.Text{String: q, Valid: true},
	})
	if err != nil {
		slog.Error("failed to search tasks", "error", err)
		WriteError(w, http.StatusInternalServerError, "failed to search tasks")
		return
	}

	result := make([]taskJSON, 0, len(tasks))
	for _, g := range tasks {
		result = append(result, taskFromModel(g))
	}

	WriteJSON(w, http.StatusOK, result)
}

// Habits handles GET /search/habits?q=.
func (h *SearchHandler) Habits(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())
	q := r.URL.Query().Get("q")

	if q == "" {
		WriteJSON(w, http.StatusOK, []habitJSON{})
		return
	}

	habits, err := h.queries.SearchHabits(r.Context(), store.SearchHabitsParams{
		UserID:  userID,
		Column2: pgtype.Text{String: q, Valid: true},
	})
	if err != nil {
		slog.Error("failed to search habits", "error", err)
		WriteError(w, http.StatusInternalServerError, "failed to search habits")
		return
	}

	result := make([]habitJSON, 0, len(habits))
	for _, hab := range habits {
		result = append(result, habitFromModel(hab))
	}

	WriteJSON(w, http.StatusOK, result)
}

// Notes handles GET /search/notes?q=.
func (h *SearchHandler) Notes(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())
	q := r.URL.Query().Get("q")

	if q == "" {
		WriteJSON(w, http.StatusOK, []noteJSON{})
		return
	}

	notes, err := h.queries.SearchNotes(r.Context(), store.SearchNotesParams{
		UserID:  userID,
		Column2: pgtype.Text{String: q, Valid: true},
	})
	if err != nil {
		slog.Error("failed to search notes", "error", err)
		WriteError(w, http.StatusInternalServerError, "failed to search notes")
		return
	}

	result := make([]noteJSON, 0, len(notes))
	for _, j := range notes {
		result = append(result, noteFromModel(j))
	}

	WriteJSON(w, http.StatusOK, result)
}
