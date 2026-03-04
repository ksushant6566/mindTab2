package handler

import (
	"log/slog"
	"net/http"
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
	Count   int            `json:"count"`
	Details activityDetail `json:"details"`
}

type activityDetail struct {
	GoalsCreated    int `json:"goalsCreated"`
	GoalsCompleted  int `json:"goalsCompleted"`
	HabitsCreated   int `json:"habitsCreated"`
	HabitsMarked    int `json:"habitsMarked"`
	JournalsCreated int `json:"journalsCreated"`
	JournalsUpdated int `json:"journalsUpdated"`
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
	sinceDate := pgtype.Date{Time: since, Valid: true}

	activityMap := make(map[string]*activityDay)

	getOrCreate := func(date string) *activityDay {
		if day, ok := activityMap[date]; ok {
			return day
		}
		day := &activityDay{}
		activityMap[date] = day
		return day
	}

	// Goal activity.
	goalActivity, err := h.queries.GetGoalActivity(r.Context(), store.GetGoalActivityParams{
		UserID:    userID,
		CreatedAt: sinceTimestamptz,
	})
	if err != nil {
		slog.Error("failed to get goal activity", "error", err)
		WriteError(w, http.StatusInternalServerError, "failed to get activity")
		return
	}
	for _, g := range goalActivity {
		if !g.CreatedAt.Valid {
			continue
		}
		dateKey := g.CreatedAt.Time.Format("2006-01-02")
		day := getOrCreate(dateKey)
		day.Count++
		status := ifaceToString(g.Status)
		if status == "completed" {
			day.Details.GoalsCompleted++
		} else {
			day.Details.GoalsCreated++
		}
	}

	// Habit activity.
	habitActivity, err := h.queries.GetHabitActivity(r.Context(), store.GetHabitActivityParams{
		UserID:    userID,
		CreatedAt: sinceTimestamptz,
	})
	if err != nil {
		slog.Error("failed to get habit activity", "error", err)
		WriteError(w, http.StatusInternalServerError, "failed to get activity")
		return
	}
	for _, createdAt := range habitActivity {
		if !createdAt.Valid {
			continue
		}
		dateKey := createdAt.Time.Format("2006-01-02")
		day := getOrCreate(dateKey)
		day.Count++
		day.Details.HabitsCreated++
	}

	// Habit tracker activity.
	trackerActivity, err := h.queries.GetHabitTrackerActivity(r.Context(), store.GetHabitTrackerActivityParams{
		UserID:  userID,
		Column2: sinceDate,
	})
	if err != nil {
		slog.Error("failed to get habit tracker activity", "error", err)
		WriteError(w, http.StatusInternalServerError, "failed to get activity")
		return
	}
	for _, d := range trackerActivity {
		if !d.Valid {
			continue
		}
		dateKey := d.Time.Format("2006-01-02")
		day := getOrCreate(dateKey)
		day.Count++
		day.Details.HabitsMarked++
	}

	// Journal activity.
	journalActivity, err := h.queries.GetJournalActivity(r.Context(), store.GetJournalActivityParams{
		UserID:    userID,
		CreatedAt: sinceTimestamptz,
	})
	if err != nil {
		slog.Error("failed to get journal activity", "error", err)
		WriteError(w, http.StatusInternalServerError, "failed to get activity")
		return
	}
	for _, j := range journalActivity {
		if !j.CreatedAt.Valid {
			continue
		}
		dateKey := j.CreatedAt.Time.Format("2006-01-02")
		day := getOrCreate(dateKey)
		day.Count++
		day.Details.JournalsCreated++

		// If updatedAt != createdAt, count as updated too.
		if j.UpdatedAt.Valid && j.UpdatedAt.Time.After(j.CreatedAt.Time.Add(time.Second)) {
			updateDateKey := j.UpdatedAt.Time.Format("2006-01-02")
			if updateDateKey != dateKey {
				updateDay := getOrCreate(updateDateKey)
				updateDay.Count++
				updateDay.Details.JournalsUpdated++
			} else {
				day.Details.JournalsUpdated++
			}
		}
	}

	WriteJSON(w, http.StatusOK, activityMap)
}
