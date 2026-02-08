# Phase 05: Contests (2-4 days)

Goal: generate a timed session from existing problems, record results, and count them as reviews.

## Deliverables
- Contest generator:
  - duration + strategy + difficulty mix
  - selection algorithm from `AGENTS.md` (priority scoring)
- Contest run flow:
  - start contest
  - show ordered problems + links + timer
  - submit results (bulk)
- Persist:
  - contest, contest_items, contest_results
  - create corresponding `review_logs` and update `user_problem_state`

## APIs
- `POST /api/contests/generate`
- `POST /api/contests/:id/start`
- `POST /api/contests/:id/complete`
- `POST /api/contests/:id/results`

## UI
- Contests:
  - generator form
  - active contest view (timer is client-side)
  - results submission form (fast entry)

## Tests
- Selection constraints test:
  - difficulty mix honored
  - topic strategy constraints do not fail closed (reasonable fallback behavior)
- Integration: contest results write logs + reschedule.

## Exit criteria
- Acceptance criteria Milestone 3 from `AGENTS.md` passes end-to-end.

