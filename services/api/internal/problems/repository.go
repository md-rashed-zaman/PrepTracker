package problems

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/md-rashed-zaman/PrepTracker/services/api/internal/db"
)

type Problem struct {
	ID         string   `json:"id"`
	Platform   string   `json:"platform"`
	URL        string   `json:"url"`
	Title      string   `json:"title"`
	Difficulty string   `json:"difficulty"`
	Topics     []string `json:"topics"`
}

type UserState struct {
	Reps         int        `json:"reps"`
	IntervalDays int        `json:"interval_days"`
	Ease         float64    `json:"ease"`
	DueAt        time.Time  `json:"due_at"`
	LastReviewAt *time.Time `json:"last_review_at,omitempty"`
	LastGrade    *int       `json:"last_grade,omitempty"`
	IsActive     bool       `json:"is_active"`
}

type ProblemWithState struct {
	Problem
	State UserState `json:"state"`
}

type Repository struct {
	pool *pgxpool.Pool
}

func NewRepository(pool *pgxpool.Pool) *Repository {
	return &Repository{pool: pool}
}

func (r *Repository) CreateOrGet(ctx context.Context, p Problem) (Problem, error) {
	p.URL = NormalizeURL(p.URL)
	if p.Difficulty == "" {
		p.Difficulty = "unknown"
	}
	if p.Platform == "" {
		p.Platform = ""
	}
	if p.Title == "" {
		p.Title = ""
	}
	if p.Topics == nil {
		p.Topics = []string{}
	}

	var out Problem
	err := r.pool.QueryRow(ctx, `
		INSERT INTO problems (platform, url, title, difficulty, topics)
		VALUES ($1, $2, $3, $4, $5)
		ON CONFLICT (url) DO UPDATE
		SET platform = EXCLUDED.platform,
		    title = CASE WHEN problems.title = '' THEN EXCLUDED.title ELSE problems.title END,
		    difficulty = CASE WHEN problems.difficulty = 'unknown' THEN EXCLUDED.difficulty ELSE problems.difficulty END,
		    topics = CASE WHEN array_length(problems.topics, 1) IS NULL THEN EXCLUDED.topics ELSE problems.topics END,
		    updated_at = now()
		RETURNING id::text, platform, url, title, difficulty, topics
	`, p.Platform, p.URL, p.Title, p.Difficulty, p.Topics).Scan(&out.ID, &out.Platform, &out.URL, &out.Title, &out.Difficulty, &out.Topics)
	if err != nil {
		return Problem{}, err
	}
	return out, nil
}

func (r *Repository) CreateOrGetTx(ctx context.Context, tx pgx.Tx, p Problem) (Problem, error) {
	p.URL = NormalizeURL(p.URL)
	if p.Difficulty == "" {
		p.Difficulty = "unknown"
	}
	if p.Platform == "" {
		p.Platform = ""
	}
	if p.Title == "" {
		p.Title = ""
	}
	if p.Topics == nil {
		p.Topics = []string{}
	}

	var out Problem
	err := tx.QueryRow(ctx, `
		INSERT INTO problems (platform, url, title, difficulty, topics)
		VALUES ($1, $2, $3, $4, $5)
		ON CONFLICT (url) DO UPDATE
		SET platform = EXCLUDED.platform,
		    title = CASE WHEN problems.title = '' THEN EXCLUDED.title ELSE problems.title END,
		    difficulty = CASE WHEN problems.difficulty = 'unknown' THEN EXCLUDED.difficulty ELSE problems.difficulty END,
		    topics = CASE WHEN array_length(problems.topics, 1) IS NULL THEN EXCLUDED.topics ELSE problems.topics END,
		    updated_at = now()
		RETURNING id::text, platform, url, title, difficulty, topics
	`, p.Platform, p.URL, p.Title, p.Difficulty, p.Topics).Scan(&out.ID, &out.Platform, &out.URL, &out.Title, &out.Difficulty, &out.Topics)
	if err != nil {
		return Problem{}, err
	}
	return out, nil
}

func (r *Repository) EnsureUserState(ctx context.Context, userID string, problemID string, dueAt time.Time) error {
	_, err := r.pool.Exec(ctx, `
		INSERT INTO user_problem_state (user_id, problem_id, reps, interval_days, ease, due_at, is_active)
		VALUES ($1, $2, 0, 1, 2.50, $3, true)
		ON CONFLICT (user_id, problem_id) DO UPDATE
		SET is_active = true,
		    due_at = LEAST(user_problem_state.due_at, EXCLUDED.due_at)
	`, userID, problemID, dueAt)
	return err
}

func (r *Repository) EnsureUserStateTx(ctx context.Context, tx pgx.Tx, userID string, problemID string, dueAt time.Time) error {
	_, err := tx.Exec(ctx, `
		INSERT INTO user_problem_state (user_id, problem_id, reps, interval_days, ease, due_at, is_active)
		VALUES ($1, $2, 0, 1, 2.50, $3, true)
		ON CONFLICT (user_id, problem_id) DO UPDATE
		SET is_active = true,
		    due_at = LEAST(user_problem_state.due_at, EXCLUDED.due_at)
	`, userID, problemID, dueAt)
	return err
}

func (r *Repository) SetActive(ctx context.Context, userID string, problemID string, active bool) error {
	ct, err := r.pool.Exec(ctx, `
		UPDATE user_problem_state
		SET is_active = $3
		WHERE user_id = $1 AND problem_id = $2
	`, userID, problemID, active)
	if err != nil {
		return err
	}
	if ct.RowsAffected() == 0 {
		return db.ErrNotFound
	}
	return nil
}

func (r *Repository) ListForUser(ctx context.Context, userID string) ([]ProblemWithState, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT p.id::text, p.platform, p.url, p.title, p.difficulty, p.topics,
		       s.reps, s.interval_days, s.ease, s.due_at, s.last_review_at, s.last_grade, s.is_active
		FROM problems p
		JOIN user_problem_state s ON s.problem_id = p.id
		WHERE s.user_id = $1
		ORDER BY s.due_at ASC
	`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]ProblemWithState, 0)
	for rows.Next() {
		var p ProblemWithState
		var lastReviewAt *time.Time
		var lastGrade *int
		err := rows.Scan(
			&p.ID, &p.Platform, &p.URL, &p.Title, &p.Difficulty, &p.Topics,
			&p.State.Reps, &p.State.IntervalDays, &p.State.Ease, &p.State.DueAt, &lastReviewAt, &lastGrade, &p.State.IsActive,
		)
		if err != nil {
			return nil, err
		}
		p.State.LastReviewAt = lastReviewAt
		p.State.LastGrade = lastGrade
		out = append(out, p)
	}
	return out, nil
}

type MetadataPatch struct {
	Platform   *string
	Title      *string
	Difficulty *string
	Topics     *[]string
}

func (r *Repository) PatchMetadataForUser(ctx context.Context, userID string, problemID string, patch MetadataPatch) (Problem, error) {
	var topics any = nil
	if patch.Topics != nil {
		topics = *patch.Topics
	}

	var out Problem
	err := r.pool.QueryRow(ctx, `
		UPDATE problems p
		SET platform = COALESCE($3, p.platform),
		    title = COALESCE($4, p.title),
		    difficulty = COALESCE($5, p.difficulty),
		    topics = CASE WHEN $6::text[] IS NULL THEN p.topics ELSE $6 END,
		    updated_at = now()
		FROM user_problem_state s
		WHERE s.user_id = $1 AND s.problem_id = $2 AND p.id = s.problem_id
		RETURNING p.id::text, p.platform, p.url, p.title, p.difficulty, p.topics
	`, userID, problemID, patch.Platform, patch.Title, patch.Difficulty, topics).Scan(
		&out.ID, &out.Platform, &out.URL, &out.Title, &out.Difficulty, &out.Topics,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return Problem{}, db.ErrNotFound
		}
		return Problem{}, err
	}
	return out, nil
}

func (r *Repository) GetStateForUpdate(ctx context.Context, tx pgx.Tx, userID string, problemID string) (UserState, error) {
	var s UserState
	var lastReviewAt *time.Time
	var lastGrade *int
	err := tx.QueryRow(ctx, `
		SELECT reps, interval_days, ease, due_at, last_review_at, last_grade, is_active
		FROM user_problem_state
		WHERE user_id = $1 AND problem_id = $2
		FOR UPDATE
	`, userID, problemID).Scan(&s.Reps, &s.IntervalDays, &s.Ease, &s.DueAt, &lastReviewAt, &lastGrade, &s.IsActive)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return UserState{}, db.ErrNotFound
		}
		return UserState{}, err
	}
	s.LastReviewAt = lastReviewAt
	s.LastGrade = lastGrade
	return s, nil
}

func (r *Repository) UpdateState(ctx context.Context, tx pgx.Tx, userID string, problemID string, s UserState) error {
	_, err := tx.Exec(ctx, `
		UPDATE user_problem_state
		SET reps = $3,
		    interval_days = $4,
		    ease = $5,
		    due_at = $6,
		    last_review_at = $7,
		    last_grade = $8
		WHERE user_id = $1 AND problem_id = $2
	`, userID, problemID, s.Reps, s.IntervalDays, s.Ease, s.DueAt, s.LastReviewAt, s.LastGrade)
	return err
}

func IsUniqueViolation(err error) bool {
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) && pgErr.Code == "23505" {
		return true
	}
	return false
}
