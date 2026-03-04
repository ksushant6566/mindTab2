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

// Goals handles GET /search/goals?q=.
func (h *SearchHandler) Goals(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())
	q := r.URL.Query().Get("q")

	if q == "" {
		WriteJSON(w, http.StatusOK, []goalJSON{})
		return
	}

	goals, err := h.queries.SearchGoals(r.Context(), store.SearchGoalsParams{
		UserID:  userID,
		Column2: pgtype.Text{String: q, Valid: true},
	})
	if err != nil {
		slog.Error("failed to search goals", "error", err)
		WriteError(w, http.StatusInternalServerError, "failed to search goals")
		return
	}

	result := make([]goalJSON, 0, len(goals))
	for _, g := range goals {
		result = append(result, goalFromModel(g))
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

// Journals handles GET /search/journals?q=.
func (h *SearchHandler) Journals(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())
	q := r.URL.Query().Get("q")

	if q == "" {
		WriteJSON(w, http.StatusOK, []journalJSON{})
		return
	}

	journals, err := h.queries.SearchJournals(r.Context(), store.SearchJournalsParams{
		UserID:  userID,
		Column2: pgtype.Text{String: q, Valid: true},
	})
	if err != nil {
		slog.Error("failed to search journals", "error", err)
		WriteError(w, http.StatusInternalServerError, "failed to search journals")
		return
	}

	result := make([]journalJSON, 0, len(journals))
	for _, j := range journals {
		result = append(result, journalFromModel(j))
	}

	WriteJSON(w, http.StatusOK, result)
}
