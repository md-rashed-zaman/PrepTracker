package contests

import (
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/md-rashed-zaman/PrepTracker/services/api/internal/httpx"
	"github.com/md-rashed-zaman/PrepTracker/services/api/internal/problems"
	"github.com/md-rashed-zaman/PrepTracker/services/api/internal/reqctx"
	"github.com/md-rashed-zaman/PrepTracker/services/api/internal/scheduler"
	"github.com/md-rashed-zaman/PrepTracker/services/api/internal/users"
)

type Handler struct {
	pool     *pgxpool.Pool
	repo     *Repository
	problems *problems.Repository
	users    *users.Repository
}

func NewHandler(pool *pgxpool.Pool, repo *Repository, problemsRepo *problems.Repository, usersRepo *users.Repository) *Handler {
	return &Handler{pool: pool, repo: repo, problems: problemsRepo, users: usersRepo}
}

func (h *Handler) Get(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		httpx.WriteError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	userID, ok := reqctx.UserIDFromContext(r.Context())
	if !ok {
		httpx.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	id := strings.TrimSpace(chi.URLParam(r, "id"))
	if id == "" {
		httpx.WriteError(w, http.StatusBadRequest, "id required")
		return
	}
	out, err := h.repo.GetWithItems(r.Context(), id, userID)
	if err != nil {
		httpx.WriteError(w, http.StatusNotFound, "not found")
		return
	}
	httpx.WriteJSON(w, http.StatusOK, out)
}

func (h *Handler) Generate(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		httpx.WriteError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	userID, ok := reqctx.UserIDFromContext(r.Context())
	if !ok {
		httpx.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	var req GenerateParams
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "invalid json body")
		return
	}
	if req.DurationMinutes <= 0 {
		req.DurationMinutes = 60
	}
	if req.DifficultyMix.Easy < 0 || req.DifficultyMix.Medium < 0 || req.DifficultyMix.Hard < 0 {
		httpx.WriteError(w, http.StatusBadRequest, "difficulty_mix counts must be >= 0")
		return
	}
	if req.totalCount() == 0 {
		// Reasonable default: 2 easy, 2 medium, 1 hard.
		req.DifficultyMix = DifficultyMix{Easy: 2, Medium: 2, Hard: 1}
	}

	// Load candidates from the library.
	rows, err := h.pool.Query(r.Context(), `
		SELECT p.id::text, p.platform, p.url, p.title, p.difficulty, p.topics,
		       s.reps, s.interval_days, s.ease, s.due_at, s.last_review_at, s.last_grade, s.is_active
		FROM problems p
		JOIN user_problem_state s ON s.problem_id = p.id
		WHERE s.user_id = $1 AND s.is_active = true
	`, userID)
	if err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, "failed to load candidates")
		return
	}
	defer rows.Close()
	all := make([]problems.ProblemWithState, 0)
	for rows.Next() {
		var p problems.ProblemWithState
		var lastReviewAt *time.Time
		var lastGrade *int
		if err := rows.Scan(
			&p.ID, &p.Platform, &p.URL, &p.Title, &p.Difficulty, &p.Topics,
			&p.State.Reps, &p.State.IntervalDays, &p.State.Ease, &p.State.DueAt, &lastReviewAt, &lastGrade, &p.State.IsActive,
		); err != nil {
			httpx.WriteError(w, http.StatusInternalServerError, "failed to parse candidates")
			return
		}
		p.State.LastReviewAt = lastReviewAt
		p.State.LastGrade = lastGrade
		all = append(all, p)
	}

	now := time.Now().UTC()
	chosen := pickContestProblems(now, req, all)
	if len(chosen) == 0 {
		httpx.WriteError(w, http.StatusBadRequest, "no eligible problems found (add problems first)")
		return
	}

	targetMinutes := 0
	if len(chosen) > 0 {
		targetMinutes = req.DurationMinutes / len(chosen)
	}

	ctx := r.Context()
	tx, err := h.pool.Begin(ctx)
	if err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, "failed to start transaction")
		return
	}
	defer func() { _ = tx.Rollback(ctx) }()

	c, err := h.repo.CreateTx(ctx, tx, userID, req.DurationMinutes, strings.TrimSpace(strings.ToLower(req.Strategy)))
	if err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, "failed to create contest")
		return
	}
	for idx, p := range chosen {
		if err := h.repo.AddItemTx(ctx, tx, c.ID, p.ID, idx, targetMinutes); err != nil {
			httpx.WriteError(w, http.StatusInternalServerError, "failed to add contest item")
			return
		}
	}

	if err := tx.Commit(ctx); err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, "failed to commit")
		return
	}

	out, _ := h.repo.GetWithItems(r.Context(), c.ID, userID)
	httpx.WriteJSON(w, http.StatusCreated, out)
}

func (h *Handler) Start(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		httpx.WriteError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	userID, ok := reqctx.UserIDFromContext(r.Context())
	if !ok {
		httpx.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	id := strings.TrimSpace(chi.URLParam(r, "id"))
	if id == "" {
		httpx.WriteError(w, http.StatusBadRequest, "id required")
		return
	}
	out, err := h.repo.Start(r.Context(), id, userID)
	if err != nil {
		httpx.WriteError(w, http.StatusNotFound, "not found")
		return
	}
	httpx.WriteJSON(w, http.StatusOK, out)
}

func (h *Handler) Complete(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		httpx.WriteError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	userID, ok := reqctx.UserIDFromContext(r.Context())
	if !ok {
		httpx.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	id := strings.TrimSpace(chi.URLParam(r, "id"))
	if id == "" {
		httpx.WriteError(w, http.StatusBadRequest, "id required")
		return
	}
	out, err := h.repo.Complete(r.Context(), id, userID)
	if err != nil {
		httpx.WriteError(w, http.StatusNotFound, "not found")
		return
	}
	httpx.WriteJSON(w, http.StatusOK, out)
}

type submitResultsRequest struct {
	Results []submitResult `json:"results"`
}

type submitResult struct {
	ProblemID    string `json:"problem_id"`
	Grade        int    `json:"grade"`
	TimeSpentSec *int   `json:"time_spent_sec"`
	SolvedFlag   *bool  `json:"solved_flag"`
}

func (h *Handler) SubmitResults(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		httpx.WriteError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	userID, ok := reqctx.UserIDFromContext(r.Context())
	if !ok {
		httpx.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	contestID := strings.TrimSpace(chi.URLParam(r, "id"))
	if contestID == "" {
		httpx.WriteError(w, http.StatusBadRequest, "id required")
		return
	}

	var req submitResultsRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "invalid json body")
		return
	}
	if req.Results == nil {
		req.Results = []submitResult{}
	}
	for i := range req.Results {
		req.Results[i].ProblemID = strings.TrimSpace(req.Results[i].ProblemID)
		if req.Results[i].ProblemID == "" {
			httpx.WriteError(w, http.StatusBadRequest, "problem_id required")
			return
		}
		if req.Results[i].Grade < 0 || req.Results[i].Grade > 4 {
			httpx.WriteError(w, http.StatusBadRequest, "grade must be 0..4")
			return
		}
		if req.Results[i].TimeSpentSec != nil && *req.Results[i].TimeSpentSec < 0 {
			httpx.WriteError(w, http.StatusBadRequest, "time_spent_sec must be >= 0")
			return
		}
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
	now := time.Now().UTC()

	ctx := r.Context()
	tx, err := h.pool.Begin(ctx)
	if err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, "failed to start transaction")
		return
	}
	defer func() { _ = tx.Rollback(ctx) }()

	// Ownership check inside the tx so the whole operation is consistent.
	var one int
	if err := tx.QueryRow(ctx, `SELECT 1 FROM contests WHERE id = $1 AND user_id = $2`, contestID, userID).Scan(&one); err != nil {
		httpx.WriteError(w, http.StatusNotFound, "not found")
		return
	}

	for _, res := range req.Results {
		if err := h.repo.UpsertResultTx(ctx, tx, ResultInput{
			ContestID:     contestID,
			ProblemID:     res.ProblemID,
			Grade:         &res.Grade,
			TimeSpentSec:  res.TimeSpentSec,
			SolvedFlag:    res.SolvedFlag,
			RecordedAtUTC: now,
		}); err != nil {
			httpx.WriteError(w, http.StatusInternalServerError, "failed to save contest result")
			return
		}

		if err := h.repo.InsertReviewLogTx(ctx, tx, userID, contestID, res.ProblemID, now, res.Grade, res.TimeSpentSec); err != nil {
			httpx.WriteError(w, http.StatusInternalServerError, "failed to write review log")
			return
		}

		state, err := h.problems.GetStateForUpdate(ctx, tx, userID, res.ProblemID)
		if err != nil {
			// Safety: if state doesn't exist, initialize and retry.
			_ = h.problems.EnsureUserStateTx(ctx, tx, userID, res.ProblemID, now)
			state, err = h.problems.GetStateForUpdate(ctx, tx, userID, res.ProblemID)
			if err != nil {
				httpx.WriteError(w, http.StatusNotFound, "problem state not found")
				return
			}
		}

		out := scheduler.Update(scheduler.State{
			Reps:         state.Reps,
			IntervalDays: state.IntervalDays,
			Ease:         state.Ease,
		}, res.Grade, now, loc, settings.MinIntervalDays, settings.DueHourLocal, settings.DueMinuteLocal)

		state.Reps = out.State.Reps
		state.IntervalDays = out.State.IntervalDays
		state.Ease = out.State.Ease
		state.DueAt = out.DueAt
		state.LastReviewAt = ptrTime(now)
		state.LastGrade = ptrInt(res.Grade)

		if err := h.problems.UpdateState(ctx, tx, userID, res.ProblemID, state); err != nil {
			httpx.WriteError(w, http.StatusInternalServerError, "failed to update scheduling state")
			return
		}
	}

	if err := tx.Commit(ctx); err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, "failed to commit")
		return
	}

	out, _ := h.repo.GetWithItems(r.Context(), contestID, userID)
	httpx.WriteJSON(w, http.StatusOK, out)
}

func ptrInt(v int) *int              { return &v }
func ptrTime(v time.Time) *time.Time { return &v }

// Compile-time check that our transaction interfaces match pgx expectations.
var _ pgx.Tx

