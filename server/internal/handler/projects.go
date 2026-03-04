package handler

import (
	"context"
	"log/slog"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/ksushant6566/mindtab/server/internal/middleware"
	"github.com/ksushant6566/mindtab/server/internal/store"
)

// ProjectsHandler handles project endpoints.
type ProjectsHandler struct {
	queries store.Querier
	pool    *pgxpool.Pool
}

// NewProjectsHandler creates a new ProjectsHandler.
func NewProjectsHandler(queries store.Querier, pool *pgxpool.Pool) *ProjectsHandler {
	return &ProjectsHandler{queries: queries, pool: pool}
}

type projectJSON struct {
	ID          string     `json:"id"`
	Name        string     `json:"name"`
	Description *string    `json:"description"`
	Status      string     `json:"status"`
	StartDate   *string    `json:"startDate"`
	EndDate     *string    `json:"endDate"`
	CreatedAt   *time.Time `json:"createdAt"`
	UpdatedAt   *time.Time `json:"updatedAt"`
	Goals       []goalJSON `json:"goals,omitempty"`
}

func projectFromModel(p store.MindmapProject) projectJSON {
	return projectJSON{
		ID:          uuidToString(p.ID),
		Name:        textToString(p.Name),
		Description: textToPtr(p.Description),
		Status:      ifaceToString(p.Status),
		StartDate:   dateToPtr(p.StartDate),
		EndDate:     dateToPtr(p.EndDate),
		CreatedAt:   timestamptzToPtr(p.CreatedAt),
		UpdatedAt:   timestamptzToPtr(p.UpdatedAt),
	}
}

// List handles GET /projects.
func (h *ProjectsHandler) List(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())

	includeArchived := r.URL.Query().Get("includeArchived") == "true"
	statusFilter := r.URL.Query().Get("status")

	var statusCol interface{}
	if statusFilter != "" {
		statusCol = statusFilter
	}

	projects, err := h.queries.ListProjects(r.Context(), store.ListProjectsParams{
		CreatedBy: userID,
		Column2:   includeArchived,
		Column3:   statusCol,
	})
	if err != nil {
		slog.Error("failed to list projects", "error", err)
		WriteError(w, http.StatusInternalServerError, "failed to list projects")
		return
	}

	result := make([]projectJSON, 0, len(projects))
	for _, p := range projects {
		pj := projectFromModel(p)
		// Fetch goals for each project.
		goals, err := h.queries.ListGoalsByProject(r.Context(), store.ListGoalsByProjectParams{
			ProjectID: p.ID,
			UserID:    userID,
		})
		if err != nil {
			slog.Error("failed to list goals for project", "error", err, "projectId", uuidToString(p.ID))
		} else {
			pj.Goals = make([]goalJSON, 0, len(goals))
			for _, g := range goals {
				pj.Goals = append(pj.Goals, goalFromModel(g))
			}
		}
		result = append(result, pj)
	}

	WriteJSON(w, http.StatusOK, result)
}

type createProjectRequest struct {
	Name        string  `json:"name"`
	Description *string `json:"description,omitempty"`
	Status      *string `json:"status,omitempty"`
	StartDate   *string `json:"startDate,omitempty"`
	EndDate     *string `json:"endDate,omitempty"`
}

// Create handles POST /projects.
func (h *ProjectsHandler) Create(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())

	var req createProjectRequest
	if err := ReadJSON(r, &req); err != nil {
		WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if req.Name == "" {
		WriteError(w, http.StatusBadRequest, "name is required")
		return
	}

	params := store.CreateProjectParams{
		Name:      pgtextFrom(req.Name),
		CreatedBy: userID,
	}

	if req.Description != nil {
		params.Description = pgtextFrom(*req.Description)
	}
	if req.Status != nil {
		params.Status = *req.Status
	} else {
		params.Status = "active"
	}
	if req.StartDate != nil {
		params.StartDate = pgdateFrom(*req.StartDate)
	}
	if req.EndDate != nil {
		params.EndDate = pgdateFrom(*req.EndDate)
	}

	project, err := h.queries.CreateProject(r.Context(), params)
	if err != nil {
		slog.Error("failed to create project", "error", err)
		WriteError(w, http.StatusInternalServerError, "failed to create project")
		return
	}

	WriteJSON(w, http.StatusCreated, projectFromModel(project))
}

// Get handles GET /projects/{id}.
func (h *ProjectsHandler) Get(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())

	id, err := GetUUIDParam(r, "id")
	if err != nil {
		WriteError(w, http.StatusBadRequest, err.Error())
		return
	}

	project, err := h.queries.GetProjectByID(r.Context(), store.GetProjectByIDParams{
		ID:        uuidFromGoogle(id),
		CreatedBy: userID,
	})
	if err != nil {
		WriteError(w, http.StatusNotFound, "project not found")
		return
	}

	pj := projectFromModel(project)

	// Fetch goals for the project.
	goals, err := h.queries.ListGoalsByProject(r.Context(), store.ListGoalsByProjectParams{
		ProjectID: project.ID,
		UserID:    userID,
	})
	if err != nil {
		slog.Error("failed to list goals for project", "error", err)
	} else {
		pj.Goals = make([]goalJSON, 0, len(goals))
		for _, g := range goals {
			pj.Goals = append(pj.Goals, goalFromModel(g))
		}
	}

	WriteJSON(w, http.StatusOK, pj)
}

type updateProjectRequest struct {
	Name        *string `json:"name,omitempty"`
	Description *string `json:"description,omitempty"`
	Status      *string `json:"status,omitempty"`
}

// Update handles PATCH /projects/{id}.
func (h *ProjectsHandler) Update(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())

	id, err := GetUUIDParam(r, "id")
	if err != nil {
		WriteError(w, http.StatusBadRequest, err.Error())
		return
	}

	var req updateProjectRequest
	if err := ReadJSON(r, &req); err != nil {
		WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	params := store.UpdateProjectParams{
		ID:            uuidFromGoogle(id),
		LastUpdatedBy: userID,
	}
	if req.Name != nil {
		params.Name = pgtextFrom(*req.Name)
	}
	if req.Description != nil {
		params.Description = pgtextFrom(*req.Description)
	}
	if req.Status != nil {
		params.Status = *req.Status
	}

	project, err := h.queries.UpdateProject(r.Context(), params)
	if err != nil {
		slog.Error("failed to update project", "error", err)
		WriteError(w, http.StatusInternalServerError, "failed to update project")
		return
	}

	WriteJSON(w, http.StatusOK, projectFromModel(project))
}

// Delete handles DELETE /projects/{id}.
func (h *ProjectsHandler) Delete(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())

	id, err := GetUUIDParam(r, "id")
	if err != nil {
		WriteError(w, http.StatusBadRequest, err.Error())
		return
	}

	pgID := uuidFromGoogle(id)

	tx, err := h.pool.Begin(r.Context())
	if err != nil {
		slog.Error("failed to begin transaction", "error", err)
		WriteError(w, http.StatusInternalServerError, "failed to delete project")
		return
	}
	defer func() { _ = tx.Rollback(context.Background()) }()

	qtx := store.New(tx)

	if err := qtx.SoftDeleteProject(r.Context(), store.SoftDeleteProjectParams{
		ID:        pgID,
		CreatedBy: userID,
	}); err != nil {
		slog.Error("failed to soft delete project", "error", err)
		WriteError(w, http.StatusInternalServerError, "failed to delete project")
		return
	}

	if err := qtx.SoftDeleteGoalsByProject(r.Context(), store.SoftDeleteGoalsByProjectParams{
		ProjectID: pgID,
		UserID:    userID,
	}); err != nil {
		slog.Error("failed to soft delete goals by project", "error", err)
		WriteError(w, http.StatusInternalServerError, "failed to delete project")
		return
	}

	if err := qtx.SoftDeleteJournalsByProject(r.Context(), store.SoftDeleteJournalsByProjectParams{
		ProjectID: pgID,
		UserID:    userID,
	}); err != nil {
		slog.Error("failed to soft delete journals by project", "error", err)
		WriteError(w, http.StatusInternalServerError, "failed to delete project")
		return
	}

	if err := tx.Commit(r.Context()); err != nil {
		slog.Error("failed to commit transaction", "error", err)
		WriteError(w, http.StatusInternalServerError, "failed to delete project")
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

type projectStatsJSON struct {
	ID          string     `json:"id"`
	Name        string     `json:"name"`
	Description *string    `json:"description"`
	Status      string     `json:"status"`
	StartDate   *string    `json:"startDate"`
	EndDate     *string    `json:"endDate"`
	CreatedAt   *time.Time `json:"createdAt"`
	UpdatedAt   *time.Time `json:"updatedAt"`
	GoalStats   goalStats  `json:"goalStats"`
	JournalCount int32     `json:"journalCount"`
}

type goalStats struct {
	Total      int32 `json:"total"`
	Pending    int32 `json:"pending"`
	InProgress int32 `json:"inProgress"`
	Completed  int32 `json:"completed"`
}

// GetWithStats handles GET /projects/stats.
func (h *ProjectsHandler) GetWithStats(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())

	projects, err := h.queries.ListProjects(r.Context(), store.ListProjectsParams{
		CreatedBy: userID,
		Column2:   false,
		Column3:   nil,
	})
	if err != nil {
		slog.Error("failed to list projects", "error", err)
		WriteError(w, http.StatusInternalServerError, "failed to get project stats")
		return
	}

	result := make([]projectStatsJSON, 0, len(projects))
	for _, p := range projects {
		ps := projectStatsJSON{
			ID:          uuidToString(p.ID),
			Name:        textToString(p.Name),
			Description: textToPtr(p.Description),
			Status:      ifaceToString(p.Status),
			StartDate:   dateToPtr(p.StartDate),
			EndDate:     dateToPtr(p.EndDate),
			CreatedAt:   timestamptzToPtr(p.CreatedAt),
			UpdatedAt:   timestamptzToPtr(p.UpdatedAt),
		}

		// Get goal stats.
		goalStatRows, err := h.queries.ListGoalStatsByProject(r.Context(), store.ListGoalStatsByProjectParams{
			ProjectID: p.ID,
			UserID:    userID,
		})
		if err != nil {
			slog.Error("failed to get goal stats", "error", err)
		} else {
			for _, gs := range goalStatRows {
				ps.GoalStats.Total++
				switch ifaceToString(gs.Status) {
				case "pending":
					ps.GoalStats.Pending++
				case "in_progress":
					ps.GoalStats.InProgress++
				case "completed":
					ps.GoalStats.Completed++
				}
			}
		}

		// Get journal count.
		jCount, err := h.queries.CountJournalsByProject(r.Context(), store.CountJournalsByProjectParams{
			ProjectID: p.ID,
			UserID:    userID,
		})
		if err != nil {
			slog.Error("failed to count journals by project", "error", err)
		} else {
			ps.JournalCount = jCount
		}

		result = append(result, ps)
	}

	WriteJSON(w, http.StatusOK, result)
}

// Archive handles POST /projects/{id}/archive.
func (h *ProjectsHandler) Archive(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())

	id, err := GetUUIDParam(r, "id")
	if err != nil {
		WriteError(w, http.StatusBadRequest, err.Error())
		return
	}

	pgID := uuidFromGoogle(id)

	tx, err := h.pool.Begin(r.Context())
	if err != nil {
		slog.Error("failed to begin transaction", "error", err)
		WriteError(w, http.StatusInternalServerError, "failed to archive project")
		return
	}
	defer func() { _ = tx.Rollback(context.Background()) }()

	qtx := store.New(tx)

	project, err := qtx.ArchiveProject(r.Context(), store.ArchiveProjectParams{
		ID:            pgID,
		LastUpdatedBy: userID,
	})
	if err != nil {
		slog.Error("failed to archive project", "error", err)
		WriteError(w, http.StatusInternalServerError, "failed to archive project")
		return
	}

	if err := qtx.ArchiveGoalsByProject(r.Context(), store.ArchiveGoalsByProjectParams{
		ProjectID: pgID,
		UserID:    userID,
	}); err != nil {
		slog.Error("failed to archive goals by project", "error", err)
		WriteError(w, http.StatusInternalServerError, "failed to archive project")
		return
	}

	if err := qtx.ArchiveJournalsByProject(r.Context(), store.ArchiveJournalsByProjectParams{
		ProjectID: pgID,
		UserID:    userID,
	}); err != nil {
		slog.Error("failed to archive journals by project", "error", err)
		WriteError(w, http.StatusInternalServerError, "failed to archive project")
		return
	}

	if err := tx.Commit(r.Context()); err != nil {
		slog.Error("failed to commit transaction", "error", err)
		WriteError(w, http.StatusInternalServerError, "failed to archive project")
		return
	}

	WriteJSON(w, http.StatusOK, projectFromModel(project))
}
