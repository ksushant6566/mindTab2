package handler

import (
	"log/slog"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/ksushant6566/mindtab/server/internal/middleware"
	"github.com/ksushant6566/mindtab/server/internal/store"
)

// UsersHandler handles user endpoints.
type UsersHandler struct {
	queries store.Querier
}

// NewUsersHandler creates a new UsersHandler.
func NewUsersHandler(queries store.Querier) *UsersHandler {
	return &UsersHandler{queries: queries}
}

// GetMe handles GET /users/me.
func (h *UsersHandler) GetMe(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())

	user, err := h.queries.GetUserByID(r.Context(), userID)
	if err != nil {
		slog.Error("failed to get user", "error", err)
		WriteError(w, http.StatusNotFound, "user not found")
		return
	}

	WriteJSON(w, http.StatusOK, toUserJSON(user))
}

// updateMeRequest is the request body for PATCH /users/me.
type updateMeRequest struct {
	OnboardingCompleted *bool   `json:"onboardingCompleted,omitempty"`
	Theme               *string `json:"theme,omitempty"`
	Font                *string `json:"font,omitempty"`
}

var validUserThemes = map[string]bool{
	"midnight": true,
	"graphite": true,
	"paper":    true,
}

var validUserFonts = map[string]bool{
	"codex":   true,
	"linear":  true,
	"github":  true,
	"notion":  true,
	"raycast": true,
	"system":  true,
	"inter":   true,
	"geist":   true,
}

// UpdateMe handles PATCH /users/me.
func (h *UsersHandler) UpdateMe(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())

	var req updateMeRequest
	if err := ReadJSON(r, &req); err != nil {
		WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if req.OnboardingCompleted != nil && *req.OnboardingCompleted {
		if err := h.queries.CompleteOnboarding(r.Context(), userID); err != nil {
			slog.Error("failed to complete onboarding", "error", err)
			WriteError(w, http.StatusInternalServerError, "failed to complete onboarding")
			return
		}
	}

	if req.Theme != nil || req.Font != nil {
		params := store.UpdateUserAppearanceParams{
			ID: userID,
		}

		if req.Theme != nil {
			if !validUserThemes[*req.Theme] {
				WriteError(w, http.StatusBadRequest, "invalid theme")
				return
			}
			params.Theme = pgtype.Text{String: *req.Theme, Valid: true}
		}

		if req.Font != nil {
			if !validUserFonts[*req.Font] {
				WriteError(w, http.StatusBadRequest, "invalid font")
				return
			}
			params.Font = pgtype.Text{String: normalizeUserFont(*req.Font), Valid: true}
		}

		if _, err := h.queries.UpdateUserAppearance(r.Context(), params); err != nil {
			slog.Error("failed to update user appearance", "error", err)
			WriteError(w, http.StatusInternalServerError, "failed to update appearance")
			return
		}
	}

	user, err := h.queries.GetUserByID(r.Context(), userID)
	if err != nil {
		slog.Error("failed to get user", "error", err)
		WriteError(w, http.StatusInternalServerError, "failed to get user")
		return
	}

	WriteJSON(w, http.StatusOK, toUserJSON(user))
}

// GetByID handles GET /users/{id} (public).
func (h *UsersHandler) GetByID(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if id == "" {
		WriteError(w, http.StatusBadRequest, "missing user id")
		return
	}

	user, err := h.queries.GetUserByID(r.Context(), id)
	if err != nil {
		WriteError(w, http.StatusNotFound, "user not found")
		return
	}

	WriteJSON(w, http.StatusOK, toUserJSON(user))
}
