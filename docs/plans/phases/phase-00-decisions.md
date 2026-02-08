# Phase 00: Decisions (1-2 hours)

Goal: lock decisions that influence folder layout and auth integration.

## Decisions to finalize

1. Architecture
   - Chosen: modular monolith (single Go API with auth module).
2. Login method
   - Chosen: email + password for MVP.
3. Token strategy
   - Chosen: access JWT + refresh token (DB-backed).
4. Timezone behavior
   - Store `users.timezone` (IANA string) and compute due dates in that tz.
   - Decide: due time set to local 09:00 vs local midnight.
5. Google Calendar MVP
   - Chosen: private ICS feed subscription (no OAuth).

## Exit criteria
- A single chosen answer for each decision above.
- Document the choices in `AGENTS.md` (short “Decision log” section is fine).
