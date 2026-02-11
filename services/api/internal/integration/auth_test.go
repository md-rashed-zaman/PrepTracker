package integration

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/md-rashed-zaman/PrepTracker/services/api/internal/auth"
	"github.com/md-rashed-zaman/PrepTracker/services/api/internal/calendar"
	"github.com/md-rashed-zaman/PrepTracker/services/api/internal/contests"
	"github.com/md-rashed-zaman/PrepTracker/services/api/internal/docs"
	"github.com/md-rashed-zaman/PrepTracker/services/api/internal/lists"
	"github.com/md-rashed-zaman/PrepTracker/services/api/internal/problems"
	"github.com/md-rashed-zaman/PrepTracker/services/api/internal/reviews"
	"github.com/md-rashed-zaman/PrepTracker/services/api/internal/stats"
	"github.com/md-rashed-zaman/PrepTracker/services/api/internal/testutil"
	"github.com/md-rashed-zaman/PrepTracker/services/api/internal/users"
)

func TestAuthFlow(t *testing.T) {
	dbURL := testutil.RequireDBURL(t)
	testutil.MigrateUp(t, dbURL)
	pool := testutil.OpenPool(t, dbURL)
	testutil.ResetDB(t, pool)

	r := newTestRouter(pool)

	registerBody := map[string]any{
		"email":             "a@example.com",
		"password":          "pass1234",
		"timezone":          "America/New_York",
		"min_interval_days": 7,
	}
	regResp := doJSON(t, r, "POST", "/api/v1/auth/register", registerBody, "")
	if regResp.Code != http.StatusCreated {
		t.Fatalf("register status=%d body=%s", regResp.Code, regResp.Body.String())
	}
	var tokens map[string]any
	_ = json.Unmarshal(regResp.Body.Bytes(), &tokens)
	access := tokens["access_token"].(string)
	refresh := tokens["refresh_token"].(string)

	meResp := doJSON(t, r, "GET", "/api/v1/auth/me", nil, access)
	if meResp.Code != http.StatusOK {
		t.Fatalf("me status=%d body=%s", meResp.Code, meResp.Body.String())
	}

	refResp := doJSON(t, r, "POST", "/api/v1/auth/refresh", map[string]any{"refresh_token": refresh}, "")
	if refResp.Code != http.StatusOK {
		t.Fatalf("refresh status=%d body=%s", refResp.Code, refResp.Body.String())
	}
	var tokens2 map[string]any
	_ = json.Unmarshal(refResp.Body.Bytes(), &tokens2)
	newRefresh := tokens2["refresh_token"].(string)
	if newRefresh == refresh {
		t.Fatalf("expected refresh token rotation")
	}

	logoutResp := doJSON(t, r, "POST", "/api/v1/auth/logout", map[string]any{"refresh_token": newRefresh}, "")
	if logoutResp.Code != http.StatusNoContent {
		t.Fatalf("logout status=%d body=%s", logoutResp.Code, logoutResp.Body.String())
	}

	refResp2 := doJSON(t, r, "POST", "/api/v1/auth/refresh", map[string]any{"refresh_token": newRefresh}, "")
	if refResp2.Code != http.StatusUnauthorized {
		t.Fatalf("expected refresh to fail after logout, got %d body=%s", refResp2.Code, refResp2.Body.String())
	}
}

func newTestRouter(pool *pgxpool.Pool) http.Handler {
	userRepo := users.NewRepository(pool)
	refreshRepo := auth.NewRefreshRepo(pool)
	j := auth.NewJWT("test-secret", 1*time.Hour)
	authHandler := auth.NewHandler(userRepo, j, refreshRepo, 24*time.Hour)

	problemsRepo := problems.NewRepository(pool)
	problemsHandler := problems.NewHandler(problemsRepo, userRepo)
	reviewsHandler := reviews.NewHandler(pool, userRepo, problemsRepo)
	listsRepo := lists.NewRepository(pool)
	listsHandler := lists.NewHandler(pool, listsRepo, problemsRepo, userRepo)
	contestsRepo := contests.NewRepository(pool)
	contestsHandler := contests.NewHandler(pool, contestsRepo, problemsRepo, userRepo)
	statsHandler := stats.NewHandler(pool, userRepo)

	tokenRepo := calendar.NewTokenRepo(pool)
	calendarHandler := calendar.NewHandler(tokenRepo, userRepo, "")
	docsHandler := docs.NewHandler("")

	r := chi.NewRouter()
	r.Get("/openapi.yaml", docsHandler.OpenAPIYAML)
	r.Get("/docs", docsHandler.SwaggerUI)
	r.Route("/api/v1", func(r chi.Router) {
		r.Route("/auth", func(r chi.Router) {
			r.Post("/register", authHandler.Register)
			r.Post("/login", authHandler.Login)
			r.Post("/refresh", authHandler.Refresh)
			r.Post("/logout", authHandler.Logout)
			r.With(auth.RequireAuth(j)).Get("/me", authHandler.Me)
		})
		r.Route("/integrations/calendar", func(r chi.Router) {
			r.Get("/ics", calendarHandler.ICS)
			r.With(auth.RequireAuth(j)).Post("/ics/rotate", calendarHandler.RotateToken)
		})
		r.Group(func(r chi.Router) {
			r.Use(auth.RequireAuth(j))
			r.Patch("/users/me/settings", users.NewHandler(userRepo).PatchMeSettings)
			r.Route("/problems", func(r chi.Router) {
				r.Post("/", problemsHandler.Create)
				r.Get("/", problemsHandler.List)
				r.Patch("/{id}", problemsHandler.Patch)
			})
			r.Route("/reviews", func(r chi.Router) {
				r.Get("/due", reviewsHandler.Due)
				r.Post("/", reviewsHandler.Post)
			})
			r.Route("/lists", func(r chi.Router) {
				r.Post("/", listsHandler.Create)
				r.Get("/", listsHandler.List)
				r.Post("/import", listsHandler.Import)
				r.Get("/{id}", listsHandler.Get)
				r.Post("/{id}/items", listsHandler.AddItem)
				r.Patch("/{id}/items/reorder", listsHandler.Reorder)
			})
			r.Route("/contests", func(r chi.Router) {
				r.Post("/generate", contestsHandler.Generate)
				r.Get("/{id}", contestsHandler.Get)
				r.Post("/{id}/start", contestsHandler.Start)
				r.Post("/{id}/complete", contestsHandler.Complete)
				r.Post("/{id}/results", contestsHandler.SubmitResults)
			})
			r.Route("/stats", func(r chi.Router) {
				r.Get("/overview", statsHandler.Overview)
				r.Get("/topics", statsHandler.Topics)
				r.Get("/streaks", statsHandler.Streaks)
			})
		})
	})
	return r
}

// doJSON issues a request with optional Bearer token and returns httptest recorder.
func doJSON(t *testing.T, h http.Handler, method, path string, body any, bearer string) *httptest.ResponseRecorder {
	t.Helper()
	var buf []byte
	if body != nil {
		buf, _ = json.Marshal(body)
	}
	req := httptest.NewRequest(method, path, bytes.NewReader(buf))
	req.Header.Set("Content-Type", "application/json")
	if bearer != "" {
		req.Header.Set("Authorization", "Bearer "+bearer)
	}
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)
	return rr
}
