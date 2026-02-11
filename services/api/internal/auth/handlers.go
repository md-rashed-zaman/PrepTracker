package auth

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgconn"
	"github.com/md-rashed-zaman/PrepTracker/services/api/internal/httpx"
	"github.com/md-rashed-zaman/PrepTracker/services/api/internal/reqctx"
	"github.com/md-rashed-zaman/PrepTracker/services/api/internal/users"
)

type Handler struct {
	jwt        *JWT
	refreshTTL time.Duration
	users      *users.Repository
	refresh    *RefreshRepo
}

func NewHandler(userRepo *users.Repository, jwt *JWT, refresh *RefreshRepo, refreshTTL time.Duration) *Handler {
	return &Handler{
		jwt:        jwt,
		refreshTTL: refreshTTL,
		users:      userRepo,
		refresh:    refresh,
	}
}

type registerRequest struct {
	Email           string `json:"email"`
	Password        string `json:"password"`
	Timezone        string `json:"timezone"`
	MinIntervalDays int    `json:"min_interval_days"`
	DueHourLocal    *int   `json:"due_hour_local"`
	DueMinuteLocal  *int   `json:"due_minute_local"`
}

type loginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

type refreshRequest struct {
	RefreshToken string `json:"refresh_token"`
}

type logoutRequest struct {
	RefreshToken string `json:"refresh_token"`
}

type tokenResponse struct {
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
	TokenType    string `json:"token_type"`
}

func (h *Handler) Register(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		httpx.WriteError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	var req registerRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "invalid json body")
		return
	}
	req.Email = strings.TrimSpace(req.Email)
	req.Password = strings.TrimSpace(req.Password)
	if req.Email == "" || req.Password == "" {
		httpx.WriteError(w, http.StatusBadRequest, "email and password required")
		return
	}
	hash, err := HashPassword(req.Password)
	if err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, "failed to hash password")
		return
	}
	userID, err := h.users.Create(r.Context(), req.Email, hash, req.Timezone, req.MinIntervalDays)
	if err != nil {
		if pgErr, ok := err.(*pgconn.PgError); ok && pgErr.Code == "23505" {
			httpx.WriteError(w, http.StatusConflict, "email already registered")
			return
		}
		httpx.WriteError(w, http.StatusInternalServerError, "failed to create user")
		return
	}
	// Optional: set due time if provided.
	if req.DueHourLocal != nil || req.DueMinuteLocal != nil {
		var tz *string
		var minInt *int
		settings, _ := h.users.GetSettings(r.Context(), userID)
		hour := settings.DueHourLocal
		min := settings.DueMinuteLocal
		if req.DueHourLocal != nil {
			hour = *req.DueHourLocal
		}
		if req.DueMinuteLocal != nil {
			min = *req.DueMinuteLocal
		}
		if hour < 0 || hour > 23 || min < 0 || min > 59 {
			httpx.WriteError(w, http.StatusBadRequest, "due_hour_local must be 0..23 and due_minute_local must be 0..59")
			return
		}
		_, _ = h.users.UpdateSettings(r.Context(), userID, tz, minInt, &hour, &min)
	}
	resp, err := h.issueTokens(r.Context(), userID)
	if err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, "failed to issue tokens")
		return
	}
	httpx.WriteJSON(w, http.StatusCreated, resp)
}

func (h *Handler) Login(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		httpx.WriteError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	var req loginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "invalid json body")
		return
	}
	req.Email = strings.TrimSpace(req.Email)
	req.Password = strings.TrimSpace(req.Password)
	if req.Email == "" || req.Password == "" {
		httpx.WriteError(w, http.StatusBadRequest, "email and password required")
		return
	}
	u, err := h.users.GetByEmail(r.Context(), req.Email)
	if err != nil {
		httpx.WriteError(w, http.StatusUnauthorized, "invalid credentials")
		return
	}
	if err := VerifyPassword(u.PasswordHash, req.Password); err != nil {
		httpx.WriteError(w, http.StatusUnauthorized, "invalid credentials")
		return
	}
	resp, err := h.issueTokens(r.Context(), u.ID)
	if err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, "failed to issue tokens")
		return
	}
	httpx.WriteJSON(w, http.StatusOK, resp)
}

func (h *Handler) Refresh(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		httpx.WriteError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	var req refreshRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "invalid json body")
		return
	}
	req.RefreshToken = strings.TrimSpace(req.RefreshToken)
	if req.RefreshToken == "" {
		httpx.WriteError(w, http.StatusBadRequest, "refresh_token required")
		return
	}
	hash := HashToken(req.RefreshToken)
	record, err := h.refresh.GetByHash(r.Context(), hash)
	if err != nil || record.RevokedAt != nil || record.ExpiresAt.Before(time.Now()) {
		httpx.WriteError(w, http.StatusUnauthorized, "invalid refresh token")
		return
	}
	_ = h.refresh.Revoke(r.Context(), record.ID)
	resp, err := h.issueTokens(r.Context(), record.UserID)
	if err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, "failed to issue tokens")
		return
	}
	httpx.WriteJSON(w, http.StatusOK, resp)
}

func (h *Handler) Logout(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		httpx.WriteError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	var req logoutRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "invalid json body")
		return
	}
	req.RefreshToken = strings.TrimSpace(req.RefreshToken)
	if req.RefreshToken == "" {
		httpx.WriteError(w, http.StatusBadRequest, "refresh_token required")
		return
	}
	hash := HashToken(req.RefreshToken)
	record, err := h.refresh.GetByHash(r.Context(), hash)
	if err == nil && record.RevokedAt == nil {
		_ = h.refresh.Revoke(r.Context(), record.ID)
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) Me(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		httpx.WriteError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	userID, ok := reqctx.UserIDFromContext(r.Context())
	if !ok {
		httpx.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	settings, _ := h.users.GetSettings(r.Context(), userID)
	httpx.WriteJSON(w, http.StatusOK, map[string]any{
		"user_id":           userID,
		"timezone":          settings.Timezone,
		"min_interval_days": settings.MinIntervalDays,
		"due_hour_local":    settings.DueHourLocal,
		"due_minute_local":  settings.DueMinuteLocal,
	})
}

func (h *Handler) issueTokens(ctx context.Context, userID string) (tokenResponse, error) {
	access, _, err := h.jwt.Sign(userID)
	if err != nil {
		return tokenResponse{}, err
	}
	raw, err := NewRawToken()
	if err != nil {
		return tokenResponse{}, err
	}
	_, err = h.refresh.Create(ctx, userID, raw, time.Now().Add(h.refreshTTL))
	if err != nil {
		return tokenResponse{}, err
	}
	return tokenResponse{
		AccessToken:  access,
		RefreshToken: raw,
		TokenType:    "Bearer",
	}, nil
}
