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

// NotesHandler handles note endpoints.
type NotesHandler struct {
	queries store.Querier
}

// NewNotesHandler creates a new NotesHandler.
func NewNotesHandler(queries store.Querier) *NotesHandler {
	return &NotesHandler{queries: queries}
}

type noteJSON struct {
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

func noteFromListRow(j store.ListNotesRow) noteJSON {
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
	return noteJSON{
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

func noteFromGetRow(j store.GetNoteByIDRow) noteJSON {
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
	return noteJSON{
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

func noteFromModel(j store.Note) noteJSON {
	var projID *string
	if j.ProjectID.Valid {
		s := uuidToString(j.ProjectID)
		projID = &s
	}
	return noteJSON{
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

// List handles GET /notes.
func (h *NotesHandler) List(w http.ResponseWriter, r *http.Request) {
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

	notes, err := h.queries.ListNotes(r.Context(), store.ListNotesParams{
		UserID:  userID,
		Column2: projectID,
	})
	if err != nil {
		slog.Error("failed to list notes", "error", err)
		WriteError(w, http.StatusInternalServerError, "failed to list notes")
		return
	}

	result := make([]noteJSON, 0, len(notes))
	for _, j := range notes {
		result = append(result, noteFromListRow(j))
	}

	WriteJSON(w, http.StatusOK, result)
}

type createNoteRequest struct {
	Title     string  `json:"title"`
	Content   string  `json:"content"`
	ProjectID *string `json:"projectId,omitempty"`
}

// Create handles POST /notes.
func (h *NotesHandler) Create(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())

	var req createNoteRequest
	if err := ReadJSON(r, &req); err != nil {
		WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if req.Title == "" {
		WriteError(w, http.StatusBadRequest, "title is required")
		return
	}

	// Check title uniqueness.
	exists, err := h.queries.CheckNoteTitleExists(r.Context(), store.CheckNoteTitleExistsParams{
		UserID:  userID,
		Title:   req.Title,
		Column3: nullUUID(),
	})
	if err != nil {
		slog.Error("failed to check note title", "error", err)
		WriteError(w, http.StatusInternalServerError, "failed to create note")
		return
	}
	if exists {
		WriteError(w, http.StatusConflict, "a note with this title already exists")
		return
	}

	params := store.CreateNoteParams{
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

	if err := h.queries.CreateNote(r.Context(), params); err != nil {
		slog.Error("failed to create note", "error", err)
		WriteError(w, http.StatusInternalServerError, "failed to create note")
		return
	}

	WriteJSON(w, http.StatusCreated, map[string]string{"message": "note created"})
}

// Get handles GET /notes/{id}.
func (h *NotesHandler) Get(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())

	id, err := GetUUIDParam(r, "id")
	if err != nil {
		WriteError(w, http.StatusBadRequest, err.Error())
		return
	}

	note, err := h.queries.GetNoteByID(r.Context(), store.GetNoteByIDParams{
		ID:     uuidFromGoogle(id),
		UserID: userID,
	})
	if err != nil {
		WriteError(w, http.StatusNotFound, "note not found")
		return
	}

	WriteJSON(w, http.StatusOK, noteFromGetRow(note))
}

type updateNoteRequest struct {
	Title     *string                `json:"title,omitempty"`
	Content   *string                `json:"content,omitempty"`
	ProjectID optionalNullableString `json:"projectId"`
}

// Update handles PATCH /notes/{id}.
func (h *NotesHandler) Update(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())

	id, err := GetUUIDParam(r, "id")
	if err != nil {
		WriteError(w, http.StatusBadRequest, err.Error())
		return
	}

	var req updateNoteRequest
	if err := ReadJSON(r, &req); err != nil {
		WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	// If title changed, check uniqueness (exclude current id).
	if req.Title != nil {
		exists, err := h.queries.CheckNoteTitleExists(r.Context(), store.CheckNoteTitleExistsParams{
			UserID:  userID,
			Title:   *req.Title,
			Column3: uuidFromGoogle(id),
		})
		if err != nil {
			slog.Error("failed to check note title", "error", err)
			WriteError(w, http.StatusInternalServerError, "failed to update note")
			return
		}
		if exists {
			WriteError(w, http.StatusConflict, "a note with this title already exists")
			return
		}
	}

	params := store.UpdateNoteParams{
		ID:     uuidFromGoogle(id),
		UserID: userID,
	}
	if req.Title != nil {
		params.Title = *req.Title
	}
	if req.Content != nil {
		params.Content = *req.Content
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

	if err := h.queries.UpdateNote(r.Context(), params); err != nil {
		slog.Error("failed to update note", "error", err)
		WriteError(w, http.StatusInternalServerError, "failed to update note")
		return
	}

	WriteJSON(w, http.StatusOK, map[string]string{"message": "note updated"})
}

// Delete handles DELETE /notes/{id}.
func (h *NotesHandler) Delete(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())

	id, err := GetUUIDParam(r, "id")
	if err != nil {
		WriteError(w, http.StatusBadRequest, err.Error())
		return
	}

	if err := h.queries.DeleteNote(r.Context(), store.DeleteNoteParams{
		ID:     uuidFromGoogle(id),
		UserID: userID,
	}); err != nil {
		slog.Error("failed to delete note", "error", err)
		WriteError(w, http.StatusInternalServerError, "failed to delete note")
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// GetCount handles GET /notes/count.
func (h *NotesHandler) GetCount(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())

	count, err := h.queries.CountNotes(r.Context(), userID)
	if err != nil {
		slog.Error("failed to count notes", "error", err)
		WriteError(w, http.StatusInternalServerError, "failed to count notes")
		return
	}

	WriteJSON(w, http.StatusOK, map[string]int32{"count": count})
}
