package problems

import (
	"encoding/json"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/md-rashed-zaman/PrepTracker/services/api/internal/httpx"
	"github.com/md-rashed-zaman/PrepTracker/services/api/internal/reqctx"
	"github.com/md-rashed-zaman/PrepTracker/services/api/internal/scheduler"
	"github.com/md-rashed-zaman/PrepTracker/services/api/internal/users"
)

type Handler struct {
	repo  *Repository
	users *users.Repository
}

func NewHandler(repo *Repository, usersRepo *users.Repository) *Handler {
	return &Handler{repo: repo, users: usersRepo}
}

type createRequest struct {
	Platform   string   `json:"platform"`
	URL        string   `json:"url"`
	Title      string   `json:"title"`
	Difficulty string   `json:"difficulty"`
	Topics     []string `json:"topics"`
	Initial    *struct {
		Grade        int    `json:"grade"`
		TimeSpentSec *int   `json:"time_spent_sec"`
		ReviewedAt   string `json:"reviewed_at"`
		Source       string `json:"source"`
	} `json:"initial_review"`
}

func (h *Handler) Create(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		httpx.WriteError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	userID, ok := reqctx.UserIDFromContext(r.Context())
	if !ok {
		httpx.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	var req createRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "invalid json body")
		return
	}
	req.URL = NormalizeURL(req.URL)
	if req.URL == "" {
		httpx.WriteError(w, http.StatusBadRequest, "url required")
		return
	}

	// On add, make it due today at the user's configured due time (local), converted to UTC.
	settings, err := h.users.GetSettings(r.Context(), userID)
	if err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, "failed to load user settings")
		return
	}
	loc, err := time.LoadLocation(settings.Timezone)
	if err != nil {
		loc = time.UTC
	}
	dueAt := scheduler.DueAtToday(time.Now().UTC(), loc, settings.DueHourLocal, settings.DueMinuteLocal)

	ctx := r.Context()
	tx, err := h.repo.pool.Begin(ctx)
	if err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, "failed to start transaction")
		return
	}
	defer func() { _ = tx.Rollback(ctx) }()

	p, err := h.repo.CreateOrGetTx(ctx, tx, Problem{
		Platform:   strings.TrimSpace(req.Platform),
		URL:        req.URL,
		Title:      strings.TrimSpace(req.Title),
		Difficulty: strings.TrimSpace(req.Difficulty),
		Topics:     req.Topics,
	})
	if err != nil {
		if pgErr, ok := err.(*pgconn.PgError); ok && pgErr.Code == "23505" {
			httpx.WriteError(w, http.StatusConflict, "problem already exists")
			return
		}
		httpx.WriteError(w, http.StatusInternalServerError, "failed to create problem")
		return
	}

	if err := h.repo.EnsureUserStateTx(ctx, tx, userID, p.ID, dueAt); err != nil {
		msg := "failed to initialize user problem state"
		status := http.StatusInternalServerError
		if pgErr, ok := err.(*pgconn.PgError); ok {
			switch pgErr.Code {
			case "22P02":
				msg = "failed to initialize user problem state (invalid user or problem id)"
			case "23503":
				status = http.StatusUnauthorized
				msg = "session user not found (please log in again)"
			case "42P01":
				msg = "failed to initialize user problem state (db not migrated)"
			}
		}
		log.Printf("ensure user state user_id=%s problem_id=%s err=%v", userID, p.ID, err)
		httpx.WriteError(w, status, msg)
		return
	}

	// Optional: log an initial attempt while adding the problem (useful for backfilling).
	if req.Initial != nil {
		if req.Initial.Grade < 0 || req.Initial.Grade > 4 {
			httpx.WriteError(w, http.StatusBadRequest, "initial_review.grade must be 0..4")
			return
		}
		if req.Initial.TimeSpentSec != nil && *req.Initial.TimeSpentSec < 0 {
			httpx.WriteError(w, http.StatusBadRequest, "initial_review.time_spent_sec must be >= 0")
			return
		}
		reviewedAt := time.Now().UTC()
		if strings.TrimSpace(req.Initial.ReviewedAt) != "" {
			t, err := time.Parse(time.RFC3339, strings.TrimSpace(req.Initial.ReviewedAt))
			if err != nil {
				httpx.WriteError(w, http.StatusBadRequest, "initial_review.reviewed_at must be RFC3339")
				return
			}
			if t.After(time.Now().Add(5 * time.Minute)) {
				httpx.WriteError(w, http.StatusBadRequest, "initial_review.reviewed_at cannot be in the future")
				return
			}
			reviewedAt = t.UTC()
		}
		src := strings.TrimSpace(req.Initial.Source)
		if src == "" {
			src = "library_add"
		}

		_, err := tx.Exec(ctx, `
			INSERT INTO review_logs (user_id, problem_id, reviewed_at, grade, time_spent_sec, source)
			VALUES ($1, $2, $3, $4, $5, $6)
		`, userID, p.ID, reviewedAt, req.Initial.Grade, req.Initial.TimeSpentSec, src)
		if err != nil {
			httpx.WriteError(w, http.StatusInternalServerError, "failed to write initial review log")
			return
		}

		state, err := h.repo.GetStateForUpdate(ctx, tx, userID, p.ID)
		if err != nil {
			httpx.WriteError(w, http.StatusInternalServerError, "failed to load state")
			return
		}
		res := scheduler.Update(scheduler.State{
			Reps:         state.Reps,
			IntervalDays: state.IntervalDays,
			Ease:         state.Ease,
		}, req.Initial.Grade, reviewedAt, loc, settings.MinIntervalDays, settings.DueHourLocal, settings.DueMinuteLocal)
		state.Reps = res.State.Reps
		state.IntervalDays = res.State.IntervalDays
		state.Ease = res.State.Ease
		state.DueAt = res.DueAt
		state.LastReviewAt = &reviewedAt
		state.LastGrade = &req.Initial.Grade
		if err := h.repo.UpdateState(ctx, tx, userID, p.ID, state); err != nil {
			httpx.WriteError(w, http.StatusInternalServerError, "failed to update scheduling state")
			return
		}
	}

	if err := tx.Commit(ctx); err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, "failed to commit transaction")
		return
	}

	httpx.WriteJSON(w, http.StatusCreated, p)
}

func (h *Handler) List(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		httpx.WriteError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	userID, ok := reqctx.UserIDFromContext(r.Context())
	if !ok {
		httpx.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	items, err := h.repo.ListForUser(r.Context(), userID)
	if err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, "failed to list problems")
		return
	}
	httpx.WriteJSON(w, http.StatusOK, items)
}

type patchRequest struct {
	IsActive    *bool     `json:"is_active"`
	Platform    *string   `json:"platform"`
	Title       *string   `json:"title"`
	Difficulty  *string   `json:"difficulty"`
	Topics      *[]string `json:"topics"`
}

func (h *Handler) Patch(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPatch {
		httpx.WriteError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	userID, ok := reqctx.UserIDFromContext(r.Context())
	if !ok {
		httpx.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	problemID := chi.URLParam(r, "id")
	if strings.TrimSpace(problemID) == "" {
		httpx.WriteError(w, http.StatusBadRequest, "id required")
		return
	}
	var req patchRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "invalid json body")
		return
	}
	metadataTouched := req.Platform != nil || req.Title != nil || req.Difficulty != nil || req.Topics != nil
	if req.IsActive != nil {
		if err := h.repo.SetActive(r.Context(), userID, problemID, *req.IsActive); err != nil {
			httpx.WriteError(w, http.StatusNotFound, "not found")
			return
		}
	}
	if metadataTouched {
		var patch MetadataPatch
		if req.Platform != nil {
			v := strings.TrimSpace(*req.Platform)
			patch.Platform = &v
		}
		if req.Title != nil {
			v := strings.TrimSpace(*req.Title)
			patch.Title = &v
		}
		if req.Difficulty != nil {
			v := strings.TrimSpace(strings.ToLower(*req.Difficulty))
			if v == "" {
				v = "unknown"
			}
			if v != "easy" && v != "medium" && v != "hard" && v != "unknown" {
				httpx.WriteError(w, http.StatusBadRequest, "difficulty must be easy|medium|hard|unknown")
				return
			}
			patch.Difficulty = &v
		}
		if req.Topics != nil {
			next := make([]string, 0, len(*req.Topics))
			for _, t := range *req.Topics {
				tt := strings.TrimSpace(t)
				if tt == "" {
					continue
				}
				next = append(next, tt)
			}
			patch.Topics = &next
		}
		out, err := h.repo.PatchMetadataForUser(r.Context(), userID, problemID, patch)
		if err != nil {
			httpx.WriteError(w, http.StatusNotFound, "not found")
			return
		}
		httpx.WriteJSON(w, http.StatusOK, out)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// Compile-time check that our transaction interfaces match pgx expectations.
var _ pgx.Tx
