package handler

import (
	"log/slog"
	"net/http"
	"sort"
	"time"

	"github.com/jackc/pgx/v5/pgtype"

	"github.com/ksushant6566/mindtab/server/internal/store"
)

// ActivityHandler handles activity endpoints.
type ActivityHandler struct {
	queries store.Querier
}

// NewActivityHandler creates a new ActivityHandler.
func NewActivityHandler(queries store.Querier) *ActivityHandler {
	return &ActivityHandler{queries: queries}
}

type activityDay struct {
	Date    string         `json:"date"`
	Count   int            `json:"count"`
	Details activityDetail `json:"details"`
}

type activityDetail struct {
	TasksCreated   int `json:"tasksCreated"`
	TasksCompleted int `json:"tasksCompleted"`
	NotesCreated   int `json:"notesCreated"`
	NotesUpdated   int `json:"notesUpdated"`
}

// GetUserActivity handles GET /activity?userId=.
func (h *ActivityHandler) GetUserActivity(w http.ResponseWriter, r *http.Request) {
	userID := r.URL.Query().Get("userId")
	if userID == "" {
		WriteError(w, http.StatusBadRequest, "userId query parameter is required")
		return
	}

	since := time.Now().AddDate(0, 0, -365)
	sinceTimestamptz := pgtype.Timestamptz{Time: since, Valid: true}
	activityMap := make(map[string]*activityDay)

	getOrCreate := func(date string) *activityDay {
		if day, ok := activityMap[date]; ok {
			return day
		}
		day := &activityDay{Date: date}
		activityMap[date] = day
		return day
	}

	// Task activity.
	taskActivity, err := h.queries.GetTaskActivity(r.Context(), store.GetTaskActivityParams{
		UserID:    userID,
		CreatedAt: sinceTimestamptz,
	})
	if err != nil {
		slog.Error("failed to get task activity", "error", err)
		WriteError(w, http.StatusInternalServerError, "failed to get activity")
		return
	}
	for _, g := range taskActivity {
		if !g.CreatedAt.Valid {
			continue
		}
		dateKey := g.CreatedAt.Time.Format("2006-01-02")
		day := getOrCreate(dateKey)
		day.Count++
		status := ifaceToString(g.Status)
		if status == "completed" {
			day.Details.TasksCompleted++
		} else {
			day.Details.TasksCreated++
		}
	}

	// Note activity.
	noteActivity, err := h.queries.GetNoteActivity(r.Context(), store.GetNoteActivityParams{
		UserID:    userID,
		CreatedAt: sinceTimestamptz,
	})
	if err != nil {
		slog.Error("failed to get note activity", "error", err)
		WriteError(w, http.StatusInternalServerError, "failed to get activity")
		return
	}
	for _, j := range noteActivity {
		if !j.CreatedAt.Valid {
			continue
		}
		dateKey := j.CreatedAt.Time.Format("2006-01-02")
		day := getOrCreate(dateKey)
		day.Count++
		day.Details.NotesCreated++

		// If updatedAt != createdAt, count as updated too.
		if j.UpdatedAt.Valid && j.UpdatedAt.Time.After(j.CreatedAt.Time.Add(time.Second)) {
			updateDateKey := j.UpdatedAt.Time.Format("2006-01-02")
			if updateDateKey != dateKey {
				updateDay := getOrCreate(updateDateKey)
				updateDay.Count++
				updateDay.Details.NotesUpdated++
			} else {
				day.Details.NotesUpdated++
			}
		}
	}

	activity := make([]*activityDay, 0, len(activityMap))
	for _, day := range activityMap {
		activity = append(activity, day)
	}
	sort.Slice(activity, func(i, j int) bool {
		return activity[i].Date < activity[j].Date
	})

	WriteJSON(w, http.StatusOK, activity)
}
