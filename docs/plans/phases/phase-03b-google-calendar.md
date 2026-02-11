# Phase 03b: Google Calendar Integration (0.5-2 days)

Goal: upcoming revisions appear in Google Calendar so Google Calendar can notify the user.

## Option A (recommended MVP): ICS feed subscription

### Deliverables
- A per-user private ICS URL (treat it like a password).
- The ICS contains events for:
  - overdue items (today)
  - due today
  - due soon window (e.g., next 14 or 30 days)
- Each event includes:
  - title: problem title (or platform + title)
  - description: problem URL + topics + last grade + last reviewed
  - date/time: align with your due-time policy (all-day or fixed local time)

### API shape
- `GET /api/v1/integrations/calendar/ics` returns `text/calendar`
- Add `?token=...` (or path token) for auth so the URL is unguessable.

### Data model
- `calendar_ics_tokens(user_id pk, token_hash, created_at, rotated_at)`

### UX
- “Connect Google Calendar” page:
  - copy the subscription URL
  - instructions: add by URL in Google Calendar settings
  - rotate token button (breaks old link)

### Pros/cons
- Pros: no Google OAuth; very low ops/security overhead; fast to ship.
- Cons: Google Calendar subscription refresh is not instant; reminders are typically calendar-level defaults (user config).

## Option B (V2 or MVP if needed): Google OAuth + Calendar API sync

### Deliverables
- OAuth connect flow + token storage (refresh token).
- Choose calendar target:
  - create a dedicated “PrepTracker” calendar, or
  - insert into a calendar the user selects.
- Sync semantics:
  - on schedule update: upsert event for that problem’s next due date
  - on archive/disable: delete/cancel event
  - background reconciliation job (daily) to heal missed updates and handle rate limits

### Data model
- `google_oauth_tokens(user_id pk, encrypted_refresh_token, scopes, expires_at, created_at, revoked_at)`
- `google_calendar_state(user_id pk, calendar_id, created_at, updated_at)`
- `google_calendar_events(user_id, problem_id, google_event_id, due_at, updated_at, primary key(user_id, problem_id))`

### Risk notes
- Token security: store encrypted at rest; support disconnect/revoke.
- Google API rate limits: queue updates and batch when possible.
- Consent screen/config overhead: more moving parts than ICS.

## Exit criteria
- A user can see their due reviews on Google Calendar within the chosen integration approach’s limitations.

