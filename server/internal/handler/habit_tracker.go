package handler

import (
	"log/slog"
	"net/http"
	"time"

	"github.com/ksushant6566/mindtab/server/internal/middleware"
	"github.com/ksushant6566/mindtab/server/internal/store"
)

// HabitTrackerHandler handles habit tracker endpoints.
type HabitTrackerHandler struct {
	queries store.Querier
}

// NewHabitTrackerHandler creates a new HabitTrackerHandler.
func NewHabitTrackerHandler(queries store.Querier) *HabitTrackerHandler {
	return &HabitTrackerHandler{queries: queries}
}

type habitTrackerJSON struct {
	ID        string     `json:"id"`
	HabitID   string     `json:"habitId"`
	Status    string     `json:"status"`
	Date      *string    `json:"date"`
	CreatedAt *time.Time `json:"createdAt"`
	UpdatedAt *time.Time `json:"updatedAt"`
}

func habitTrackerFromModel(ht store.MindmapHabitTracker) habitTrackerJSON {
	return habitTrackerJSON{
		ID:        uuidToString(ht.ID),
		HabitID:   uuidToString(ht.HabitID),
		Status:    ifaceToString(ht.Status),
		Date:      dateToPtr(ht.Date),
		CreatedAt: timestamptzToPtr(ht.CreatedAt),
		UpdatedAt: timestamptzToPtr(ht.UpdatedAt),
	}
}

// List handles GET /habit-tracker.
func (h *HabitTrackerHandler) List(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())

	records, err := h.queries.ListHabitTrackerRecords(r.Context(), userID)
	if err != nil {
		slog.Error("failed to list habit tracker records", "error", err)
		WriteError(w, http.StatusInternalServerError, "failed to list habit tracker records")
		return
	}

	result := make([]habitTrackerJSON, 0, len(records))
	for _, rec := range records {
		result = append(result, habitTrackerFromModel(rec))
	}

	WriteJSON(w, http.StatusOK, result)
}
