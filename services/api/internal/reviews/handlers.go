package reviews

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/md-rashed-zaman/PrepTracker/services/api/internal/httpx"
	"github.com/md-rashed-zaman/PrepTracker/services/api/internal/problems"
	"github.com/md-rashed-zaman/PrepTracker/services/api/internal/reqctx"
	"github.com/md-rashed-zaman/PrepTracker/services/api/internal/scheduler"
	"github.com/md-rashed-zaman/PrepTracker/services/api/internal/users"
)

type Handler struct {
	pool         *pgxpool.Pool
	users        *users.Repository
	problemsRepo *problems.Repository
}

func NewHandler(pool *pgxpool.Pool, usersRepo *users.Repository, problemsRepo *problems.Repository) *Handler {
	return &Handler{pool: pool, users: usersRepo, problemsRepo: problemsRepo}
}

type dueItem struct {
	problems.ProblemWithState
}

func (h *Handler) Due(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		httpx.WriteError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	userID, ok := reqctx.UserIDFromContext(r.Context())
	if !ok {
		httpx.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	windowDays := 0
	if v := strings.TrimSpace(r.URL.Query().Get("window_days")); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			windowDays = n
		}
	}
	if windowDays < 0 {
		windowDays = 0
	}
	now := time.Now().UTC()
	until := now.AddDate(0, 0, windowDays)

	rows, err := h.pool.Query(r.Context(), `
		SELECT p.id::text, p.platform, p.url, p.title, p.difficulty, p.topics,
		       s.reps, s.interval_days, s.ease, s.due_at, s.last_review_at, s.last_grade, s.is_active
		FROM problems p
		JOIN user_problem_state s ON s.problem_id = p.id
		WHERE s.user_id = $1 AND s.is_active = true AND s.due_at <= $2
		ORDER BY s.due_at ASC
	`, userID, until)
	if err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, "failed to load due items")
		return
	}
	defer rows.Close()
	out := make([]problems.ProblemWithState, 0)
	for rows.Next() {
		var p problems.ProblemWithState
		var lastReviewAt *time.Time
		var lastGrade *int
		if err := rows.Scan(
			&p.ID, &p.Platform, &p.URL, &p.Title, &p.Difficulty, &p.Topics,
			&p.State.Reps, &p.State.IntervalDays, &p.State.Ease, &p.State.DueAt, &lastReviewAt, &lastGrade, &p.State.IsActive,
		); err != nil {
			httpx.WriteError(w, http.StatusInternalServerError, "failed to parse due items")
			return
		}
		p.State.LastReviewAt = lastReviewAt
		p.State.LastGrade = lastGrade
		out = append(out, p)
	}
	httpx.WriteJSON(w, http.StatusOK, out)
}

type postReviewRequest struct {
	ProblemID    string `json:"problem_id"`
	Grade        int    `json:"grade"`
	TimeSpentSec *int   `json:"time_spent_sec"`
	Source       string `json:"source"`
	ReviewedAt   string `json:"reviewed_at"`
}

func (h *Handler) Post(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		httpx.WriteError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	userID, ok := reqctx.UserIDFromContext(r.Context())
	if !ok {
		httpx.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	var req postReviewRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "invalid json body")
		return
	}
	req.ProblemID = strings.TrimSpace(req.ProblemID)
	if req.ProblemID == "" {
		httpx.WriteError(w, http.StatusBadRequest, "problem_id required")
		return
	}
	if req.Grade < 0 || req.Grade > 4 {
		httpx.WriteError(w, http.StatusBadRequest, "grade must be 0..4")
		return
	}
	if req.TimeSpentSec != nil && *req.TimeSpentSec < 0 {
		httpx.WriteError(w, http.StatusBadRequest, "time_spent_sec must be >= 0")
		return
	}
	if req.Source == "" {
		req.Source = "manual"
	}

	settings, err := h.users.GetSettings(r.Context(), userID)
	if err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, "failed to load user settings")
		return
	}
	loc, err := time.LoadLocation(settings.Timezone)
	if err != nil {
		loc = time.UTC
	}
	reviewedAt := time.Now().UTC()
	if strings.TrimSpace(req.ReviewedAt) != "" {
		parsed, err := parseReviewedAt(req.ReviewedAt)
		if err != nil {
			httpx.WriteError(w, http.StatusBadRequest, "reviewed_at must be RFC3339 or datetime-local")
			return
		}
		// Guard against accidental future timestamps.
		if parsed.After(time.Now().Add(5 * time.Minute)) {
			httpx.WriteError(w, http.StatusBadRequest, "reviewed_at cannot be in the future")
			return
		}
		reviewedAt = parsed.UTC()
	}

	ctx := r.Context()
	tx, err := h.pool.Begin(ctx)
	if err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, "failed to start transaction")
		return
	}
	defer func() { _ = tx.Rollback(ctx) }()

	_, err = tx.Exec(ctx, `
		INSERT INTO review_logs (user_id, problem_id, reviewed_at, grade, time_spent_sec, source)
		VALUES ($1, $2, $3, $4, $5, $6)
	`, userID, req.ProblemID, reviewedAt, req.Grade, req.TimeSpentSec, req.Source)
	if err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, "failed to write review log")
		return
	}

	state, err := h.problemsRepo.GetStateForUpdate(ctx, tx, userID, req.ProblemID)
	if err != nil {
		httpx.WriteError(w, http.StatusNotFound, "problem state not found")
		return
	}
	res := scheduler.Update(scheduler.State{
		Reps:         state.Reps,
		IntervalDays: state.IntervalDays,
		Ease:         state.Ease,
	}, req.Grade, reviewedAt, loc, settings.MinIntervalDays, settings.DueHourLocal, settings.DueMinuteLocal)

	state.Reps = res.State.Reps
	state.IntervalDays = res.State.IntervalDays
	state.Ease = res.State.Ease
	state.DueAt = res.DueAt
	state.LastReviewAt = ptrTime(reviewedAt)
	state.LastGrade = ptrInt(req.Grade)

	if err := h.problemsRepo.UpdateState(ctx, tx, userID, req.ProblemID, state); err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, "failed to update scheduling state")
		return
	}

	if err := tx.Commit(ctx); err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, "failed to commit transaction")
		return
	}

	httpx.WriteJSON(w, http.StatusOK, map[string]any{
		"problem_id":        req.ProblemID,
		"reviewed_at":       reviewedAt,
		"next_due_at":       state.DueAt,
		"reps":              state.Reps,
		"interval_days":     state.IntervalDays,
		"ease":              state.Ease,
		"min_interval_days": settings.MinIntervalDays,
	})
}

func ptrInt(v int) *int              { return &v }
func ptrTime(v time.Time) *time.Time { return &v }

func parseReviewedAt(raw string) (time.Time, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return time.Time{}, errInvalidReviewedAt
	}
	// RFC3339 (preferred)
	if t, err := time.Parse(time.RFC3339, raw); err == nil {
		return t, nil
	}
	// datetime-local: "YYYY-MM-DDTHH:MM" (interpreted as local time by the browser; we treat it as UTC-ish fallback)
	if t, err := time.Parse("2006-01-02T15:04", raw); err == nil {
		return t, nil
	}
	return time.Time{}, errInvalidReviewedAt
}
var errInvalidReviewedAt = &time.ParseError{Layout: "RFC3339|2006-01-02T15:04", Value: "invalid"}

// Compile-time check that our transaction interfaces match pgx expectations.
var _ pgx.Tx
