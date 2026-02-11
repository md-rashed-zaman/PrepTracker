package auth

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

var ErrInvalidRefresh = errors.New("invalid refresh token")

type RefreshToken struct {
	ID        string
	UserID    string
	ExpiresAt time.Time
	RevokedAt *time.Time
}

type RefreshRepo struct {
	pool *pgxpool.Pool
}

func NewRefreshRepo(pool *pgxpool.Pool) *RefreshRepo {
	return &RefreshRepo{pool: pool}
}

func HashToken(raw string) string {
	sum := sha256.Sum256([]byte(raw))
	return hex.EncodeToString(sum[:])
}

func NewRawToken() (string, error) {
	buf := make([]byte, 32)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return hex.EncodeToString(buf), nil
}

func (r *RefreshRepo) Create(ctx context.Context, userID string, raw string, expiresAt time.Time) (string, error) {
	var id string
	err := r.pool.QueryRow(ctx, `
		INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
		VALUES ($1, $2, $3)
		RETURNING id::text
	`, userID, HashToken(raw), expiresAt).Scan(&id)
	return id, err
}

func (r *RefreshRepo) GetByHash(ctx context.Context, tokenHash string) (RefreshToken, error) {
	var t RefreshToken
	err := r.pool.QueryRow(ctx, `
		SELECT id::text, user_id::text, expires_at, revoked_at
		FROM refresh_tokens
		WHERE token_hash = $1
		ORDER BY created_at DESC
		LIMIT 1
	`, tokenHash).Scan(&t.ID, &t.UserID, &t.ExpiresAt, &t.RevokedAt)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return RefreshToken{}, db.ErrNotFound
		}
		return RefreshToken{}, err
	}
	return t, nil
}

func (r *RefreshRepo) Revoke(ctx context.Context, id string) error {
	_, err := r.pool.Exec(ctx, `
		UPDATE refresh_tokens
		SET revoked_at = now()
		WHERE id = $1 AND revoked_at IS NULL
	`, id)
	return err
}
