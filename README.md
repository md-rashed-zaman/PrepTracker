# PrepTracker

Interview prep tracker with spaced repetition scheduling (SM-2), review logging, and timed contest generation. PrepTracker is not a coding platform: it links out to LeetCode/NeetCode/etc and tracks your recall/revision cadence.

## Key Features (MVP)

- Problem library (URL + metadata)
- Daily due list (overdue, due today, due soon)
- Review logging with grade (0-4) and optional time spent
- SM-2 scheduler with per-user minimum interval policy (Policy A in `AGENTS.md`)
- Template list imports (Blind 75, NeetCode 150) as editable snapshots
- Timed contests generated from your existing problems
- Google Calendar integration (free): subscribe to a private ICS feed to see due reviews on Google Calendar
  - User controls the daily notification time via settings (event start time)

## Tech Stack (Planned)

- Backend: Go (REST) + PostgreSQL
- Frontend: Next.js (App Router) + Tailwind + shadcn/ui
- Migrations: golang-migrate (or atlas)
- Auth: backend-managed auth (JWT access token + DB-backed refresh token), based on patterns from `/mnt/VaultD/Projects/ApptRemind/services/auth-service`
- Calendar MVP: ICS feed subscription (no Google OAuth)

## Architecture (Modular Monolith)

Single backend service with clear internal module boundaries. The auth module can be extracted into a dedicated `auth-service` later.

```mermaid
flowchart LR
  U[User] -->|Browser| W[Next.js Web App]
  W -->|REST Bearer JWT| API_SVC[Go API - modular monolith]
  API_SVC --> DB[(PostgreSQL)]

  subgraph API_MODS["Go API modules"]
    AUTH[Auth module<br/>register/login/refresh/me]
    DOMAIN[PrepTracker domain<br/>problems/reviews/lists/contests]
    CAL[Calendar module<br/>ICS feed]
  end

  API_SVC -. routes .-> AUTH
  API_SVC -. routes .-> DOMAIN
  API_SVC -. routes .-> CAL
  AUTH --> DB
  DOMAIN --> DB
  CAL --> DB
```

## Data Flows

Review logging and rescheduling:

```mermaid
sequenceDiagram
  autonumber
  participant Web as Web App
  participant API as Go API
  participant DB as Postgres

  Web->>API: POST /api/reviews payload: problemId, grade, timeSpent
  API->>DB: INSERT review_logs append-only
  API->>DB: SELECT user_problem_state FOR UPDATE
  API->>API: Compute SM-2 and Policy A
  API->>DB: UPSERT user_problem_state fields: due_at, reps, ease
  API-->>Web: 200 OK updated due_at and mastery
```

Google Calendar (free MVP via ICS subscription):

```mermaid
sequenceDiagram
  autonumber
  participant GCal as Google Calendar
  participant API as Go API
  participant DB as Postgres

  Note over GCal,API: User adds a private ICS URL to Google Calendar via subscribe by URL
  GCal->>API: GET /api/v1/integrations/calendar/ics?token=...
  API->>DB: Query due items today and due soon window
  API-->>GCal: text/calendar ICS events
```

## Database Design (MVP)

```mermaid
erDiagram
  USERS ||--|| USER_SETTINGS : has
  USERS ||--o{ USER_PROBLEM_STATE : tracks
  PROBLEMS ||--o{ USER_PROBLEM_STATE : scheduled_for
  USERS ||--o{ REVIEW_LOGS : writes
  PROBLEMS ||--o{ REVIEW_LOGS : attempted
  USERS ||--o{ LISTS : owns
  LISTS ||--o{ LIST_ITEMS : contains
  PROBLEMS ||--o{ LIST_ITEMS : listed
  USERS ||--o{ CONTESTS : runs
  CONTESTS ||--o{ CONTEST_ITEMS : includes
  PROBLEMS ||--o{ CONTEST_ITEMS : selected
  CONTESTS ||--o{ CONTEST_RESULTS : records
  USERS ||--|| CALENDAR_ICS_TOKENS : publishes

  USERS {
    string id PK
    string email
    string password_hash
    datetime created_at
  }
  USER_SETTINGS {
    string user_id PK
    string timezone
    int min_interval_days
    datetime created_at
    datetime updated_at
  }
  PROBLEMS {
    string id PK
    string url
    string title
    string platform
    string difficulty
  }
  USER_PROBLEM_STATE {
    string user_id PK
    string problem_id PK
    datetime due_at
    int reps
    int interval_days
    float ease
    boolean is_active
  }
  REVIEW_LOGS {
    string id PK
    string user_id
    string problem_id
    datetime reviewed_at
    int grade
    int time_spent_sec
    string source
    string contest_id
  }
  LISTS {
    string id PK
    string owner_user_id
    string name
    string source_type
  }
  LIST_ITEMS {
    string list_id PK
    string problem_id PK
    int order_index
  }
  CONTESTS {
    string id PK
    string user_id
    int duration_minutes
    string strategy
  }
  CONTEST_ITEMS {
    string contest_id PK
    string problem_id PK
    int order_index
    int target_minutes
  }
  CONTEST_RESULTS {
    string contest_id PK
    string problem_id PK
    int grade
    int time_spent_sec
    boolean solved_flag
  }
  CALENDAR_ICS_TOKENS {
    string user_id PK
    string token_hash
    datetime created_at
    datetime rotated_at
  }
```

## Docs

- Product requirements and domain rules: `AGENTS.md`
- Phased execution plan: `docs/plans/2026-02-08-preptracker-phased-plan.md`
- System design (more diagrams): `docs/system-design.md`

## Local Development (Backend)

```bash
make compose-up
make migrate-up
PORT=18080 make api
```

API docs:
- Swagger UI: `http://localhost:18080/docs`
- OpenAPI spec: `http://localhost:18080/openapi.yaml`

## Local Development (Frontend)

Run the API (above), then:

```bash
cd apps/web
cp .env.example .env.local
npm install
npm run dev
```

Web app: `http://localhost:3000`

## Local Development (Docker, Full Stack)

Starts Postgres + migrations + API + Web:

```bash
PREPTRACKER_API_PORT=18080 PREPTRACKER_WEB_PORT=13000 make compose-up-all
```

Web app: `http://localhost:13000`
API docs: `http://localhost:18080/docs`

## E2E Tests (Playwright)

Bring the stack up, then run:

```bash
PLAYWRIGHT_BASE_URL=http://localhost:13000 npm -C apps/web run test:e2e
```

Run tests:

```bash
make test
make test-db
```

## Docker

```bash
PREPTRACKER_API_PORT=18080 make compose-up-all
```

Then open `http://localhost:18080/docs`.

## User Settings

- `timezone`: used to compute due dates and render calendar events.
- `min_interval_days`: SM-2 Policy A minimum spacing.
- `due_hour_local` and `due_minute_local`: the local time for daily calendar events and due date anchoring.
  - Update via `PATCH /api/v1/users/me/settings`

## Notes

- Google Calendar sync MVP intentionally avoids OAuth and uses an ICS subscription URL so it stays free and simple.
