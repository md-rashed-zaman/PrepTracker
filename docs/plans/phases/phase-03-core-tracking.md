# Phase 03: Core Tracking (2-4 days)

Goal: the full “daily review loop” works: add problem -> shows on Today when due -> log grade -> reschedules.

## Deliverables
- Problem CRUD (per user):
  - add by URL + metadata
  - edit metadata
  - archive/disable problem (stop appearing as due)
- Scheduler:
  - SM-2 + Policy A min interval (from `AGENTS.md`)
  - due calculation respects user timezone policy
- Review logging:
  - append-only `review_logs`
  - transactional update of `user_problem_state`

## APIs
- `POST /api/problems`
- `GET /api/problems`
- `PATCH /api/problems/:id`
- `GET /api/reviews/due`
- `POST /api/reviews`

## UI
- Today:
  - shows due/overdue problems
  - quick grade buttons 0-4
  - optional time spent
- Library:
  - list + filters
  - add problem dialog

## Tests
- Unit tests for SM-2 + Policy A example cases (table-driven).
- Integration test: posting a review inserts log + updates state in same transaction.

## Exit criteria
- Acceptance criteria Milestone 1 from `AGENTS.md` passes end-to-end.

