package handler

import (
	"log/slog"
	"net/http"
	"regexp"
	"strings"

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
	UIFont              *string `json:"uiFont,omitempty"`
	CodeFont            *string `json:"codeFont,omitempty"`
	AppearanceTemplate  *string `json:"appearanceTemplate,omitempty"`
	AccentColor         *string `json:"accentColor,omitempty"`
	BackgroundColor     *string `json:"backgroundColor,omitempty"`
	ForegroundColor     *string `json:"foregroundColor,omitempty"`
	Contrast            *int32  `json:"contrast,omitempty"`
	FontSize            *int32  `json:"fontSize,omitempty"`
	Radius              *int32  `json:"radius,omitempty"`
	WeekStartDay        *string `json:"weekStartDay,omitempty"`
	TimeFormat          *string `json:"timeFormat,omitempty"`
	TimeZone            *string `json:"timeZone,omitempty"`
}

var validUserThemes = map[string]bool{
	"system": true,
	"dark":   true,
	"light":  true,
}

var validUIFonts = map[string]bool{
	"geist":     true,
	"inter":     true,
	"system":    true,
	"sf-pro":    true,
	"helvetica": true,
	"avenir":    true,
	"ibm-plex":  true,
	"roboto":    true,
	"segoe":     true,
	"satoshi":   true,
	"codex":     true,
	"linear":    true,
	"github":    true,
	"notion":    true,
	"raycast":   true,
}

var validCodeFonts = map[string]bool{
	"jetbrains":   true,
	"geist-mono":  true,
	"sf-mono":     true,
	"fira-code":   true,
	"system-mono": true,
	"cascadia":    true,
	"menlo":       true,
	"monaco":      true,
}

var validAppearanceTemplates = map[string]bool{
	"absolutely":  true,
	"ayu":         true,
	"catppuccin":  true,
	"codex":       true,
	"dracula":     true,
	"everforest":  true,
	"github":      true,
	"gruvbox":     true,
	"linear":      true,
	"lobster":     true,
	"material":    true,
	"matrix":      true,
	"monokai":     true,
	"night-owl":   true,
	"nord":        true,
	"notion":      true,
	"one":         true,
	"oscurange":   true,
	"proof":       true,
	"rose-pine":   true,
	"sentry":      true,
	"solarized":   true,
	"temple":      true,
	"tokyo-night": true,
	"vscode-plus": true,
}

var validWeekStartDays = map[string]bool{
	"monday":   true,
	"sunday":   true,
	"saturday": true,
}

var validTimeFormats = map[string]bool{
	"12h": true,
	"24h": true,
}

var hexColorPattern = regexp.MustCompile(`^#[0-9A-Fa-f]{6}$`)

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

	if req.Theme != nil ||
		req.Font != nil ||
		req.UIFont != nil ||
		req.CodeFont != nil ||
		req.AppearanceTemplate != nil ||
		req.AccentColor != nil ||
		req.BackgroundColor != nil ||
		req.ForegroundColor != nil ||
		req.Contrast != nil ||
		req.FontSize != nil ||
		req.Radius != nil ||
		req.WeekStartDay != nil ||
		req.TimeFormat != nil ||
		req.TimeZone != nil {
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
			if !validUIFonts[*req.Font] {
				WriteError(w, http.StatusBadRequest, "invalid font")
				return
			}
			params.Font = pgtype.Text{String: normalizeUserFont(*req.Font), Valid: true}
		}

		if req.UIFont != nil {
			if !validUIFonts[*req.UIFont] {
				WriteError(w, http.StatusBadRequest, "invalid UI font")
				return
			}
			params.Font = pgtype.Text{String: normalizeUserFont(*req.UIFont), Valid: true}
		}

		if req.CodeFont != nil {
			if !validCodeFonts[*req.CodeFont] {
				WriteError(w, http.StatusBadRequest, "invalid code font")
				return
			}
			params.CodeFont = pgtype.Text{String: normalizeCodeFont(*req.CodeFont), Valid: true}
		}

		if req.AppearanceTemplate != nil {
			if !validAppearanceTemplates[*req.AppearanceTemplate] {
				WriteError(w, http.StatusBadRequest, "invalid appearance template")
				return
			}
			params.AppearanceTemplate = pgtype.Text{String: *req.AppearanceTemplate, Valid: true}
		}

		if req.AccentColor != nil {
			color, ok := normalizeHexColor(*req.AccentColor)
			if !ok {
				WriteError(w, http.StatusBadRequest, "invalid accent color")
				return
			}
			params.AccentColor = pgtype.Text{String: color, Valid: true}
		}

		if req.BackgroundColor != nil {
			color, ok := normalizeHexColor(*req.BackgroundColor)
			if !ok {
				WriteError(w, http.StatusBadRequest, "invalid background color")
				return
			}
			params.BackgroundColor = pgtype.Text{String: color, Valid: true}
		}

		if req.ForegroundColor != nil {
			color, ok := normalizeHexColor(*req.ForegroundColor)
			if !ok {
				WriteError(w, http.StatusBadRequest, "invalid foreground color")
				return
			}
			params.ForegroundColor = pgtype.Text{String: color, Valid: true}
		}

		if req.Contrast != nil {
			if *req.Contrast < 0 || *req.Contrast > 100 {
				WriteError(w, http.StatusBadRequest, "invalid contrast")
				return
			}
			params.Contrast = pgtype.Int4{Int32: *req.Contrast, Valid: true}
		}

		if req.FontSize != nil {
			if *req.FontSize < 12 || *req.FontSize > 20 {
				WriteError(w, http.StatusBadRequest, "invalid font size")
				return
			}
			params.FontSize = pgtype.Int4{Int32: *req.FontSize, Valid: true}
		}

		if req.Radius != nil {
			if *req.Radius < 0 || *req.Radius > 20 {
				WriteError(w, http.StatusBadRequest, "invalid radius")
				return
			}
			params.Radius = pgtype.Int4{Int32: *req.Radius, Valid: true}
		}

		if req.WeekStartDay != nil {
			if !validWeekStartDays[*req.WeekStartDay] {
				WriteError(w, http.StatusBadRequest, "invalid week start day")
				return
			}
			params.WeekStartDay = pgtype.Text{String: *req.WeekStartDay, Valid: true}
		}

		if req.TimeFormat != nil {
			if !validTimeFormats[*req.TimeFormat] {
				WriteError(w, http.StatusBadRequest, "invalid time format")
				return
			}
			params.TimeFormat = pgtype.Text{String: *req.TimeFormat, Valid: true}
		}

		if req.TimeZone != nil {
			if len(*req.TimeZone) > 64 {
				WriteError(w, http.StatusBadRequest, "invalid time zone")
				return
			}
			params.TimeZone = pgtype.Text{String: strings.TrimSpace(*req.TimeZone), Valid: true}
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

func normalizeHexColor(color string) (string, bool) {
	color = strings.TrimSpace(color)
	if !hexColorPattern.MatchString(color) {
		return "", false
	}
	return strings.ToUpper(color), true
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
