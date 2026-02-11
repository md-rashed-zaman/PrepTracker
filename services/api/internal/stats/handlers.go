package stats

import (
	"context"
	"math"
	"net/http"
	"sort"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/md-rashed-zaman/PrepTracker/services/api/internal/httpx"
	"github.com/md-rashed-zaman/PrepTracker/services/api/internal/reqctx"
	"github.com/md-rashed-zaman/PrepTracker/services/api/internal/scheduler"
	"github.com/md-rashed-zaman/PrepTracker/services/api/internal/users"
)

type Handler struct {
	pool  *pgxpool.Pool
	users *users.Repository
}

func NewHandler(pool *pgxpool.Pool, usersRepo *users.Repository) *Handler {
	return &Handler{pool: pool, users: usersRepo}
}

type Overview struct {
	ActiveProblems    int `json:"active_problems"`
	OverdueCount      int `json:"overdue_count"`
	DueTodayCount     int `json:"due_today_count"`
	DueSoonCount      int `json:"due_soon_count"`
	ReviewsLast7Days  int `json:"reviews_last_7_days"`
	CurrentStreakDays int `json:"current_streak_days"`
}

func (h *Handler) Overview(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		httpx.WriteError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	userID, ok := reqctx.UserIDFromContext(r.Context())
	if !ok {
		httpx.WriteError(w, http.StatusUnauthorized, "unauthorized")
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
	now := time.Now().UTC()
	startTodayLocal := scheduler.AnchorLocalDay(now, loc, 0, 0)
	startTomorrowLocal := startTodayLocal.AddDate(0, 0, 1)
	startTodayUTC := startTodayLocal.UTC()
	startTomorrowUTC := startTomorrowLocal.UTC()
	dueSoonUTC := startTomorrowLocal.AddDate(0, 0, 3).UTC()

	var active, overdue, dueToday, dueSoon int
	err = h.pool.QueryRow(r.Context(), `
		SELECT
			COUNT(*) FILTER (WHERE is_active = true) AS active,
			COUNT(*) FILTER (WHERE is_active = true AND due_at < $2) AS overdue,
			COUNT(*) FILTER (WHERE is_active = true AND due_at >= $2 AND due_at < $3) AS due_today,
			COUNT(*) FILTER (WHERE is_active = true AND due_at >= $3 AND due_at < $4) AS due_soon
		FROM user_problem_state
		WHERE user_id = $1
	`, userID, startTodayUTC, startTomorrowUTC, dueSoonUTC).Scan(&active, &overdue, &dueToday, &dueSoon)
	if err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, "failed to load overview")
		return
	}

	var reviews7 int
	_ = h.pool.QueryRow(r.Context(), `
		SELECT COUNT(*)
		FROM review_logs
		WHERE user_id = $1 AND reviewed_at >= $2
	`, userID, now.Add(-7*24*time.Hour)).Scan(&reviews7)

	streak := h.currentStreakDays(r.Context(), userID, loc, now)

	httpx.WriteJSON(w, http.StatusOK, Overview{
		ActiveProblems:    active,
		OverdueCount:      overdue,
		DueTodayCount:     dueToday,
		DueSoonCount:      dueSoon,
		ReviewsLast7Days:  reviews7,
		CurrentStreakDays: streak,
	})
}

type TopicStat struct {
	Topic      string  `json:"topic"`
	Count      int     `json:"count"`
	MasteryAvg float64 `json:"mastery_avg"`
}

func (h *Handler) Topics(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		httpx.WriteError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	userID, ok := reqctx.UserIDFromContext(r.Context())
	if !ok {
		httpx.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	now := time.Now().UTC()

	rows, err := h.pool.Query(r.Context(), `
		SELECT p.topics, s.reps, s.ease, s.due_at
		FROM problems p
		JOIN user_problem_state s ON s.problem_id = p.id
		WHERE s.user_id = $1 AND s.is_active = true
	`, userID)
	if err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, "failed to load topics")
		return
	}
	defer rows.Close()

	type agg struct {
		sum float64
		n   int
	}
	byTopic := map[string]*agg{}

	for rows.Next() {
		var topics []string
		var reps int
		var ease float64
		var dueAt time.Time
		if err := rows.Scan(&topics, &reps, &ease, &dueAt); err != nil {
			httpx.WriteError(w, http.StatusInternalServerError, "failed to parse topics")
			return
		}
		od := 0
		if now.After(dueAt) {
			od = int(now.Sub(dueAt).Hours() / 24)
		}
		mastery := masteryScore(reps, ease, od)
		for _, t := range topics {
			t = strings.TrimSpace(strings.ToLower(t))
			if t == "" {
				continue
			}
			a := byTopic[t]
			if a == nil {
				a = &agg{}
				byTopic[t] = a
			}
			a.sum += mastery
			a.n++
		}
	}

	out := make([]TopicStat, 0, len(byTopic))
	for t, a := range byTopic {
		if a.n == 0 {
			continue
		}
		out = append(out, TopicStat{
			Topic:      t,
			Count:      a.n,
			MasteryAvg: math.Round((a.sum/float64(a.n))*10) / 10,
		})
	}
	sort.SliceStable(out, func(i, j int) bool {
		if out[i].MasteryAvg == out[j].MasteryAvg {
			return out[i].Topic < out[j].Topic
		}
		return out[i].MasteryAvg < out[j].MasteryAvg
	})
	httpx.WriteJSON(w, http.StatusOK, out)
}

type StreaksResponse struct {
	CurrentStreakDays int `json:"current_streak_days"`
}

func (h *Handler) Streaks(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		httpx.WriteError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	userID, ok := reqctx.UserIDFromContext(r.Context())
	if !ok {
		httpx.WriteError(w, http.StatusUnauthorized, "unauthorized")
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
	now := time.Now().UTC()
	httpx.WriteJSON(w, http.StatusOK, StreaksResponse{
		CurrentStreakDays: h.currentStreakDays(r.Context(), userID, loc, now),
	})
}

func (h *Handler) currentStreakDays(ctx context.Context, userID string, loc *time.Location, nowUTC time.Time) int {
	// Collect local dates with at least one review.
	start := nowUTC.Add(-90 * 24 * time.Hour)
	rows, err := h.pool.Query(ctx, `
		SELECT DISTINCT (reviewed_at AT TIME ZONE $2)::date AS d
		FROM review_logs
		WHERE user_id = $1 AND reviewed_at >= $3
		ORDER BY d DESC
	`, userID, loc.String(), start)
	if err != nil {
		return 0
	}
	defer rows.Close()
	set := map[string]struct{}{}
	for rows.Next() {
		var d time.Time
		if err := rows.Scan(&d); err != nil {
			continue
		}
		set[d.Format("2006-01-02")] = struct{}{}
	}

	todayLocal := nowUTC.In(loc)
	cur := time.Date(todayLocal.Year(), todayLocal.Month(), todayLocal.Day(), 0, 0, 0, 0, time.UTC)
	key := cur.Format("2006-01-02")
	if _, ok := set[key]; !ok {
		// If no reviews today, streak can still be ongoing if user reviewed yesterday.
		cur = cur.AddDate(0, 0, -1)
	}

	streak := 0
	for i := 0; i < 365; i++ {
		k := cur.Format("2006-01-02")
		if _, ok := set[k]; !ok {
			break
		}
		streak++
		cur = cur.AddDate(0, 0, -1)
	}
	return streak
}

func masteryScore(reps int, ease float64, overdueDays int) float64 {
	overduePenalty := float64(overdueDays * 2)
	if overduePenalty > 30 {
		overduePenalty = 30
	}
	m := 20*math.Log2(float64(reps)+1) + 25*(ease-1.3) - overduePenalty
	if m < 0 {
		return 0
	}
	if m > 100 {
		return 100
	}
	return m
}
