# Phase 02: Auth + Users (1-2 days)

Goal: users can sign up/log in, and all API calls are scoped to a user id.

## Scope
- Auth endpoints:
  - `POST /api/v1/auth/register`
  - `POST /api/v1/auth/login`
  - `POST /api/v1/auth/refresh`
  - `POST /api/v1/auth/logout`
  - `GET /api/v1/auth/me`
- JWT middleware for protected endpoints.
- User settings:
  - timezone (IANA string, default e.g. `America/New_York`)
  - `min_interval_days` (default 1)

## Reuse from ApptRemind
- Use `/mnt/VaultD/Projects/ApptRemind/services/auth-service` as reference for:
  - bcrypt password hashing
  - refresh token storage (hashed)
  - endpoint shapes + error handling

Recommended simplifications for PrepFlow:
- Remove: `business_id`, staff roles, Kafka/outbox publishing, audit endpoint (unless you want it).
- Keep: `users`, `refresh_tokens` tables (or equivalents).

## Data model
- Auth-owned tables (either in same DB or separate auth DB):
  - `users(id, email, password_hash, created_at, ...)`
  - `refresh_tokens(id, user_id, token_hash, expires_at, revoked_at, created_at)`
- App-owned table:
  - `user_settings(user_id pk, timezone, min_interval_days, created_at, updated_at)`

## Frontend deliverables
- Pages:
  - `/auth/register`
  - `/auth/login`
  - `/auth/logout`
- Minimal auth state:
  - store access token
  - auto-refresh flow
  - route guard for app pages

## Testing
- Backend unit tests:
  - password hashing + verification
  - refresh token lifecycle (issue, revoke, expire)
- Minimal integration test:
  - register -> login -> me works end-to-end against a test DB.

## Exit criteria
- A user can register and reach a protected “Today” page placeholder.
- Every domain query is scoped by `user_id` from JWT claims.

