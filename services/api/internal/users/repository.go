package users

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/md-rashed-zaman/PrepTracker/services/api/internal/db"
)

type User struct {
	ID           string
	Email        string
	PasswordHash string
	CreatedAt    string
}

type Settings struct {
	UserID          string
	Timezone        string
	MinIntervalDays int
	DueHourLocal    int
	DueMinuteLocal  int
}

type Repository struct {
	pool *pgxpool.Pool
}

func NewRepository(pool *pgxpool.Pool) *Repository {
	return &Repository{pool: pool}
}

func (r *Repository) Create(ctx context.Context, email string, passwordHash string, timezone string, minIntervalDays int) (string, error) {
	if timezone == "" {
		timezone = "America/New_York"
	}
	if minIntervalDays <= 0 {
		minIntervalDays = 1
	}
	dueHourLocal := 9
	dueMinuteLocal := 0
	var userID string
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return "", err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	err = tx.QueryRow(ctx, `
			INSERT INTO users (email, password_hash)
			VALUES ($1, $2)
			RETURNING id::text
		`, email, passwordHash).
		Scan(&userID)
	if err != nil {
		return "", err
	}
	_, err = tx.Exec(ctx, `
			INSERT INTO user_settings (user_id, timezone, min_interval_days, due_hour_local, due_minute_local)
			VALUES ($1, $2, $3, $4, $5)
		`, userID, timezone, minIntervalDays, dueHourLocal, dueMinuteLocal)
	if err != nil {
		return "", err
	}
	if err := tx.Commit(ctx); err != nil {
		return "", err
	}
	return userID, nil
}

func (r *Repository) GetByEmail(ctx context.Context, email string) (User, error) {
	var u User
	err := r.pool.QueryRow(ctx, `
		SELECT id::text, email, password_hash
		FROM users
		WHERE email = $1
	`, email).Scan(&u.ID, &u.Email, &u.PasswordHash)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return User{}, db.ErrNotFound
		}
		return User{}, err
	}
	return u, nil
}

func (r *Repository) GetSettings(ctx context.Context, userID string) (Settings, error) {
	var s Settings
	err := r.pool.QueryRow(ctx, `
		SELECT user_id::text, timezone, min_interval_days, due_hour_local, due_minute_local
		FROM user_settings
		WHERE user_id = $1
	`, userID).Scan(&s.UserID, &s.Timezone, &s.MinIntervalDays, &s.DueHourLocal, &s.DueMinuteLocal)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return Settings{}, db.ErrNotFound
		}
		return Settings{}, err
	}
	return s, nil
}

func (r *Repository) UpdateSettings(ctx context.Context, userID string, timezone *string, minIntervalDays *int, dueHourLocal *int, dueMinuteLocal *int) (Settings, error) {
	// Apply updates with validation in SQL layer (simple bounds).
	_, err := r.pool.Exec(ctx, `
		UPDATE user_settings
		SET timezone = COALESCE($2, timezone),
		    min_interval_days = COALESCE($3, min_interval_days),
		    due_hour_local = COALESCE($4, due_hour_local),
		    due_minute_local = COALESCE($5, due_minute_local),
		    updated_at = now()
		WHERE user_id = $1
	`, userID, timezone, minIntervalDays, dueHourLocal, dueMinuteLocal)
	if err != nil {
		return Settings{}, err
	}
	return r.GetSettings(ctx, userID)
}
