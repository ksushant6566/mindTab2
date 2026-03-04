package handler

import (
	"log/slog"
	"net/http"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/ksushant6566/mindtab/server/internal/middleware"
	"github.com/ksushant6566/mindtab/server/internal/store"
)

// JournalsHandler handles journal endpoints.
type JournalsHandler struct {
	queries store.Querier
}

// NewJournalsHandler creates a new JournalsHandler.
func NewJournalsHandler(queries store.Querier) *JournalsHandler {
	return &JournalsHandler{queries: queries}
}

type journalJSON struct {
	ID            string     `json:"id"`
	Title         string     `json:"title"`
	Content       string     `json:"content"`
	Type          string     `json:"type"`
	Source        string     `json:"source"`
	CreatedAt     *time.Time `json:"createdAt"`
	UpdatedAt     *time.Time `json:"updatedAt"`
	ArchivedAt    *time.Time `json:"archivedAt"`
	ProjectID     *string    `json:"projectId"`
	ProjectName   *string    `json:"projectName,omitempty"`
	ProjectStatus *string    `json:"projectStatus,omitempty"`
}

func journalFromListRow(j store.ListJournalsRow) journalJSON {
	var projID, projName, projStatus *string
	if j.ProjectID.Valid {
		s := uuidToString(j.ProjectID)
		projID = &s
	}
	if j.ProjectName.Valid {
		projName = &j.ProjectName.String
	}
	ps := ifaceToString(j.ProjectStatus)
	if ps != "" {
		projStatus = &ps
	}
	return journalJSON{
		ID:            uuidToString(j.ID),
		Title:         j.Title,
		Content:       j.Content,
		Type:          ifaceToString(j.Type),
		Source:        j.Source,
		CreatedAt:     timestamptzToPtr(j.CreatedAt),
		UpdatedAt:     timestamptzToPtr(j.UpdatedAt),
		ArchivedAt:    timestamptzToPtr(j.ArchivedAt),
		ProjectID:     projID,
		ProjectName:   projName,
		ProjectStatus: projStatus,
	}
}

func journalFromGetRow(j store.GetJournalByIDRow) journalJSON {
	var projID, projName, projStatus *string
	if j.ProjectID.Valid {
		s := uuidToString(j.ProjectID)
		projID = &s
	}
	if j.ProjectName.Valid {
		projName = &j.ProjectName.String
	}
	ps := ifaceToString(j.ProjectStatus)
	if ps != "" {
		projStatus = &ps
	}
	return journalJSON{
		ID:            uuidToString(j.ID),
		Title:         j.Title,
		Content:       j.Content,
		Type:          ifaceToString(j.Type),
		Source:        j.Source,
		CreatedAt:     timestamptzToPtr(j.CreatedAt),
		UpdatedAt:     timestamptzToPtr(j.UpdatedAt),
		ArchivedAt:    timestamptzToPtr(j.ArchivedAt),
		ProjectID:     projID,
		ProjectName:   projName,
		ProjectStatus: projStatus,
	}
}

func journalFromModel(j store.MindmapJournal) journalJSON {
	var projID *string
	if j.ProjectID.Valid {
		s := uuidToString(j.ProjectID)
		projID = &s
	}
	return journalJSON{
		ID:         uuidToString(j.ID),
		Title:      j.Title,
		Content:    j.Content,
		Type:       ifaceToString(j.Type),
		Source:     j.Source,
		CreatedAt:  timestamptzToPtr(j.CreatedAt),
		UpdatedAt:  timestamptzToPtr(j.UpdatedAt),
		ArchivedAt: timestamptzToPtr(j.ArchivedAt),
		ProjectID:  projID,
	}
}

// List handles GET /journals.
func (h *JournalsHandler) List(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())

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

	journals, err := h.queries.ListJournals(r.Context(), store.ListJournalsParams{
		UserID:  userID,
		Column2: projectID,
	})
	if err != nil {
		slog.Error("failed to list journals", "error", err)
		WriteError(w, http.StatusInternalServerError, "failed to list journals")
		return
	}

	result := make([]journalJSON, 0, len(journals))
	for _, j := range journals {
		result = append(result, journalFromListRow(j))
	}

	WriteJSON(w, http.StatusOK, result)
}

type createJournalRequest struct {
	Title     string  `json:"title"`
	Content   string  `json:"content"`
	ProjectID *string `json:"projectId,omitempty"`
}

// Create handles POST /journals.
func (h *JournalsHandler) Create(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())

	var req createJournalRequest
	if err := ReadJSON(r, &req); err != nil {
		WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if req.Title == "" {
		WriteError(w, http.StatusBadRequest, "title is required")
		return
	}

	// Check title uniqueness.
	exists, err := h.queries.CheckJournalTitleExists(r.Context(), store.CheckJournalTitleExistsParams{
		UserID:  userID,
		Title:   req.Title,
		Column3: nullUUID(),
	})
	if err != nil {
		slog.Error("failed to check journal title", "error", err)
		WriteError(w, http.StatusInternalServerError, "failed to create journal")
		return
	}
	if exists {
		WriteError(w, http.StatusConflict, "a journal with this title already exists")
		return
	}

	params := store.CreateJournalParams{
		Title:   req.Title,
		Content: req.Content,
		UserID:  userID,
	}

	if req.ProjectID != nil {
		parsed, err := uuid.Parse(*req.ProjectID)
		if err != nil {
			WriteError(w, http.StatusBadRequest, "invalid projectId")
			return
		}
		params.ProjectID = uuidFromGoogle(parsed)
	}

	if err := h.queries.CreateJournal(r.Context(), params); err != nil {
		slog.Error("failed to create journal", "error", err)
		WriteError(w, http.StatusInternalServerError, "failed to create journal")
		return
	}

	WriteJSON(w, http.StatusCreated, map[string]string{"message": "journal created"})
}

// Get handles GET /journals/{id}.
func (h *JournalsHandler) Get(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())

	id, err := GetUUIDParam(r, "id")
	if err != nil {
		WriteError(w, http.StatusBadRequest, err.Error())
		return
	}

	journal, err := h.queries.GetJournalByID(r.Context(), store.GetJournalByIDParams{
		ID:     uuidFromGoogle(id),
		UserID: userID,
	})
	if err != nil {
		WriteError(w, http.StatusNotFound, "journal not found")
		return
	}

	WriteJSON(w, http.StatusOK, journalFromGetRow(journal))
}

type updateJournalRequest struct {
	Title     *string `json:"title,omitempty"`
	Content   *string `json:"content,omitempty"`
	ProjectID *string `json:"projectId"`
}

// Update handles PATCH /journals/{id}.
func (h *JournalsHandler) Update(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())

	id, err := GetUUIDParam(r, "id")
	if err != nil {
		WriteError(w, http.StatusBadRequest, err.Error())
		return
	}

	var req updateJournalRequest
	if err := ReadJSON(r, &req); err != nil {
		WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	// If title changed, check uniqueness (exclude current id).
	if req.Title != nil {
		exists, err := h.queries.CheckJournalTitleExists(r.Context(), store.CheckJournalTitleExistsParams{
			UserID:  userID,
			Title:   *req.Title,
			Column3: uuidFromGoogle(id),
		})
		if err != nil {
			slog.Error("failed to check journal title", "error", err)
			WriteError(w, http.StatusInternalServerError, "failed to update journal")
			return
		}
		if exists {
			WriteError(w, http.StatusConflict, "a journal with this title already exists")
			return
		}
	}

	params := store.UpdateJournalParams{
		ID:     uuidFromGoogle(id),
		UserID: userID,
	}
	if req.Title != nil {
		params.Title = *req.Title
	}
	if req.Content != nil {
		params.Content = *req.Content
	}
	if req.ProjectID != nil {
		parsed, err := uuid.Parse(*req.ProjectID)
		if err != nil {
			WriteError(w, http.StatusBadRequest, "invalid projectId")
			return
		}
		params.ProjectID = uuidFromGoogle(parsed)
	}

	if err := h.queries.UpdateJournal(r.Context(), params); err != nil {
		slog.Error("failed to update journal", "error", err)
		WriteError(w, http.StatusInternalServerError, "failed to update journal")
		return
	}

	WriteJSON(w, http.StatusOK, map[string]string{"message": "journal updated"})
}

// Delete handles DELETE /journals/{id}.
func (h *JournalsHandler) Delete(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())

	id, err := GetUUIDParam(r, "id")
	if err != nil {
		WriteError(w, http.StatusBadRequest, err.Error())
		return
	}

	if err := h.queries.DeleteJournal(r.Context(), store.DeleteJournalParams{
		ID:     uuidFromGoogle(id),
		UserID: userID,
	}); err != nil {
		slog.Error("failed to delete journal", "error", err)
		WriteError(w, http.StatusInternalServerError, "failed to delete journal")
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// GetCount handles GET /journals/count.
func (h *JournalsHandler) GetCount(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())

	count, err := h.queries.CountJournals(r.Context(), userID)
	if err != nil {
		slog.Error("failed to count journals", "error", err)
		WriteError(w, http.StatusInternalServerError, "failed to count journals")
		return
	}

	WriteJSON(w, http.StatusOK, map[string]int32{"count": count})
}
