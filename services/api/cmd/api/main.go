package main

import (
	"context"
	"log"
	"net/http"
	"os/signal"
	"syscall"
	"time"
	_ "time/tzdata"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/md-rashed-zaman/PrepTracker/services/api/internal/auth"
	"github.com/md-rashed-zaman/PrepTracker/services/api/internal/calendar"
	"github.com/md-rashed-zaman/PrepTracker/services/api/internal/config"
	"github.com/md-rashed-zaman/PrepTracker/services/api/internal/contests"
	"github.com/md-rashed-zaman/PrepTracker/services/api/internal/db"
	"github.com/md-rashed-zaman/PrepTracker/services/api/internal/docs"
	"github.com/md-rashed-zaman/PrepTracker/services/api/internal/lists"
	"github.com/md-rashed-zaman/PrepTracker/services/api/internal/notes"
	"github.com/md-rashed-zaman/PrepTracker/services/api/internal/problems"
	"github.com/md-rashed-zaman/PrepTracker/services/api/internal/reviews"
	"github.com/md-rashed-zaman/PrepTracker/services/api/internal/stats"
	"github.com/md-rashed-zaman/PrepTracker/services/api/internal/users"
)

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	port := config.String("PORT", "8080")
	dbURL, err := config.RequiredString("DATABASE_URL")
	if err != nil {
		log.Fatal(err)
	}
	jwtSecret := config.String("JWT_SECRET", "dev-secret")
	refreshHours := config.Int("REFRESH_TTL_HOURS", 24*30)
	icsBaseURL := config.String("ICS_BASE_URL", "")
	openAPISpecPath := config.String("OPENAPI_SPEC_PATH", "")

	pool, err := db.Open(ctx, dbURL)
	if err != nil {
		log.Fatalf("db open: %v", err)
	}
	defer pool.Close()

	userRepo := users.NewRepository(pool)
	refreshRepo := auth.NewRefreshRepo(pool)
	j := auth.NewJWT(jwtSecret, 1*time.Hour)

	authHandler := auth.NewHandler(userRepo, j, refreshRepo, time.Duration(refreshHours)*time.Hour)
	problemsRepo := problems.NewRepository(pool)
	problemsHandler := problems.NewHandler(problemsRepo, userRepo)
	reviewsHandler := reviews.NewHandler(pool, userRepo, problemsRepo)
	usersHandler := users.NewHandler(userRepo)

	notesRepo := notes.NewRepository(pool)
	notesHandler := notes.NewHandler(notesRepo)

	listsRepo := lists.NewRepository(pool)
	listsHandler := lists.NewHandler(pool, listsRepo, problemsRepo, userRepo)

	contestsRepo := contests.NewRepository(pool)
	contestsHandler := contests.NewHandler(pool, contestsRepo, problemsRepo, userRepo)

	statsHandler := stats.NewHandler(pool, userRepo)

	tokenRepo := calendar.NewTokenRepo(pool)
	calendarHandler := calendar.NewHandler(tokenRepo, userRepo, icsBaseURL)
	docsHandler := docs.NewHandler(openAPISpecPath)

	r := chi.NewRouter()
	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP)
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Use(middleware.Timeout(30 * time.Second))

	r.Get("/healthz", func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusNoContent) })
	r.Get("/readyz", func(w http.ResponseWriter, r *http.Request) {
		if err := db.Ready(r.Context(), pool); err != nil {
			http.Error(w, "not ready", http.StatusServiceUnavailable)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	})
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
			r.Get("/ics", calendarHandler.ICS) // public via token query param
			r.With(auth.RequireAuth(j)).Post("/ics/rotate", calendarHandler.RotateToken)
		})

		r.Group(func(r chi.Router) {
			r.Use(auth.RequireAuth(j))
			r.Patch("/users/me/settings", usersHandler.PatchMeSettings)
			r.Route("/problems", func(r chi.Router) {
				r.Post("/", problemsHandler.Create)
				r.Get("/", problemsHandler.List)
				r.Patch("/{id}", problemsHandler.Patch)
				r.Get("/{id}/notes", notesHandler.Get)
				r.Put("/{id}/notes", notesHandler.Put)
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
				r.Get("/contests", statsHandler.Contests)
			})
		})
	})

	srv := &http.Server{
		Addr:              ":" + port,
		Handler:           r,
		ReadHeaderTimeout: 5 * time.Second,
	}

	go func() {
		log.Printf("api listening on %s", srv.Addr)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("listen: %v", err)
		}
	}()

	<-ctx.Done()
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	_ = srv.Shutdown(shutdownCtx)
}
