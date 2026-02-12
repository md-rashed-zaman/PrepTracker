package notes

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/md-rashed-zaman/PrepTracker/services/api/internal/db"
	"github.com/md-rashed-zaman/PrepTracker/services/api/internal/httpx"
	"github.com/md-rashed-zaman/PrepTracker/services/api/internal/reqctx"
)

type Handler struct {
	repo *Repository
}

func NewHandler(repo *Repository) *Handler {
	return &Handler{repo: repo}
}

type getResponse struct {
	Exists      bool            `json:"exists"`
	ProblemID   string          `json:"problem_id"`
	ContentMD   string          `json:"content_md"`
	ContentJSON json.RawMessage `json:"content_json"`
	UpdatedAt   *string         `json:"updated_at,omitempty"`
}

func defaultDoc() json.RawMessage {
	return json.RawMessage(`{"type":"doc","content":[{"type":"paragraph"}]}`)
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
	problemID := strings.TrimSpace(chi.URLParam(r, "id"))
	if problemID == "" {
		httpx.WriteError(w, http.StatusBadRequest, "id required")
		return
	}

	n, err := h.repo.Get(r.Context(), userID, problemID)
	if err != nil {
		if err == db.ErrNotFound {
			// Return an empty doc so the editor can always render.
			resp := getResponse{
				Exists:      false,
				ProblemID:   problemID,
				ContentMD:   "",
				ContentJSON: defaultDoc(),
			}
			httpx.WriteJSON(w, http.StatusOK, resp)
			return
		}
		httpx.WriteError(w, http.StatusInternalServerError, "failed to load notes")
		return
	}
	ts := n.UpdatedAt.UTC().Format(timeRFC3339Milli)
	httpx.WriteJSON(w, http.StatusOK, getResponse{
		Exists:      true,
		ProblemID:   n.ProblemID,
		ContentMD:   n.ContentMD,
		ContentJSON: n.ContentJSON,
		UpdatedAt:   &ts,
	})
}

const timeRFC3339Milli = "2006-01-02T15:04:05.000Z07:00"

type putRequest struct {
	ContentMD   string          `json:"content_md"`
	ContentJSON json.RawMessage `json:"content_json"`
}

type putResponse struct {
	ProblemID string  `json:"problem_id"`
	UpdatedAt string  `json:"updated_at"`
	Exists    bool    `json:"exists"`
	Bytes     int     `json:"bytes"`
}

func (h *Handler) Put(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPut {
		httpx.WriteError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	userID, ok := reqctx.UserIDFromContext(r.Context())
	if !ok {
		httpx.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	problemID := strings.TrimSpace(chi.URLParam(r, "id"))
	if problemID == "" {
		httpx.WriteError(w, http.StatusBadRequest, "id required")
		return
	}

	// Keep it reasonable; this is a note, not a file store.
	r.Body = http.MaxBytesReader(w, r.Body, 256*1024)
	var req putRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "invalid json body")
		return
	}
	if len(req.ContentJSON) == 0 {
		req.ContentJSON = defaultDoc()
	}

	n, err := h.repo.Upsert(r.Context(), userID, problemID, req.ContentMD, req.ContentJSON)
	if err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, "failed to save notes")
		return
	}

	httpx.WriteJSON(w, http.StatusOK, putResponse{
		ProblemID: n.ProblemID,
		UpdatedAt: n.UpdatedAt.UTC().Format(timeRFC3339Milli),
		Exists:    true,
		Bytes:     len(req.ContentMD) + len(req.ContentJSON),
	})
}
