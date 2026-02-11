package calendar

import (
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/md-rashed-zaman/PrepTracker/services/api/internal/httpx"
	"github.com/md-rashed-zaman/PrepTracker/services/api/internal/reqctx"
	"github.com/md-rashed-zaman/PrepTracker/services/api/internal/users"
)

type Handler struct {
	tokens      *TokenRepo
	users       *users.Repository
	icsBaseURL  string
	defaultDays int
}

func NewHandler(tokens *TokenRepo, usersRepo *users.Repository, icsBaseURL string) *Handler {
	return &Handler{
		tokens:      tokens,
		users:       usersRepo,
		icsBaseURL:  strings.TrimRight(strings.TrimSpace(icsBaseURL), "/"),
		defaultDays: 30,
	}
}

func (h *Handler) RotateToken(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		httpx.WriteError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	userID, ok := reqctx.UserIDFromContext(r.Context())
	if !ok {
		httpx.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	raw, err := h.tokens.Rotate(r.Context(), userID)
	if err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, "failed to rotate token")
		return
	}
	path := "/api/v1/integrations/calendar/ics?token=" + raw
	url := h.icsBaseURL + path
	if h.icsBaseURL == "" {
		proto := strings.TrimSpace(r.Header.Get("X-Forwarded-Proto"))
		if proto == "" {
			proto = "http"
		}
		url = proto + "://" + r.Host + path
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{
		"subscription_url": url,
	})
}

func (h *Handler) ICS(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	raw := strings.TrimSpace(r.URL.Query().Get("token"))
	if raw == "" {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	userID, err := h.tokens.UserIDByRawToken(r.Context(), raw)
	if err != nil {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	windowDays := h.defaultDays
	if v := strings.TrimSpace(r.URL.Query().Get("window_days")); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			windowDays = n
		}
	}
	settings, err := h.users.GetSettings(r.Context(), userID)
	if err != nil {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	loc, err := time.LoadLocation(settings.Timezone)
	if err != nil {
		loc = time.UTC
	}
	until := time.Now().UTC().AddDate(0, 0, windowDays)
	due, err := h.tokens.LoadDueWindow(r.Context(), userID, until)
	if err != nil {
		http.Error(w, "failed to load calendar", http.StatusInternalServerError)
		return
	}
	events := make([]Event, 0, len(due))
	for _, d := range due {
		local := d.DueAt.In(loc)
		start := time.Date(local.Year(), local.Month(), local.Day(), settings.DueHourLocal, settings.DueMinuteLocal, 0, 0, loc)
		end := start.Add(30 * time.Minute)
		events = append(events, Event{
			UID:         "preptracker-" + userID + "-" + d.ProblemID,
			Summary:     EventSummary(d.Title),
			Description: d.URL,
			URL:         d.URL,
			Start:       start,
			End:         end,
			AllDay:      false,
		})
	}
	ics := BuildICS("PrepTracker", events)
	w.Header().Set("Content-Type", "text/calendar; charset=utf-8")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte(ics))
}
