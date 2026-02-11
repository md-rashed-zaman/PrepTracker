package lists

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/md-rashed-zaman/PrepTracker/services/api/internal/db"
	"github.com/md-rashed-zaman/PrepTracker/services/api/internal/problems"
)

type List struct {
	ID          string    `json:"id"`
	Name        string    `json:"name"`
	Description string    `json:"description"`
	SourceType  string    `json:"source_type"`
	SourceKey   *string   `json:"source_key,omitempty"`
	Version     *string   `json:"version,omitempty"`
	CreatedAt   time.Time `json:"created_at"`
}

type Item struct {
	Problem problems.Problem `json:"problem"`
	Order   int              `json:"order_index"`
}

type ListWithItems struct {
	List
	Items []Item `json:"items"`
}

type Repository struct {
	pool *pgxpool.Pool
}

func NewRepository(pool *pgxpool.Pool) *Repository { return &Repository{pool: pool} }

func (r *Repository) Create(ctx context.Context, userID string, name string, description string) (List, error) {
	var out List
	err := r.pool.QueryRow(ctx, `
		INSERT INTO lists (owner_user_id, name, description, source_type)
		VALUES ($1, $2, $3, 'custom')
		RETURNING id::text, name, description, source_type, source_key, version, created_at
	`, userID, name, description).Scan(
		&out.ID, &out.Name, &out.Description, &out.SourceType, &out.SourceKey, &out.Version, &out.CreatedAt,
	)
	return out, err
}

func (r *Repository) CreateTemplateSnapshotTx(ctx context.Context, tx pgx.Tx, userID string, name string, sourceKey string, version string) (List, error) {
	var out List
	err := tx.QueryRow(ctx, `
		INSERT INTO lists (owner_user_id, name, description, source_type, source_key, version)
		VALUES ($1, $2, '', 'template', $3, $4)
		RETURNING id::text, name, description, source_type, source_key, version, created_at
	`, userID, name, sourceKey, version).Scan(
		&out.ID, &out.Name, &out.Description, &out.SourceType, &out.SourceKey, &out.Version, &out.CreatedAt,
	)
	return out, err
}

func (r *Repository) List(ctx context.Context, userID string) ([]List, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT id::text, name, description, source_type, source_key, version, created_at
		FROM lists
		WHERE owner_user_id = $1
		ORDER BY created_at DESC
	`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]List, 0)
	for rows.Next() {
		var l List
		if err := rows.Scan(&l.ID, &l.Name, &l.Description, &l.SourceType, &l.SourceKey, &l.Version, &l.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, l)
	}
	return out, nil
}

func (r *Repository) Get(ctx context.Context, userID string, listID string) (ListWithItems, error) {
	var out ListWithItems
	err := r.pool.QueryRow(ctx, `
		SELECT id::text, name, description, source_type, source_key, version, created_at
		FROM lists
		WHERE id = $1 AND owner_user_id = $2
	`, listID, userID).Scan(
		&out.ID, &out.Name, &out.Description, &out.SourceType, &out.SourceKey, &out.Version, &out.CreatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ListWithItems{}, db.ErrNotFound
		}
		return ListWithItems{}, err
	}

	rows, err := r.pool.Query(ctx, `
		SELECT li.order_index,
		       p.id::text, p.url, p.platform, p.title, p.difficulty, p.topics
		FROM list_items li
		JOIN problems p ON p.id = li.problem_id
		WHERE li.list_id = $1
		ORDER BY li.order_index ASC
	`, listID)
	if err != nil {
		return ListWithItems{}, err
	}
	defer rows.Close()
	out.Items = make([]Item, 0)
	for rows.Next() {
		var it Item
		if err := rows.Scan(&it.Order, &it.Problem.ID, &it.Problem.URL, &it.Problem.Platform, &it.Problem.Title, &it.Problem.Difficulty, &it.Problem.Topics); err != nil {
			return ListWithItems{}, err
		}
		out.Items = append(out.Items, it)
	}
	return out, nil
}

func (r *Repository) NextOrderIndexTx(ctx context.Context, tx pgx.Tx, listID string) (int, error) {
	var next int
	if err := tx.QueryRow(ctx, `SELECT COALESCE(MAX(order_index), -1) + 1 FROM list_items WHERE list_id = $1`, listID).Scan(&next); err != nil {
		return 0, err
	}
	return next, nil
}

func (r *Repository) AddItemTx(ctx context.Context, tx pgx.Tx, listID string, problemID string, orderIndex int) error {
	_, err := tx.Exec(ctx, `
		INSERT INTO list_items (list_id, problem_id, order_index)
		VALUES ($1, $2, $3)
		ON CONFLICT (list_id, problem_id) DO UPDATE
		SET order_index = EXCLUDED.order_index
	`, listID, problemID, orderIndex)
	return err
}

func (r *Repository) Reorder(ctx context.Context, userID string, listID string, orderedProblemIDs []string) error {
	// Verify ownership.
	var ok bool
	if err := r.pool.QueryRow(ctx, `SELECT true FROM lists WHERE id = $1 AND owner_user_id = $2`, listID, userID).Scan(&ok); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return db.ErrNotFound
		}
		return err
	}
	if len(orderedProblemIDs) == 0 {
		return nil
	}

	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	// Ensure the set matches existing items.
	var existing int
	if err := tx.QueryRow(ctx, `SELECT COUNT(*) FROM list_items WHERE list_id = $1`, listID).Scan(&existing); err != nil {
		return err
	}
	if existing != len(orderedProblemIDs) {
		return fmt.Errorf("reorder list size mismatch")
	}

	for idx, pid := range orderedProblemIDs {
		if _, err := tx.Exec(ctx, `
			UPDATE list_items
			SET order_index = $3
			WHERE list_id = $1 AND problem_id = $2
		`, listID, pid, idx); err != nil {
			return err
		}
	}

	if _, err := tx.Exec(ctx, `UPDATE lists SET updated_at = now() WHERE id = $1`, listID); err != nil {
		return err
	}

	return tx.Commit(ctx)
}

