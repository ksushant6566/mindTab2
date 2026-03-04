package handler

import (
	"context"
	"log/slog"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/ksushant6566/mindtab/server/internal/middleware"
	"github.com/ksushant6566/mindtab/server/internal/store"
)

// HabitsHandler handles habit endpoints.
type HabitsHandler struct {
	queries store.Querier
	pool    *pgxpool.Pool
}

// NewHabitsHandler creates a new HabitsHandler.
func NewHabitsHandler(queries store.Querier, pool *pgxpool.Pool) *HabitsHandler {
	return &HabitsHandler{queries: queries, pool: pool}
}

type habitJSON struct {
	ID          string     `json:"id"`
	Title       string     `json:"title"`
	Description *string    `json:"description"`
	Frequency   string     `json:"frequency"`
	CreatedAt   *time.Time `json:"createdAt"`
	UpdatedAt   *time.Time `json:"updatedAt"`
}

func habitFromModel(h store.MindmapHabit) habitJSON {
	return habitJSON{
		ID:          uuidToString(h.ID),
		Title:       textToString(h.Title),
		Description: textToPtr(h.Description),
		Frequency:   ifaceToString(h.Frequency),
		CreatedAt:   timestamptzToPtr(h.CreatedAt),
		UpdatedAt:   timestamptzToPtr(h.UpdatedAt),
	}
}

// List handles GET /habits.
func (h *HabitsHandler) List(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())

	habits, err := h.queries.ListHabits(r.Context(), userID)
	if err != nil {
		slog.Error("failed to list habits", "error", err)
		WriteError(w, http.StatusInternalServerError, "failed to list habits")
		return
	}

	result := make([]habitJSON, 0, len(habits))
	for _, hab := range habits {
		result = append(result, habitFromModel(hab))
	}

	WriteJSON(w, http.StatusOK, result)
}

type createHabitRequest struct {
	Title       string  `json:"title"`
	Description *string `json:"description,omitempty"`
	Frequency   *string `json:"frequency,omitempty"`
}

// Create handles POST /habits.
func (h *HabitsHandler) Create(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())

	var req createHabitRequest
	if err := ReadJSON(r, &req); err != nil {
		WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if req.Title == "" {
		WriteError(w, http.StatusBadRequest, "title is required")
		return
	}

	// Check title uniqueness.
	exists, err := h.queries.CheckHabitTitleExists(r.Context(), store.CheckHabitTitleExistsParams{
		UserID:  userID,
		Title:   pgtextFrom(req.Title),
		Column3: nullUUID(),
	})
	if err != nil {
		slog.Error("failed to check habit title", "error", err)
		WriteError(w, http.StatusInternalServerError, "failed to create habit")
		return
	}
	if exists {
		WriteError(w, http.StatusConflict, "a habit with this title already exists")
		return
	}

	params := store.CreateHabitParams{
		Title:  pgtextFrom(req.Title),
		UserID: userID,
	}
	if req.Description != nil {
		params.Description = pgtextFrom(*req.Description)
	}
	if req.Frequency != nil {
		params.Frequency = *req.Frequency
	} else {
		params.Frequency = "daily"
	}

	if err := h.queries.CreateHabit(r.Context(), params); err != nil {
		slog.Error("failed to create habit", "error", err)
		WriteError(w, http.StatusInternalServerError, "failed to create habit")
		return
	}

	WriteJSON(w, http.StatusCreated, map[string]string{"message": "habit created"})
}

// Get handles GET /habits/{id}.
func (h *HabitsHandler) Get(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())

	id, err := GetUUIDParam(r, "id")
	if err != nil {
		WriteError(w, http.StatusBadRequest, err.Error())
		return
	}

	habit, err := h.queries.GetHabitByID(r.Context(), store.GetHabitByIDParams{
		ID:     uuidFromGoogle(id),
		UserID: userID,
	})
	if err != nil {
		WriteError(w, http.StatusNotFound, "habit not found")
		return
	}

	WriteJSON(w, http.StatusOK, habitFromModel(habit))
}

type updateHabitRequest struct {
	Title       *string `json:"title,omitempty"`
	Description *string `json:"description,omitempty"`
	Frequency   *string `json:"frequency,omitempty"`
}

// Update handles PATCH /habits/{id}.
func (h *HabitsHandler) Update(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())

	id, err := GetUUIDParam(r, "id")
	if err != nil {
		WriteError(w, http.StatusBadRequest, err.Error())
		return
	}

	var req updateHabitRequest
	if err := ReadJSON(r, &req); err != nil {
		WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	// If title changed, check uniqueness (exclude current id).
	if req.Title != nil {
		exists, err := h.queries.CheckHabitTitleExists(r.Context(), store.CheckHabitTitleExistsParams{
			UserID:  userID,
			Title:   pgtextFrom(*req.Title),
			Column3: uuidFromGoogle(id),
		})
		if err != nil {
			slog.Error("failed to check habit title", "error", err)
			WriteError(w, http.StatusInternalServerError, "failed to update habit")
			return
		}
		if exists {
			WriteError(w, http.StatusConflict, "a habit with this title already exists")
			return
		}
	}

	params := store.UpdateHabitParams{
		ID:     uuidFromGoogle(id),
		UserID: userID,
	}
	if req.Title != nil {
		params.Title = pgtextFrom(*req.Title)
	}
	if req.Description != nil {
		params.Description = pgtextFrom(*req.Description)
	}
	if req.Frequency != nil {
		params.Frequency = *req.Frequency
	}

	if err := h.queries.UpdateHabit(r.Context(), params); err != nil {
		slog.Error("failed to update habit", "error", err)
		WriteError(w, http.StatusInternalServerError, "failed to update habit")
		return
	}

	WriteJSON(w, http.StatusOK, map[string]string{"message": "habit updated"})
}

// Delete handles DELETE /habits/{id}.
func (h *HabitsHandler) Delete(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())

	id, err := GetUUIDParam(r, "id")
	if err != nil {
		WriteError(w, http.StatusBadRequest, err.Error())
		return
	}

	if err := h.queries.DeleteHabit(r.Context(), store.DeleteHabitParams{
		ID:     uuidFromGoogle(id),
		UserID: userID,
	}); err != nil {
		slog.Error("failed to delete habit", "error", err)
		WriteError(w, http.StatusInternalServerError, "failed to delete habit")
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

type trackHabitRequest struct {
	Date string `json:"date"`
}

// Track handles POST /habits/{id}/track.
func (h *HabitsHandler) Track(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())

	id, err := GetUUIDParam(r, "id")
	if err != nil {
		WriteError(w, http.StatusBadRequest, err.Error())
		return
	}

	var req trackHabitRequest
	if err := ReadJSON(r, &req); err != nil {
		WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	date, err := time.Parse("2006-01-02", req.Date)
	if err != nil {
		WriteError(w, http.StatusBadRequest, "invalid date format, expected YYYY-MM-DD")
		return
	}

	tx, err := h.pool.Begin(r.Context())
	if err != nil {
		slog.Error("failed to begin transaction", "error", err)
		WriteError(w, http.StatusInternalServerError, "failed to track habit")
		return
	}
	defer func() { _ = tx.Rollback(context.Background()) }()

	qtx := store.New(tx)

	trackID, err := qtx.TrackHabit(r.Context(), store.TrackHabitParams{
		HabitID: uuidFromGoogle(id),
		UserID:  userID,
		Date:    pgtype.Date{Time: date, Valid: true},
	})
	if err != nil {
		slog.Error("failed to track habit", "error", err)
		WriteError(w, http.StatusInternalServerError, "failed to track habit")
		return
	}

	if _, err := qtx.UpdateUserXP(r.Context(), store.UpdateUserXPParams{
		ID: userID,
		Xp: 10,
	}); err != nil {
		slog.Error("failed to update XP", "error", err)
		WriteError(w, http.StatusInternalServerError, "failed to track habit")
		return
	}

	if err := tx.Commit(r.Context()); err != nil {
		slog.Error("failed to commit transaction", "error", err)
		WriteError(w, http.StatusInternalServerError, "failed to track habit")
		return
	}

	WriteJSON(w, http.StatusOK, map[string]string{"id": uuidToString(trackID)})
}

// Untrack handles DELETE /habits/{id}/track.
func (h *HabitsHandler) Untrack(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())

	id, err := GetUUIDParam(r, "id")
	if err != nil {
		WriteError(w, http.StatusBadRequest, err.Error())
		return
	}

	var req trackHabitRequest
	if err := ReadJSON(r, &req); err != nil {
		WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	date, err := time.Parse("2006-01-02", req.Date)
	if err != nil {
		WriteError(w, http.StatusBadRequest, "invalid date format, expected YYYY-MM-DD")
		return
	}

	tx, err := h.pool.Begin(r.Context())
	if err != nil {
		slog.Error("failed to begin transaction", "error", err)
		WriteError(w, http.StatusInternalServerError, "failed to untrack habit")
		return
	}
	defer func() { _ = tx.Rollback(context.Background()) }()

	qtx := store.New(tx)

	if err := qtx.UntrackHabit(r.Context(), store.UntrackHabitParams{
		HabitID: uuidFromGoogle(id),
		UserID:  userID,
		Date:    pgtype.Date{Time: date, Valid: true},
	}); err != nil {
		slog.Error("failed to untrack habit", "error", err)
		WriteError(w, http.StatusInternalServerError, "failed to untrack habit")
		return
	}

	if _, err := qtx.UpdateUserXP(r.Context(), store.UpdateUserXPParams{
		ID: userID,
		Xp: -10,
	}); err != nil {
		slog.Error("failed to update XP", "error", err)
		WriteError(w, http.StatusInternalServerError, "failed to untrack habit")
		return
	}

	if err := tx.Commit(r.Context()); err != nil {
		slog.Error("failed to commit transaction", "error", err)
		WriteError(w, http.StatusInternalServerError, "failed to untrack habit")
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
