package users

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/md-rashed-zaman/PrepTracker/services/api/internal/httpx"
	"github.com/md-rashed-zaman/PrepTracker/services/api/internal/reqctx"
)

type Handler struct {
	repo *Repository
}

func NewHandler(repo *Repository) *Handler {
	return &Handler{repo: repo}
}

type patchSettingsRequest struct {
	Timezone        *string `json:"timezone"`
	MinIntervalDays *int    `json:"min_interval_days"`
	DueHourLocal    *int    `json:"due_hour_local"`
	DueMinuteLocal  *int    `json:"due_minute_local"`
}

func (h *Handler) PatchMeSettings(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPatch {
		httpx.WriteError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	userID, ok := reqctx.UserIDFromContext(r.Context())
	if !ok {
		httpx.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	var req patchSettingsRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "invalid json body")
		return
	}
	if req.Timezone != nil {
		tz := strings.TrimSpace(*req.Timezone)
		req.Timezone = &tz
		if tz == "" {
			httpx.WriteError(w, http.StatusBadRequest, "timezone must not be empty")
			return
		}
	}
	if req.MinIntervalDays != nil && *req.MinIntervalDays <= 0 {
		httpx.WriteError(w, http.StatusBadRequest, "min_interval_days must be >= 1")
		return
	}
	if req.DueHourLocal != nil && (*req.DueHourLocal < 0 || *req.DueHourLocal > 23) {
		httpx.WriteError(w, http.StatusBadRequest, "due_hour_local must be 0..23")
		return
	}
	if req.DueMinuteLocal != nil && (*req.DueMinuteLocal < 0 || *req.DueMinuteLocal > 59) {
		httpx.WriteError(w, http.StatusBadRequest, "due_minute_local must be 0..59")
		return
	}

	settings, err := h.repo.UpdateSettings(r.Context(), userID, req.Timezone, req.MinIntervalDays, req.DueHourLocal, req.DueMinuteLocal)
	if err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, "failed to update settings")
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{
		"timezone":          settings.Timezone,
		"min_interval_days": settings.MinIntervalDays,
		"due_hour_local":    settings.DueHourLocal,
		"due_minute_local":  settings.DueMinuteLocal,
	})
}
