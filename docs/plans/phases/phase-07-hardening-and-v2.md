# Phase 07: Hardening + V2 (ongoing)

Goal: make the system safer, faster, and ready for real usage; then expand features.

## Hardening
- Security:
  - rate limit auth endpoints
  - lock down CORS
  - rotate JWT secret/keys
  - consider httpOnly cookie refresh tokens
- Data integrity:
  - unique constraints (problem URL normalization)
  - idempotency keys where needed (contest result submission)
- Observability:
  - structured logs, request IDs
  - basic metrics (latency, error rates)

## V2 features (from the existing spec)
- FSRS migration (replay from `review_logs`)
- “Update available” template list diffs
- Better contest strategies and weakness detection

## Exit criteria
- Production checklist defined and followed for deployment (even if deploying later).

