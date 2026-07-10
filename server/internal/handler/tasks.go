package handler

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/ksushant6566/mindtab/server/internal/middleware"
	"github.com/ksushant6566/mindtab/server/internal/store"
	"github.com/ksushant6566/mindtab/server/internal/taskstate"
)

// TasksHandler handles task endpoints.
type TasksHandler struct {
	queries store.Querier
	pool    *pgxpool.Pool
}

// NewTasksHandler creates a new TasksHandler.
func NewTasksHandler(queries store.Querier, pool *pgxpool.Pool) *TasksHandler {
	return &TasksHandler{queries: queries, pool: pool}
}

// --- JSON response types ---

type taskJSON struct {
	ID               string     `json:"id"`
	Title            string     `json:"title"`
	Description      *string    `json:"description"`
	Status           string     `json:"status"`
	Priority         string     `json:"priority"`
	Impact           string     `json:"impact"`
	Position         int32      `json:"position"`
	CreatedAt        *time.Time `json:"createdAt"`
	UpdatedAt        *time.Time `json:"updatedAt"`
	CompletedAt      *time.Time `json:"completedAt"`
	ScheduledStartAt *time.Time `json:"scheduledStartAt"`
	ScheduledEndAt   *time.Time `json:"scheduledEndAt"`
	ProjectID        *string    `json:"projectId"`
	ProjectName      *string    `json:"projectName,omitempty"`
	ProjectStatus    *string    `json:"projectStatus,omitempty"`
}

func taskFromListRow(g store.ListTasksRow) taskJSON {
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
	return taskJSON{
		ID:               uuidToString(g.ID),
		Title:            textToString(g.Title),
		Description:      textToPtr(g.Description),
		Status:           ifaceToString(g.Status),
		Priority:         ifaceToString(g.Priority),
		Impact:           ifaceToString(g.Impact),
		Position:         g.Position,
		CreatedAt:        timestamptzToPtr(g.CreatedAt),
		UpdatedAt:        timestamptzToPtr(g.UpdatedAt),
		CompletedAt:      timestamptzToPtr(g.CompletedAt),
		ScheduledStartAt: timestamptzToPtr(g.ScheduledStartAt),
		ScheduledEndAt:   timestamptzToPtr(g.ScheduledEndAt),
		ProjectID:        projID,
		ProjectName:      projName,
		ProjectStatus:    projStatus,
	}
}

func taskFromGetRow(g store.GetTaskByIDRow) taskJSON {
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
	return taskJSON{
		ID:               uuidToString(g.ID),
		Title:            textToString(g.Title),
		Description:      textToPtr(g.Description),
		Status:           ifaceToString(g.Status),
		Priority:         ifaceToString(g.Priority),
		Impact:           ifaceToString(g.Impact),
		Position:         g.Position,
		CreatedAt:        timestamptzToPtr(g.CreatedAt),
		UpdatedAt:        timestamptzToPtr(g.UpdatedAt),
		CompletedAt:      timestamptzToPtr(g.CompletedAt),
		ScheduledStartAt: timestamptzToPtr(g.ScheduledStartAt),
		ScheduledEndAt:   timestamptzToPtr(g.ScheduledEndAt),
		ProjectID:        projID,
		ProjectName:      projName,
		ProjectStatus:    projStatus,
	}
}

func taskFromModel(g store.Task) taskJSON {
	var projID *string
	if g.ProjectID.Valid {
		s := uuidToString(g.ProjectID)
		projID = &s
	}
	return taskJSON{
		ID:               uuidToString(g.ID),
		Title:            textToString(g.Title),
		Description:      textToPtr(g.Description),
		Status:           ifaceToString(g.Status),
		Priority:         ifaceToString(g.Priority),
		Impact:           ifaceToString(g.Impact),
		Position:         g.Position,
		CreatedAt:        timestamptzToPtr(g.CreatedAt),
		UpdatedAt:        timestamptzToPtr(g.UpdatedAt),
		CompletedAt:      timestamptzToPtr(g.CompletedAt),
		ScheduledStartAt: timestamptzToPtr(g.ScheduledStartAt),
		ScheduledEndAt:   timestamptzToPtr(g.ScheduledEndAt),
		ProjectID:        projID,
	}
}

func parseScheduleRange(start, end *string) (pgtype.Timestamptz, pgtype.Timestamptz, error) {
	if (start == nil) != (end == nil) {
		return pgtype.Timestamptz{}, pgtype.Timestamptz{}, fmt.Errorf("scheduledStartAt and scheduledEndAt must be provided together")
	}
	if start == nil {
		return pgtype.Timestamptz{}, pgtype.Timestamptz{}, nil
	}

	startTime, err := time.Parse(time.RFC3339, *start)
	if err != nil {
		return pgtype.Timestamptz{}, pgtype.Timestamptz{}, fmt.Errorf("invalid scheduledStartAt")
	}
	endTime, err := time.Parse(time.RFC3339, *end)
	if err != nil {
		return pgtype.Timestamptz{}, pgtype.Timestamptz{}, fmt.Errorf("invalid scheduledEndAt")
	}
	if !endTime.After(startTime) {
		return pgtype.Timestamptz{}, pgtype.Timestamptz{}, fmt.Errorf("scheduledEndAt must be after scheduledStartAt")
	}

	return pgtype.Timestamptz{Time: startTime, Valid: true}, pgtype.Timestamptz{Time: endTime, Valid: true}, nil
}

// List handles GET /tasks.
func (h *TasksHandler) List(w http.ResponseWriter, r *http.Request) {
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

	tasks, err := h.queries.ListTasks(r.Context(), store.ListTasksParams{
		UserID:  userID,
		Column2: includeArchived,
		Column3: projectID,
	})
	if err != nil {
		slog.Error("failed to list tasks", "error", err)
		WriteError(w, http.StatusInternalServerError, "failed to list tasks")
		return
	}

	result := make([]taskJSON, 0, len(tasks))
	for _, g := range tasks {
		result = append(result, taskFromListRow(g))
	}

	WriteJSON(w, http.StatusOK, result)
}

// createTaskRequest is the request body for POST /tasks.
type createTaskRequest struct {
	Title            string  `json:"title"`
	Description      *string `json:"description,omitempty"`
	Status           *string `json:"status,omitempty"`
	Priority         *string `json:"priority,omitempty"`
	Impact           *string `json:"impact,omitempty"`
	Position         *int32  `json:"position,omitempty"`
	ProjectID        *string `json:"projectId,omitempty"`
	CompletedAt      *string `json:"completedAt,omitempty"`
	ScheduledStartAt *string `json:"scheduledStartAt,omitempty"`
	ScheduledEndAt   *string `json:"scheduledEndAt,omitempty"`
}

// Create handles POST /tasks.
func (h *TasksHandler) Create(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())

	var req createTaskRequest
	if err := ReadJSON(r, &req); err != nil {
		WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if req.Title == "" {
		WriteError(w, http.StatusBadRequest, "title is required")
		return
	}

	params := store.CreateTaskParams{
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
	var scheduleErr error
	params.ScheduledStartAt, params.ScheduledEndAt, scheduleErr = parseScheduleRange(req.ScheduledStartAt, req.ScheduledEndAt)
	if scheduleErr != nil {
		WriteError(w, http.StatusBadRequest, scheduleErr.Error())
		return
	}

	task, err := h.queries.CreateTask(r.Context(), params)
	if err != nil {
		slog.Error("failed to create task", "error", err)
		WriteError(w, http.StatusInternalServerError, "failed to create task")
		return
	}

	WriteJSON(w, http.StatusCreated, taskFromModel(task))
}

// Get handles GET /tasks/{id}.
func (h *TasksHandler) Get(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())

	id, err := GetUUIDParam(r, "id")
	if err != nil {
		WriteError(w, http.StatusBadRequest, err.Error())
		return
	}

	task, err := h.queries.GetTaskByID(r.Context(), store.GetTaskByIDParams{
		ID:     uuidFromGoogle(id),
		UserID: userID,
	})
	if err != nil {
		WriteError(w, http.StatusNotFound, "task not found")
		return
	}

	WriteJSON(w, http.StatusOK, taskFromGetRow(task))
}

// updateTaskRequest is the request body for PATCH /tasks/{id}.
type updateTaskRequest struct {
	Title            *string                `json:"title,omitempty"`
	Description      *string                `json:"description,omitempty"`
	Status           *string                `json:"status,omitempty"`
	Priority         *string                `json:"priority,omitempty"`
	Impact           *string                `json:"impact,omitempty"`
	Position         *int32                 `json:"position,omitempty"`
	ProjectID        optionalNullableString `json:"projectId"`
	CompletedAt      *string                `json:"completedAt"`
	ScheduledStartAt optionalNullableString `json:"scheduledStartAt"`
	ScheduledEndAt   optionalNullableString `json:"scheduledEndAt"`
}

// Update handles PATCH /tasks/{id}.
func (h *TasksHandler) Update(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())

	id, err := GetUUIDParam(r, "id")
	if err != nil {
		WriteError(w, http.StatusBadRequest, err.Error())
		return
	}

	var req updateTaskRequest
	if err := ReadJSON(r, &req); err != nil {
		WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	params := store.UpdateTaskParams{
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
	if req.ProjectID.Set {
		params.ProjectIDSet = true
		if req.ProjectID.Value == nil {
			params.ProjectID = nullUUID()
		} else {
			parsed, err := uuid.Parse(*req.ProjectID.Value)
			if err != nil {
				WriteError(w, http.StatusBadRequest, "invalid projectId")
				return
			}
			params.ProjectID = uuidFromGoogle(parsed)
		}
	}
	if req.ScheduledStartAt.Set != req.ScheduledEndAt.Set {
		WriteError(w, http.StatusBadRequest, "scheduledStartAt and scheduledEndAt must be provided together")
		return
	}
	if req.ScheduledStartAt.Set {
		start, end, err := parseScheduleRange(req.ScheduledStartAt.Value, req.ScheduledEndAt.Value)
		if err != nil {
			WriteError(w, http.StatusBadRequest, err.Error())
			return
		}
		params.ScheduledStartAtSet = true
		params.ScheduledEndAtSet = true
		params.ScheduledStartAt = start
		params.ScheduledEndAt = end
	}

	currentStatus := ""
	if req.Status != nil && *req.Status == "completed" {
		existing, err := h.queries.GetTaskByID(r.Context(), store.GetTaskByIDParams{
			ID:     uuidFromGoogle(id),
			UserID: userID,
		})
		if err != nil {
			WriteError(w, http.StatusNotFound, "task not found")
			return
		}
		currentStatus = ifaceToString(existing.Status)
	}
	params.CompletedAtSet, params.CompletedAt = taskstate.ComputeCompletedAtUpdate(currentStatus, req.Status)

	if err := h.queries.UpdateTask(r.Context(), params); err != nil {
		slog.Error("failed to update task", "error", err)
		WriteError(w, http.StatusInternalServerError, "failed to update task")
		return
	}

	WriteJSON(w, http.StatusOK, map[string]string{"message": "task updated"})
}

// Delete handles DELETE /tasks/{id}.
func (h *TasksHandler) Delete(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())

	id, err := GetUUIDParam(r, "id")
	if err != nil {
		WriteError(w, http.StatusBadRequest, err.Error())
		return
	}

	if err := h.queries.SoftDeleteTask(r.Context(), store.SoftDeleteTaskParams{
		ID:     uuidFromGoogle(id),
		UserID: userID,
	}); err != nil {
		slog.Error("failed to delete task", "error", err)
		WriteError(w, http.StatusInternalServerError, "failed to delete task")
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// GetCount handles GET /tasks/count.
func (h *TasksHandler) GetCount(w http.ResponseWriter, r *http.Request) {
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

	count, err := h.queries.CountTasks(r.Context(), store.CountTasksParams{
		UserID:  userID,
		Column2: includeArchived,
		Column3: projectID,
	})
	if err != nil {
		slog.Error("failed to count tasks", "error", err)
		WriteError(w, http.StatusInternalServerError, "failed to count tasks")
		return
	}

	WriteJSON(w, http.StatusOK, map[string]int32{"count": count})
}

// GetUnassigned handles GET /tasks/unassigned.
func (h *TasksHandler) GetUnassigned(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())

	tasks, err := h.queries.ListUnassignedTasks(r.Context(), userID)
	if err != nil {
		slog.Error("failed to list unassigned tasks", "error", err)
		WriteError(w, http.StatusInternalServerError, "failed to list unassigned tasks")
		return
	}

	result := make([]taskJSON, 0, len(tasks))
	for _, g := range tasks {
		result = append(result, taskFromModel(g))
	}

	WriteJSON(w, http.StatusOK, result)
}

// updatePositionsRequest is the request body for PATCH /tasks/positions.
type updatePositionsRequest struct {
	Tasks    []positionItem `json:"tasks"`
	Sequence int32          `json:"sequence"`
}

type positionItem struct {
	ID       string  `json:"id"`
	Position int32   `json:"position"`
	Status   *string `json:"status,omitempty"`
}

// UpdatePositions handles PATCH /tasks/positions.
func (h *TasksHandler) UpdatePositions(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())

	var req updatePositionsRequest
	if err := ReadJSON(r, &req); err != nil {
		WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Tasks == nil {
		WriteError(w, http.StatusBadRequest, "tasks is required")
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

	for _, g := range req.Tasks {
		parsed, err := uuid.Parse(g.ID)
		if err != nil {
			WriteError(w, http.StatusBadRequest, "invalid task id: "+g.ID)
			return
		}
		params := store.UpdateTaskPositionParams{
			ID:       uuidFromGoogle(parsed),
			UserID:   userID,
			Position: g.Position,
		}
		if g.Status != nil {
			params.Status = *g.Status
		}
		if err := qtx.UpdateTaskPosition(r.Context(), params); err != nil {
			slog.Error("failed to update task position", "error", err, "taskId", g.ID)
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

// ArchiveCompleted handles POST /tasks/archive-completed.
func (h *TasksHandler) ArchiveCompleted(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())

	count, err := h.queries.ArchiveCompletedTasks(r.Context(), userID)
	if err != nil {
		slog.Error("failed to archive completed tasks", "error", err)
		WriteError(w, http.StatusInternalServerError, "failed to archive completed tasks")
		return
	}

	WriteJSON(w, http.StatusOK, map[string]interface{}{
		"success": true,
		"count":   count,
	})
}
