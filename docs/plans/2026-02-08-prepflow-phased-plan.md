# PrepFlow Phased Plan (2026-02-08)

This document translates `AGENTS.md` into a phase-by-phase execution plan with clear deliverables and exit criteria.

## Guiding decisions (keep simple)

### Architecture
Recommended for MVP: **modular monolith**
- One Go API service (REST) + Postgres.
- Auth implemented as a package/module inside the API first.
- Keep boundaries such that auth can be extracted into a separate `auth-service` later if needed.

Alternative: **api-service + auth-service** from day one
- Start with two Go services:
  - `auth-service`: identity + sessions
  - `api-service`: domain (problems/reviews/lists/contests)
- Adds operational overhead but matches the ApptRemind pattern more directly.

### Auth
Recommended for MVP:
- Email + password
- JWT access token (short-lived) + refresh token (stored hashed in DB, revocable)
- Endpoints: `/api/v1/auth/register`, `/api/v1/auth/login`, `/api/v1/auth/refresh`, `/api/v1/auth/logout`, `/api/v1/auth/me`
- Reuse implementation patterns from `/mnt/VaultD/Projects/ApptRemind/services/auth-service` and simplify what you do not need (no Kafka/outbox, no business_id).

### Google Calendar integration
Recommended for MVP:
- Start with a per-user private **ICS feed** (subscribe from Google Calendar).
- Upgrade to **Google OAuth + Calendar API** only if you need near real-time sync and per-event reminders.

## Phase index

1. `docs/plans/phases/phase-00-decisions.md`
2. `docs/plans/phases/phase-01-foundation.md`
3. `docs/plans/phases/phase-02-auth-and-users.md`
4. `docs/plans/phases/phase-03-core-tracking.md`
5. `docs/plans/phases/phase-03b-google-calendar.md`
6. `docs/plans/phases/phase-04-lists-and-imports.md`
7. `docs/plans/phases/phase-05-contests.md`
8. `docs/plans/phases/phase-06-analytics-and-polish.md`
9. `docs/plans/phases/phase-07-hardening-and-v2.md`
