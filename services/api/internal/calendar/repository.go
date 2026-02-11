package calendar

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/md-rashed-zaman/PrepTracker/services/api/internal/db"
)

type TokenRepo struct {
	pool *pgxpool.Pool
}

func NewTokenRepo(pool *pgxpool.Pool) *TokenRepo {
	return &TokenRepo{pool: pool}
}

func newToken() (string, error) {
	buf := make([]byte, 32)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return hex.EncodeToString(buf), nil
}

func hashToken(raw string) string {
	sum := sha256.Sum256([]byte(raw))
	return hex.EncodeToString(sum[:])
}

func (r *TokenRepo) Rotate(ctx context.Context, userID string) (string, error) {
	raw, err := newToken()
	if err != nil {
		return "", err
	}
	h := hashToken(raw)
	_, err = r.pool.Exec(ctx, `
		INSERT INTO calendar_ics_tokens (user_id, token_hash, created_at, rotated_at)
		VALUES ($1, $2, now(), NULL)
		ON CONFLICT (user_id) DO UPDATE
		SET token_hash = EXCLUDED.token_hash,
		    rotated_at = now()
	`, userID, h)
	if err != nil {
		return "", err
	}
	return raw, nil
}

func (r *TokenRepo) UserIDByRawToken(ctx context.Context, raw string) (string, error) {
	h := hashToken(raw)
	var userID string
	err := r.pool.QueryRow(ctx, `
		SELECT user_id::text
		FROM calendar_ics_tokens
		WHERE token_hash = $1
	`, h).Scan(&userID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return "", db.ErrNotFound
		}
		return "", err
	}
	return userID, nil
}

func (r *TokenRepo) EnsureExists(ctx context.Context, userID string) (string, error) {
	// If a token exists, we cannot recover the raw value. Force rotate to return a usable URL.
	return r.Rotate(ctx, userID)
}

type DueProblem struct {
	ProblemID string
	Title     string
	URL       string
	DueAt     time.Time
}

func (r *TokenRepo) LoadDueWindow(ctx context.Context, userID string, until time.Time) ([]DueProblem, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT p.id::text, p.title, p.url, s.due_at
		FROM problems p
		JOIN user_problem_state s ON s.problem_id = p.id
		WHERE s.user_id = $1 AND s.is_active = true AND s.due_at <= $2
		ORDER BY s.due_at ASC
	`, userID, until)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []DueProblem
	for rows.Next() {
		var dp DueProblem
		if err := rows.Scan(&dp.ProblemID, &dp.Title, &dp.URL, &dp.DueAt); err != nil {
			return nil, err
		}
		out = append(out, dp)
	}
	return out, nil
}
