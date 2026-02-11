package contests

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/md-rashed-zaman/PrepTracker/services/api/internal/db"
	"github.com/md-rashed-zaman/PrepTracker/services/api/internal/problems"
)

type Contest struct {
	ID              string     `json:"id"`
	UserID          string     `json:"user_id"`
	DurationMinutes int        `json:"duration_minutes"`
	Strategy        string     `json:"strategy"`
	CreatedAt       time.Time  `json:"created_at"`
	StartedAt       *time.Time `json:"started_at,omitempty"`
	CompletedAt     *time.Time `json:"completed_at,omitempty"`
}

type ContestItem struct {
	Problem       problems.Problem `json:"problem"`
	OrderIndex    int              `json:"order_index"`
	TargetMinutes int              `json:"target_minutes"`
	Result        *ContestResult   `json:"result,omitempty"`
}

type ContestWithItems struct {
	Contest
	Items []ContestItem `json:"items"`
}

type ContestResult struct {
	Grade        *int       `json:"grade,omitempty"`
	TimeSpentSec *int       `json:"time_spent_sec,omitempty"`
	SolvedFlag   *bool      `json:"solved_flag,omitempty"`
	RecordedAt   *time.Time `json:"recorded_at,omitempty"`
}

type Repository struct {
	pool *pgxpool.Pool
}

func NewRepository(pool *pgxpool.Pool) *Repository { return &Repository{pool: pool} }

func (r *Repository) CreateTx(ctx context.Context, tx pgx.Tx, userID string, durationMinutes int, strategy string) (Contest, error) {
	var out Contest
	err := tx.QueryRow(ctx, `
		INSERT INTO contests (user_id, duration_minutes, strategy)
		VALUES ($1, $2, $3)
		RETURNING id::text, user_id::text, duration_minutes, strategy, created_at, started_at, completed_at
	`, userID, durationMinutes, strategy).Scan(
		&out.ID, &out.UserID, &out.DurationMinutes, &out.Strategy, &out.CreatedAt, &out.StartedAt, &out.CompletedAt,
	)
	return out, err
}

func (r *Repository) AddItemTx(ctx context.Context, tx pgx.Tx, contestID string, problemID string, orderIndex int, targetMinutes int) error {
	_, err := tx.Exec(ctx, `
		INSERT INTO contest_items (contest_id, problem_id, order_index, target_minutes)
		VALUES ($1, $2, $3, $4)
		ON CONFLICT (contest_id, problem_id) DO UPDATE
		SET order_index = EXCLUDED.order_index,
		    target_minutes = EXCLUDED.target_minutes
	`, contestID, problemID, orderIndex, targetMinutes)
	return err
}

func (r *Repository) EnsureOwnership(ctx context.Context, contestID string, userID string) error {
	var one int
	err := r.pool.QueryRow(ctx, `SELECT 1 FROM contests WHERE id = $1 AND user_id = $2`, contestID, userID).Scan(&one)
	if err != nil {
		return db.ErrNotFound
	}
	return nil
}

func (r *Repository) Start(ctx context.Context, contestID string, userID string) (Contest, error) {
	if err := r.EnsureOwnership(ctx, contestID, userID); err != nil {
		return Contest{}, err
	}
	_, err := r.pool.Exec(ctx, `UPDATE contests SET started_at = COALESCE(started_at, now()) WHERE id = $1 AND user_id = $2`, contestID, userID)
	if err != nil {
		return Contest{}, err
	}
	return r.Get(ctx, contestID, userID)
}

func (r *Repository) Complete(ctx context.Context, contestID string, userID string) (Contest, error) {
	if err := r.EnsureOwnership(ctx, contestID, userID); err != nil {
		return Contest{}, err
	}
	_, err := r.pool.Exec(ctx, `UPDATE contests SET completed_at = COALESCE(completed_at, now()) WHERE id = $1 AND user_id = $2`, contestID, userID)
	if err != nil {
		return Contest{}, err
	}
	return r.Get(ctx, contestID, userID)
}

func (r *Repository) Get(ctx context.Context, contestID string, userID string) (Contest, error) {
	var out Contest
	err := r.pool.QueryRow(ctx, `
		SELECT id::text, user_id::text, duration_minutes, strategy, created_at, started_at, completed_at
		FROM contests
		WHERE id = $1 AND user_id = $2
	`, contestID, userID).Scan(
		&out.ID, &out.UserID, &out.DurationMinutes, &out.Strategy, &out.CreatedAt, &out.StartedAt, &out.CompletedAt,
	)
	if err != nil {
		return Contest{}, db.ErrNotFound
	}
	return out, nil
}

func (r *Repository) GetWithItems(ctx context.Context, contestID string, userID string) (ContestWithItems, error) {
	c, err := r.Get(ctx, contestID, userID)
	if err != nil {
		return ContestWithItems{}, err
	}
	rows, err := r.pool.Query(ctx, `
		SELECT ci.order_index, ci.target_minutes,
		       p.id::text, p.url, p.platform, p.title, p.difficulty, p.topics,
		       cr.grade, cr.time_spent_sec, cr.solved_flag, cr.recorded_at
		FROM contest_items ci
		JOIN problems p ON p.id = ci.problem_id
		LEFT JOIN contest_results cr ON cr.contest_id = ci.contest_id AND cr.problem_id = ci.problem_id
		WHERE ci.contest_id = $1
		ORDER BY ci.order_index ASC
	`, contestID)
	if err != nil {
		return ContestWithItems{}, err
	}
	defer rows.Close()
	out := ContestWithItems{Contest: c, Items: make([]ContestItem, 0)}
	for rows.Next() {
		var it ContestItem
		var grade *int
		var timeSpentSec *int
		var solvedFlag *bool
		var recordedAt *time.Time
		if err := rows.Scan(
			&it.OrderIndex, &it.TargetMinutes,
			&it.Problem.ID, &it.Problem.URL, &it.Problem.Platform, &it.Problem.Title, &it.Problem.Difficulty, &it.Problem.Topics,
			&grade, &timeSpentSec, &solvedFlag, &recordedAt,
		); err != nil {
			return ContestWithItems{}, err
		}
		if grade != nil || timeSpentSec != nil || solvedFlag != nil || recordedAt != nil {
			it.Result = &ContestResult{Grade: grade, TimeSpentSec: timeSpentSec, SolvedFlag: solvedFlag, RecordedAt: recordedAt}
		}
		out.Items = append(out.Items, it)
	}
	return out, nil
}

type ResultInput struct {
	ContestID     string
	ProblemID     string
	Grade         *int
	TimeSpentSec  *int
	SolvedFlag    *bool
	RecordedAtUTC time.Time
}

func (r *Repository) UpsertResultTx(ctx context.Context, tx pgx.Tx, in ResultInput) error {
	_, err := tx.Exec(ctx, `
		INSERT INTO contest_results (contest_id, problem_id, grade, time_spent_sec, solved_flag, recorded_at)
		VALUES ($1, $2, $3, $4, $5, $6)
		ON CONFLICT (contest_id, problem_id) DO UPDATE
		SET grade = EXCLUDED.grade,
		    time_spent_sec = EXCLUDED.time_spent_sec,
		    solved_flag = EXCLUDED.solved_flag,
		    recorded_at = EXCLUDED.recorded_at
	`, in.ContestID, in.ProblemID, in.Grade, in.TimeSpentSec, in.SolvedFlag, in.RecordedAtUTC)
	return err
}

func (r *Repository) InsertReviewLogTx(ctx context.Context, tx pgx.Tx, userID string, contestID string, problemID string, reviewedAtUTC time.Time, grade int, timeSpentSec *int) error {
	// Avoid duplicating contest-driven review logs if results are resubmitted.
	var one int
	if err := tx.QueryRow(ctx, `
		SELECT 1
		FROM review_logs
		WHERE user_id = $1 AND contest_id = $2 AND problem_id = $3
		LIMIT 1
	`, userID, contestID, problemID).Scan(&one); err == nil {
		return nil
	} else if !errors.Is(err, pgx.ErrNoRows) {
		return err
	}
	_, err := tx.Exec(ctx, `
		INSERT INTO review_logs (user_id, problem_id, reviewed_at, grade, time_spent_sec, source, contest_id)
		VALUES ($1, $2, $3, $4, $5, 'contest', $6)
	`, userID, problemID, reviewedAtUTC, grade, timeSpentSec, contestID)
	return err
}

func (r *Repository) IsNotFound(err error) bool { return errors.Is(err, db.ErrNotFound) }
