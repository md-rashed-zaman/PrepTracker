# Phase 01: Foundation (0.5-1 day)

Goal: set up repo structure, local dev, and basic CI so later phases are fast.

## Deliverables
- Repo layout created (recommended):
  - `apps/web` (Next.js)
  - `services/api` (Go REST API)
  - `services/auth-service` (optional; only if you choose split-services)
  - `libs/` (shared packages if needed)
  - `deploy/compose` (Postgres, optional admin tools)
  - `docs/` (plans, runbooks)
- Local dev:
  - `docker compose up` starts Postgres
  - `make dev` (or equivalent) starts backend + frontend
- Database migrations wired (golang-migrate or atlas)
- Basic checks:
  - Go fmt/lint (or `go test ./...` minimum)
  - Frontend typecheck/build (or minimal lint)

## Notes
- Do not implement domain features in this phase; optimize for repeatable dev workflows.

## Exit criteria
- New developer can run backend + frontend + migrations in < 10 minutes.

