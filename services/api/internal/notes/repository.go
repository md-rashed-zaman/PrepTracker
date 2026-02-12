package notes

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/md-rashed-zaman/PrepTracker/services/api/internal/db"
)

type Note struct {
	UserID      string          `json:"-"`
	ProblemID   string          `json:"problem_id"`
	ContentMD   string          `json:"content_md"`
	ContentJSON json.RawMessage `json:"content_json"`
	CreatedAt   time.Time       `json:"created_at"`
	UpdatedAt   time.Time       `json:"updated_at"`
}

type Repository struct {
	pool *pgxpool.Pool
}

func NewRepository(pool *pgxpool.Pool) *Repository {
	return &Repository{pool: pool}
}

func (r *Repository) Get(ctx context.Context, userID string, problemID string) (Note, error) {
	var n Note
	err := r.pool.QueryRow(ctx, `
		SELECT user_id::text, problem_id::text, content_md, content_json, created_at, updated_at
		FROM problem_notes
		WHERE user_id = $1 AND problem_id = $2
	`, userID, problemID).Scan(&n.UserID, &n.ProblemID, &n.ContentMD, &n.ContentJSON, &n.CreatedAt, &n.UpdatedAt)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return Note{}, db.ErrNotFound
		}
		return Note{}, err
	}
	return n, nil
}

func (r *Repository) Upsert(ctx context.Context, userID string, problemID string, md string, content json.RawMessage) (Note, error) {
	var n Note
	err := r.pool.QueryRow(ctx, `
		INSERT INTO problem_notes (user_id, problem_id, content_md, content_json)
		VALUES ($1, $2, $3, $4)
		ON CONFLICT (user_id, problem_id) DO UPDATE
		SET content_md = EXCLUDED.content_md,
		    content_json = EXCLUDED.content_json,
		    updated_at = now()
		RETURNING user_id::text, problem_id::text, content_md, content_json, created_at, updated_at
	`, userID, problemID, md, content).Scan(&n.UserID, &n.ProblemID, &n.ContentMD, &n.ContentJSON, &n.CreatedAt, &n.UpdatedAt)
	if err != nil {
		return Note{}, err
	}
	return n, nil
}

