package stats

import (
	"net/http"
	"strconv"
	"time"

	"github.com/md-rashed-zaman/PrepTracker/services/api/internal/httpx"
	"github.com/md-rashed-zaman/PrepTracker/services/api/internal/reqctx"
	"github.com/md-rashed-zaman/PrepTracker/services/api/internal/scheduler"
)

type ContestStatsTotals struct {
	ContestsFinished int      `json:"contests_finished"`
	ProblemsRecorded int      `json:"problems_recorded"`
	SolvedCount      int      `json:"solved_count"`
	AvgGrade         *float64 `json:"avg_grade,omitempty"`
	TotalTimeSec     int      `json:"total_time_sec"`
}

type ContestStatsDay struct {
	Date            string   `json:"date"`
	ContestsFinished int     `json:"contests_finished"`
	ProblemsRecorded int     `json:"problems_recorded"`
	SolvedCount      int     `json:"solved_count"`
	AvgGrade         *float64 `json:"avg_grade,omitempty"`
	TotalTimeSec     int     `json:"total_time_sec"`
}

type ContestStatsRecent struct {
	ContestID        string     `json:"contest_id"`
	Strategy         string     `json:"strategy"`
	DurationMinutes  int        `json:"duration_minutes"`
	CreatedAt        time.Time  `json:"created_at"`
	StartedAt        *time.Time `json:"started_at,omitempty"`
	CompletedAt      *time.Time `json:"completed_at,omitempty"`
	TotalItems       int        `json:"total_items"`
	RecordedCount    int        `json:"recorded_count"`
	SolvedCount      int        `json:"solved_count"`
	AvgGrade         *float64   `json:"avg_grade,omitempty"`
	TotalTimeSec     int        `json:"total_time_sec"`
}

type ContestStatsResponse struct {
	WindowDays int               `json:"window_days"`
	Totals     ContestStatsTotals `json:"totals"`
	Days       []ContestStatsDay `json:"days"`
	Recent     []ContestStatsRecent `json:"recent"`
}

func parseWindowDays(r *http.Request) int {
	q := r.URL.Query().Get("window_days")
	if q == "" {
		return 30
	}
	n, err := strconv.Atoi(q)
	if err != nil {
		return 30
	}
	if n < 1 {
		return 1
	}
	if n > 180 {
		return 180
	}
	return n
}

func (h *Handler) Contests(w http.ResponseWriter, r *http.Request) {
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

	windowDays := parseWindowDays(r)
	nowUTC := time.Now().UTC()
	startTodayLocal := scheduler.AnchorLocalDay(nowUTC, loc, 0, 0)
	startWindowLocal := startTodayLocal.AddDate(0, 0, -(windowDays - 1))
	startWindowUTC := startWindowLocal.UTC()

	// Totals (results + finished contests).
	var totals ContestStatsTotals
	var avgGrade *float64
	err = h.pool.QueryRow(r.Context(), `
		SELECT
			COUNT(*) AS problems_recorded,
			COUNT(*) FILTER (WHERE cr.solved_flag = true) AS solved_count,
			AVG(cr.grade)::float8 AS avg_grade,
			COALESCE(SUM(cr.time_spent_sec), 0) AS total_time_sec
		FROM contest_results cr
		JOIN contests c ON c.id = cr.contest_id
		WHERE c.user_id = $1 AND cr.recorded_at >= $2
	`, userID, startWindowUTC).Scan(&totals.ProblemsRecorded, &totals.SolvedCount, &avgGrade, &totals.TotalTimeSec)
	if err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, "failed to load contest totals")
		return
	}
	totals.AvgGrade = avgGrade

	_ = h.pool.QueryRow(r.Context(), `
		SELECT COUNT(*)
		FROM contests
		WHERE user_id = $1 AND completed_at IS NOT NULL AND completed_at >= $2
	`, userID, startWindowUTC).Scan(&totals.ContestsFinished)

	// Day series: results.
	type resultsRow struct {
		key       string
		recorded  int
		solved    int
		avg       *float64
		totalTime int
	}
	resultsByDay := map[string]resultsRow{}
	rows, err := h.pool.Query(r.Context(), `
		SELECT
			(cr.recorded_at AT TIME ZONE $2)::date AS d,
			COUNT(*) AS problems_recorded,
			COUNT(*) FILTER (WHERE cr.solved_flag = true) AS solved_count,
			AVG(cr.grade)::float8 AS avg_grade,
			COALESCE(SUM(cr.time_spent_sec), 0) AS total_time_sec
		FROM contest_results cr
		JOIN contests c ON c.id = cr.contest_id
		WHERE c.user_id = $1 AND cr.recorded_at >= $3
		GROUP BY d
		ORDER BY d ASC
	`, userID, loc.String(), startWindowUTC)
	if err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, "failed to load contest daily series")
		return
	}
	for rows.Next() {
		var d time.Time
		var rr resultsRow
		if err := rows.Scan(&d, &rr.recorded, &rr.solved, &rr.avg, &rr.totalTime); err != nil {
			rows.Close()
			httpx.WriteError(w, http.StatusInternalServerError, "failed to parse contest daily series")
			return
		}
		rr.key = d.Format("2006-01-02")
		resultsByDay[rr.key] = rr
	}
	rows.Close()

	// Day series: finished contests.
	finishedByDay := map[string]int{}
	rows, err = h.pool.Query(r.Context(), `
		SELECT
			(completed_at AT TIME ZONE $2)::date AS d,
			COUNT(*) AS contests_finished
		FROM contests
		WHERE user_id = $1 AND completed_at IS NOT NULL AND completed_at >= $3
		GROUP BY d
		ORDER BY d ASC
	`, userID, loc.String(), startWindowUTC)
	if err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, "failed to load contest daily finished series")
		return
	}
	for rows.Next() {
		var d time.Time
		var n int
		if err := rows.Scan(&d, &n); err != nil {
			rows.Close()
			httpx.WriteError(w, http.StatusInternalServerError, "failed to parse contest daily finished series")
			return
		}
		finishedByDay[d.Format("2006-01-02")] = n
	}
	rows.Close()

	days := make([]ContestStatsDay, 0, windowDays)
	for i := 0; i < windowDays; i++ {
		dayLocal := startWindowLocal.AddDate(0, 0, i)
		key := dayLocal.Format("2006-01-02")
		rr, has := resultsByDay[key]
		days = append(days, ContestStatsDay{
			Date:             key,
			ContestsFinished: finishedByDay[key],
			ProblemsRecorded: func() int { if has { return rr.recorded }; return 0 }(),
			SolvedCount:      func() int { if has { return rr.solved }; return 0 }(),
			AvgGrade:         func() *float64 { if has { return rr.avg }; return nil }(),
			TotalTimeSec:     func() int { if has { return rr.totalTime }; return 0 }(),
		})
	}

	// Recent contests: last 12 completed, with aggregates.
	recent := make([]ContestStatsRecent, 0, 12)
	rows, err = h.pool.Query(r.Context(), `
		SELECT
			c.id::text, c.strategy, c.duration_minutes, c.created_at, c.started_at, c.completed_at,
			COALESCE(ci.total_items, 0) AS total_items,
			COALESCE(cr.recorded_count, 0) AS recorded_count,
			COALESCE(cr.solved_count, 0) AS solved_count,
			cr.avg_grade,
			COALESCE(cr.total_time_sec, 0) AS total_time_sec
		FROM contests c
		LEFT JOIN (
			SELECT contest_id, COUNT(*) AS total_items
			FROM contest_items
			GROUP BY contest_id
		) ci ON ci.contest_id = c.id
		LEFT JOIN (
			SELECT contest_id,
			       COUNT(*) AS recorded_count,
			       COUNT(*) FILTER (WHERE solved_flag = true) AS solved_count,
			       AVG(grade)::float8 AS avg_grade,
			       COALESCE(SUM(time_spent_sec), 0) AS total_time_sec
			FROM contest_results
			GROUP BY contest_id
		) cr ON cr.contest_id = c.id
		WHERE c.user_id = $1 AND c.completed_at IS NOT NULL
		ORDER BY c.completed_at DESC
		LIMIT 12
	`, userID)
	if err == nil {
		for rows.Next() {
			var rc ContestStatsRecent
			if err := rows.Scan(
				&rc.ContestID, &rc.Strategy, &rc.DurationMinutes, &rc.CreatedAt, &rc.StartedAt, &rc.CompletedAt,
				&rc.TotalItems, &rc.RecordedCount, &rc.SolvedCount, &rc.AvgGrade, &rc.TotalTimeSec,
			); err != nil {
				break
			}
			recent = append(recent, rc)
		}
		rows.Close()
	}

	httpx.WriteJSON(w, http.StatusOK, ContestStatsResponse{
		WindowDays: windowDays,
		Totals:     totals,
		Days:       days,
		Recent:     recent,
	})
}

