package handler

import (
	"context"
	"log/slog"
	"net/http"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/ksushant6566/mindtab/server/internal/middleware"
	"github.com/ksushant6566/mindtab/server/internal/store"
)

// GoalsHandler handles goal endpoints.
type GoalsHandler struct {
	queries store.Querier
	pool    *pgxpool.Pool
}

// NewGoalsHandler creates a new GoalsHandler.
func NewGoalsHandler(queries store.Querier, pool *pgxpool.Pool) *GoalsHandler {
	return &GoalsHandler{queries: queries, pool: pool}
}

// --- JSON response types ---

type goalJSON struct {
	ID            string     `json:"id"`
	Title         string     `json:"title"`
	Description   *string    `json:"description"`
	Status        string     `json:"status"`
	Priority      string     `json:"priority"`
	Impact        string     `json:"impact"`
	Position      int32      `json:"position"`
	CreatedAt     *time.Time `json:"createdAt"`
	UpdatedAt     *time.Time `json:"updatedAt"`
	CompletedAt   *time.Time `json:"completedAt"`
	ProjectID     *string    `json:"projectId"`
	ProjectName   *string    `json:"projectName,omitempty"`
	ProjectStatus *string    `json:"projectStatus,omitempty"`
}

func goalFromListRow(g store.ListGoalsRow) goalJSON {
	var projID, projName, projStatus *string
	if g.ProjectID.Valid {
		s := uuidToString(g.ProjectID)
		projID = &s
	}
	if g.ProjectName.Valid {
		projName = &g.ProjectName.String
	}
	ps := ifaceToString(g.ProjectStatus)
	if ps != "" {
		projStatus = &ps
	}
	return goalJSON{
		ID:            uuidToString(g.ID),
		Title:         textToString(g.Title),
		Description:   textToPtr(g.Description),
		Status:        ifaceToString(g.Status),
		Priority:      ifaceToString(g.Priority),
		Impact:        ifaceToString(g.Impact),
		Position:      g.Position,
		CreatedAt:     timestamptzToPtr(g.CreatedAt),
		UpdatedAt:     timestamptzToPtr(g.UpdatedAt),
		CompletedAt:   timestamptzToPtr(g.CompletedAt),
		ProjectID:     projID,
		ProjectName:   projName,
		ProjectStatus: projStatus,
	}
}

func goalFromGetRow(g store.GetGoalByIDRow) goalJSON {
	var projID, projName, projStatus *string
	if g.ProjectID.Valid {
		s := uuidToString(g.ProjectID)
		projID = &s
	}
	if g.ProjectName.Valid {
		projName = &g.ProjectName.String
	}
	ps := ifaceToString(g.ProjectStatus)
	if ps != "" {
		projStatus = &ps
	}
	return goalJSON{
		ID:            uuidToString(g.ID),
		Title:         textToString(g.Title),
		Description:   textToPtr(g.Description),
		Status:        ifaceToString(g.Status),
		Priority:      ifaceToString(g.Priority),
		Impact:        ifaceToString(g.Impact),
		Position:      g.Position,
		CreatedAt:     timestamptzToPtr(g.CreatedAt),
		UpdatedAt:     timestamptzToPtr(g.UpdatedAt),
		CompletedAt:   timestamptzToPtr(g.CompletedAt),
		ProjectID:     projID,
		ProjectName:   projName,
		ProjectStatus: projStatus,
	}
}

func goalFromModel(g store.MindmapGoal) goalJSON {
	var projID *string
	if g.ProjectID.Valid {
		s := uuidToString(g.ProjectID)
		projID = &s
	}
	return goalJSON{
		ID:          uuidToString(g.ID),
		Title:       textToString(g.Title),
		Description: textToPtr(g.Description),
		Status:      ifaceToString(g.Status),
		Priority:    ifaceToString(g.Priority),
		Impact:      ifaceToString(g.Impact),
		Position:    g.Position,
		CreatedAt:   timestamptzToPtr(g.CreatedAt),
		UpdatedAt:   timestamptzToPtr(g.UpdatedAt),
		CompletedAt: timestamptzToPtr(g.CompletedAt),
		ProjectID:   projID,
	}
}

// List handles GET /goals.
func (h *GoalsHandler) List(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())

	includeArchived := r.URL.Query().Get("includeArchived") == "true"
	projectIDStr := r.URL.Query().Get("projectId")

	var projectID pgtype.UUID
	if projectIDStr != "" {
		parsed, err := uuid.Parse(projectIDStr)
		if err != nil {
			WriteError(w, http.StatusBadRequest, "invalid projectId")
			return
		}
		projectID = uuidFromGoogle(parsed)
	}

	goals, err := h.queries.ListGoals(r.Context(), store.ListGoalsParams{
		UserID:  userID,
		Column2: includeArchived,
		Column3: projectID,
	})
	if err != nil {
		slog.Error("failed to list goals", "error", err)
		WriteError(w, http.StatusInternalServerError, "failed to list goals")
		return
	}

	result := make([]goalJSON, 0, len(goals))
	for _, g := range goals {
		result = append(result, goalFromListRow(g))
	}

	WriteJSON(w, http.StatusOK, result)
}

// createGoalRequest is the request body for POST /goals.
type createGoalRequest struct {
	Title       string  `json:"title"`
	Description *string `json:"description,omitempty"`
	Status      *string `json:"status,omitempty"`
	Priority    *string `json:"priority,omitempty"`
	Impact      *string `json:"impact,omitempty"`
	Position    *int32  `json:"position,omitempty"`
	ProjectID   *string `json:"projectId,omitempty"`
	CompletedAt *string `json:"completedAt,omitempty"`
}

// Create handles POST /goals.
func (h *GoalsHandler) Create(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())

	var req createGoalRequest
	if err := ReadJSON(r, &req); err != nil {
		WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if req.Title == "" {
		WriteError(w, http.StatusBadRequest, "title is required")
		return
	}

	params := store.CreateGoalParams{
		Title:  pgtextFrom(req.Title),
		UserID: userID,
	}

	if req.Description != nil {
		params.Description = pgtextFrom(*req.Description)
	}
	if req.Status != nil {
		params.Status = *req.Status
	} else {
		params.Status = "pending"
	}
	if req.Priority != nil {
		params.Priority = *req.Priority
	} else {
		params.Priority = "medium"
	}
	if req.Impact != nil {
		params.Impact = *req.Impact
	} else {
		params.Impact = "medium"
	}
	if req.Position != nil {
		params.Position = *req.Position
	}
	if req.ProjectID != nil {
		parsed, err := uuid.Parse(*req.ProjectID)
		if err != nil {
			WriteError(w, http.StatusBadRequest, "invalid projectId")
			return
		}
		params.ProjectID = uuidFromGoogle(parsed)
	}
	if req.CompletedAt != nil {
		t, err := time.Parse(time.RFC3339, *req.CompletedAt)
		if err == nil {
			params.CompletedAt = pgtype.Timestamptz{Time: t, Valid: true}
		}
	}

	if err := h.queries.CreateGoal(r.Context(), params); err != nil {
		slog.Error("failed to create goal", "error", err)
		WriteError(w, http.StatusInternalServerError, "failed to create goal")
		return
	}

	WriteJSON(w, http.StatusCreated, map[string]string{"message": "goal created"})
}

// Get handles GET /goals/{id}.
func (h *GoalsHandler) Get(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())

	id, err := GetUUIDParam(r, "id")
	if err != nil {
		WriteError(w, http.StatusBadRequest, err.Error())
		return
	}

	goal, err := h.queries.GetGoalByID(r.Context(), store.GetGoalByIDParams{
		ID:     uuidFromGoogle(id),
		UserID: userID,
	})
	if err != nil {
		WriteError(w, http.StatusNotFound, "goal not found")
		return
	}

	WriteJSON(w, http.StatusOK, goalFromGetRow(goal))
}

// updateGoalRequest is the request body for PATCH /goals/{id}.
type updateGoalRequest struct {
	Title       *string `json:"title,omitempty"`
	Description *string `json:"description,omitempty"`
	Status      *string `json:"status,omitempty"`
	Priority    *string `json:"priority,omitempty"`
	Impact      *string `json:"impact,omitempty"`
	Position    *int32  `json:"position,omitempty"`
	ProjectID   *string `json:"projectId"`
	CompletedAt *string `json:"completedAt"`
}

// Update handles PATCH /goals/{id}.
func (h *GoalsHandler) Update(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())

	id, err := GetUUIDParam(r, "id")
	if err != nil {
		WriteError(w, http.StatusBadRequest, err.Error())
		return
	}

	var req updateGoalRequest
	if err := ReadJSON(r, &req); err != nil {
		WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	params := store.UpdateGoalParams{
		ID:     uuidFromGoogle(id),
		UserID: userID,
	}

	if req.Title != nil {
		params.Title = pgtextFrom(*req.Title)
	}
	if req.Description != nil {
		params.Description = pgtextFrom(*req.Description)
	}
	if req.Status != nil {
		params.Status = *req.Status
	}
	if req.Priority != nil {
		params.Priority = *req.Priority
	}
	if req.Impact != nil {
		params.Impact = *req.Impact
	}
	if req.Position != nil {
		params.Position = *req.Position
	}
	if req.ProjectID != nil {
		parsed, err := uuid.Parse(*req.ProjectID)
		if err != nil {
			WriteError(w, http.StatusBadRequest, "invalid projectId")
			return
		}
		params.ProjectID = uuidFromGoogle(parsed)
	}

	// Handle completedAt logic based on status
	if req.Status != nil {
		switch *req.Status {
		case "completed":
			params.CompletedAt = timestamptzNow()
		case "pending", "in_progress":
			params.CompletedAt = nullTimestamptz()
		// archived: keep existing completedAt — we pass null which means COALESCE keeps existing
		}
	}

	if err := h.queries.UpdateGoal(r.Context(), params); err != nil {
		slog.Error("failed to update goal", "error", err)
		WriteError(w, http.StatusInternalServerError, "failed to update goal")
		return
	}

	WriteJSON(w, http.StatusOK, map[string]string{"message": "goal updated"})
}

// Delete handles DELETE /goals/{id}.
func (h *GoalsHandler) Delete(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())

	id, err := GetUUIDParam(r, "id")
	if err != nil {
		WriteError(w, http.StatusBadRequest, err.Error())
		return
	}

	if err := h.queries.SoftDeleteGoal(r.Context(), store.SoftDeleteGoalParams{
		ID:     uuidFromGoogle(id),
		UserID: userID,
	}); err != nil {
		slog.Error("failed to delete goal", "error", err)
		WriteError(w, http.StatusInternalServerError, "failed to delete goal")
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// GetCount handles GET /goals/count.
func (h *GoalsHandler) GetCount(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())

	includeArchived := r.URL.Query().Get("includeArchived") == "true"
	projectIDStr := r.URL.Query().Get("projectId")

	var projectID pgtype.UUID
	if projectIDStr != "" {
		parsed, err := uuid.Parse(projectIDStr)
		if err != nil {
			WriteError(w, http.StatusBadRequest, "invalid projectId")
			return
		}
		projectID = uuidFromGoogle(parsed)
	}

	count, err := h.queries.CountGoals(r.Context(), store.CountGoalsParams{
		UserID:  userID,
		Column2: includeArchived,
		Column3: projectID,
	})
	if err != nil {
		slog.Error("failed to count goals", "error", err)
		WriteError(w, http.StatusInternalServerError, "failed to count goals")
		return
	}

	WriteJSON(w, http.StatusOK, map[string]int32{"count": count})
}

// GetUnassigned handles GET /goals/unassigned.
func (h *GoalsHandler) GetUnassigned(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())

	goals, err := h.queries.ListUnassignedGoals(r.Context(), userID)
	if err != nil {
		slog.Error("failed to list unassigned goals", "error", err)
		WriteError(w, http.StatusInternalServerError, "failed to list unassigned goals")
		return
	}

	result := make([]goalJSON, 0, len(goals))
	for _, g := range goals {
		result = append(result, goalFromModel(g))
	}

	WriteJSON(w, http.StatusOK, result)
}

// updatePositionsRequest is the request body for PATCH /goals/positions.
type updatePositionsRequest struct {
	Goals    []positionItem `json:"goals"`
	Sequence int32          `json:"sequence"`
}

type positionItem struct {
	ID       string  `json:"id"`
	Position int32   `json:"position"`
	Status   *string `json:"status,omitempty"`
}

// UpdatePositions handles PATCH /goals/positions.
func (h *GoalsHandler) UpdatePositions(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())

	var req updatePositionsRequest
	if err := ReadJSON(r, &req); err != nil {
		WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	tx, err := h.pool.Begin(r.Context())
	if err != nil {
		slog.Error("failed to begin transaction", "error", err)
		WriteError(w, http.StatusInternalServerError, "failed to update positions")
		return
	}
	defer func() { _ = tx.Rollback(context.Background()) }()

	qtx := h.queries.(*store.Queries).WithTx(tx)

	for _, g := range req.Goals {
		parsed, err := uuid.Parse(g.ID)
		if err != nil {
			WriteError(w, http.StatusBadRequest, "invalid goal id: "+g.ID)
			return
		}
		params := store.UpdateGoalPositionParams{
			ID:       uuidFromGoogle(parsed),
			UserID:   userID,
			Position: g.Position,
		}
		if g.Status != nil {
			params.Status = *g.Status
		}
		if err := qtx.UpdateGoalPosition(r.Context(), params); err != nil {
			slog.Error("failed to update goal position", "error", err, "goalId", g.ID)
			WriteError(w, http.StatusInternalServerError, "failed to update positions")
			return
		}
	}

	if err := tx.Commit(r.Context()); err != nil {
		slog.Error("failed to commit transaction", "error", err)
		WriteError(w, http.StatusInternalServerError, "failed to update positions")
		return
	}

	WriteJSON(w, http.StatusOK, map[string]interface{}{
		"success":  true,
		"sequence": req.Sequence,
	})
}

// ArchiveCompleted handles POST /goals/archive-completed.
func (h *GoalsHandler) ArchiveCompleted(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())

	count, err := h.queries.ArchiveCompletedGoals(r.Context(), userID)
	if err != nil {
		slog.Error("failed to archive completed goals", "error", err)
		WriteError(w, http.StatusInternalServerError, "failed to archive completed goals")
		return
	}

	WriteJSON(w, http.StatusOK, map[string]interface{}{
		"success": true,
		"count":   count,
	})
}
