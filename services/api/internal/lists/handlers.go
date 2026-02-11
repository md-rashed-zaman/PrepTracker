package lists

import (
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/md-rashed-zaman/PrepTracker/services/api/internal/httpx"
	"github.com/md-rashed-zaman/PrepTracker/services/api/internal/problems"
	"github.com/md-rashed-zaman/PrepTracker/services/api/internal/reqctx"
	"github.com/md-rashed-zaman/PrepTracker/services/api/internal/scheduler"
	"github.com/md-rashed-zaman/PrepTracker/services/api/internal/templates"
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

type createListRequest struct {
	Name        string `json:"name"`
	Description string `json:"description"`
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
	var req createListRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "invalid json body")
		return
	}
	req.Name = strings.TrimSpace(req.Name)
	req.Description = strings.TrimSpace(req.Description)
	if req.Name == "" {
		httpx.WriteError(w, http.StatusBadRequest, "name required")
		return
	}
	out, err := h.repo.Create(r.Context(), userID, req.Name, req.Description)
	if err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, "failed to create list")
		return
	}
	httpx.WriteJSON(w, http.StatusCreated, out)
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
	out, err := h.repo.List(r.Context(), userID)
	if err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, "failed to list lists")
		return
	}
	httpx.WriteJSON(w, http.StatusOK, out)
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
	listID := strings.TrimSpace(chi.URLParam(r, "id"))
	if listID == "" {
		httpx.WriteError(w, http.StatusBadRequest, "id required")
		return
	}
	out, err := h.repo.Get(r.Context(), userID, listID)
	if err != nil {
		httpx.WriteError(w, http.StatusNotFound, "not found")
		return
	}
	httpx.WriteJSON(w, http.StatusOK, out)
}

type addItemRequest struct {
	ProblemID string `json:"problem_id"`
}

func (h *Handler) AddItem(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		httpx.WriteError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	userID, ok := reqctx.UserIDFromContext(r.Context())
	if !ok {
		httpx.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	listID := strings.TrimSpace(chi.URLParam(r, "id"))
	if listID == "" {
		httpx.WriteError(w, http.StatusBadRequest, "id required")
		return
	}
	var req addItemRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "invalid json body")
		return
	}
	req.ProblemID = strings.TrimSpace(req.ProblemID)
	if req.ProblemID == "" {
		httpx.WriteError(w, http.StatusBadRequest, "problem_id required")
		return
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
	dueAt := scheduler.DueAtToday(time.Now().UTC(), loc, settings.DueHourLocal, settings.DueMinuteLocal)

	ctx := r.Context()
	tx, err := h.pool.Begin(ctx)
	if err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, "failed to start transaction")
		return
	}
	defer func() { _ = tx.Rollback(ctx) }()

	// Ensure ownership.
	var one int
	if err := tx.QueryRow(ctx, `SELECT 1 FROM lists WHERE id = $1 AND owner_user_id = $2`, listID, userID).Scan(&one); err != nil {
		httpx.WriteError(w, http.StatusNotFound, "not found")
		return
	}

	// Ensure user state exists (in case this problem was referenced without being in the library yet).
	if err := h.problems.EnsureUserStateTx(ctx, tx, userID, req.ProblemID, dueAt); err != nil {
		// Keep responses actionable when local DB/migrations drift.
		if pgErr, ok := err.(*pgconn.PgError); ok && pgErr.Code == "42P01" {
			httpx.WriteError(w, http.StatusInternalServerError, "db not migrated (run migrations)")
			return
		}
		httpx.WriteError(w, http.StatusBadRequest, "invalid problem_id")
		return
	}
	nextIdx, err := h.repo.NextOrderIndexTx(ctx, tx, listID)
	if err != nil {
		if pgErr, ok := err.(*pgconn.PgError); ok && pgErr.Code == "42P01" {
			httpx.WriteError(w, http.StatusInternalServerError, "db not migrated (run migrations)")
			return
		}
		httpx.WriteError(w, http.StatusInternalServerError, "failed to compute order_index")
		return
	}
	if err := h.repo.AddItemTx(ctx, tx, listID, req.ProblemID, nextIdx); err != nil {
		if pgErr, ok := err.(*pgconn.PgError); ok && pgErr.Code == "42P01" {
			httpx.WriteError(w, http.StatusInternalServerError, "db not migrated (run migrations)")
			return
		}
		httpx.WriteError(w, http.StatusInternalServerError, "failed to add item")
		return
	}
	if err := tx.Commit(ctx); err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, "failed to commit")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

type reorderRequest struct {
	ProblemIDs []string `json:"problem_ids"`
}

func (h *Handler) Reorder(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPatch {
		httpx.WriteError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	userID, ok := reqctx.UserIDFromContext(r.Context())
	if !ok {
		httpx.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	listID := strings.TrimSpace(chi.URLParam(r, "id"))
	if listID == "" {
		httpx.WriteError(w, http.StatusBadRequest, "id required")
		return
	}
	var req reorderRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "invalid json body")
		return
	}
	if req.ProblemIDs == nil {
		req.ProblemIDs = []string{}
	}
	for i := range req.ProblemIDs {
		req.ProblemIDs[i] = strings.TrimSpace(req.ProblemIDs[i])
	}
	if err := h.repo.Reorder(r.Context(), userID, listID, req.ProblemIDs); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "failed to reorder")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

type importRequest struct {
	TemplateKey string `json:"template_key"`
	Version     string `json:"version"`
}

func (h *Handler) Import(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		httpx.WriteError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	userID, ok := reqctx.UserIDFromContext(r.Context())
	if !ok {
		httpx.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	var req importRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "invalid json body")
		return
	}
	req.TemplateKey = strings.TrimSpace(strings.ToLower(req.TemplateKey))
	req.Version = strings.TrimSpace(strings.ToLower(req.Version))
	if req.TemplateKey == "" || req.Version == "" {
		httpx.WriteError(w, http.StatusBadRequest, "template_key and version required")
		return
	}

	items, err := templates.Load(req.TemplateKey, req.Version)
	if err != nil {
		httpx.WriteError(w, http.StatusNotFound, "template not found")
		return
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
	dueAt := scheduler.DueAtToday(time.Now().UTC(), loc, settings.DueHourLocal, settings.DueMinuteLocal)

	ctx := r.Context()
	tx, err := h.pool.Begin(ctx)
	if err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, "failed to start transaction")
		return
	}
	defer func() { _ = tx.Rollback(ctx) }()

	name := strings.ToUpper(req.TemplateKey[:1]) + req.TemplateKey[1:]
	switch req.TemplateKey {
	case "blind75":
		name = "Blind 75"
	case "neetcode150":
		name = "NeetCode 150"
	}
	list, err := h.repo.CreateTemplateSnapshotTx(ctx, tx, userID, name, req.TemplateKey, req.Version)
	if err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, "failed to create list")
		return
	}

	for idx, it := range items {
		p, err := h.problems.CreateOrGetTx(ctx, tx, problems.Problem{
			URL:        it.URL,
			Title:      it.Title,
			Platform:   it.Platform,
			Difficulty: it.Difficulty,
			Topics:     it.Topics,
		})
		if err != nil {
			httpx.WriteError(w, http.StatusInternalServerError, "failed to upsert problem")
			return
		}
		if err := h.problems.EnsureUserStateTx(ctx, tx, userID, p.ID, dueAt); err != nil {
			httpx.WriteError(w, http.StatusInternalServerError, "failed to init problem state")
			return
		}
		if err := h.repo.AddItemTx(ctx, tx, list.ID, p.ID, idx); err != nil {
			httpx.WriteError(w, http.StatusInternalServerError, "failed to add list item")
			return
		}
	}

	if err := tx.Commit(ctx); err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, "failed to commit")
		return
	}

	out, _ := h.repo.Get(r.Context(), userID, list.ID)
	httpx.WriteJSON(w, http.StatusCreated, out)
}
