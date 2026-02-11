# PrepTracker System Design

This document describes the modular monolith backend architecture, boundaries, and key data flows.

## Goals (MVP)

- Ship the daily review loop quickly with strong correctness guarantees.
- Keep append-only review history so algorithm upgrades (FSRS) are possible later.
- Keep auth as a clean boundary so it can be extracted to a dedicated service if needed.
- Google Calendar integration stays free and low-friction (ICS subscription).

## High-Level Components

```mermaid
flowchart TB
  U[User] --> W[Next.js Web App]

  W -->|REST| API_SVC[Go API]
  API_SVC --> DB[(PostgreSQL)]

  subgraph API_MODS["Go API - Modular Monolith"]
    A[Auth Module]
    P[Problems Module]
    R[Reviews and Scheduler Module]
    L[Lists and Template Import Module]
    C[Contests Module]
    S[Stats/Analytics Module]
    G[Google Calendar Module - ICS]
  end

  API_SVC -. routes .-> A
  API_SVC -. routes .-> P
  API_SVC -. routes .-> R
  API_SVC -. routes .-> L
  API_SVC -. routes .-> C
  API_SVC -. routes .-> S
  API_SVC -. routes .-> G

  A --> DB
  P --> DB
  R --> DB
  L --> DB
  C --> DB
  S --> DB
  G --> DB
```

## Module Boundaries (Conventions)

- `Auth`: owns credentials and session lifecycle. Exposes user identity via JWT claims.
- `Domain`: all business logic uses `user_id` from JWT claims; never trusts client-sent `user_id`.
- `Scheduler`: pure function(s) for SM-2 + Policy A; called only from review/contest write paths.
- `Calendar`: read-only view over due items that emits `text/calendar` (ICS). No Google OAuth in MVP.

Extraction-friendly conventions:
- No other module reads auth tables directly (only via a small internal auth interface).
- Domain tables key everything by `user_id` and never join on auth implementation details.
- Avoid implicit coupling through shared DB schemas; if convenient, place auth tables in a dedicated schema.

## Primary Data Model (MVP)

```mermaid
erDiagram
  USERS ||--o{ USER_SETTINGS : has
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
  USERS ||--o{ CALENDAR_ICS_TOKENS : publishes

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
    string platform
    string url
    string title
    string difficulty
    string topics
    datetime created_at
    datetime updated_at
  }
  USER_PROBLEM_STATE {
    string user_id PK
    string problem_id PK
    int reps
    int interval_days
    float ease
    datetime due_at
    datetime last_review_at
    int last_grade
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
    string source_key
    string version
    datetime created_at
  }
  LIST_ITEMS {
    string list_id PK
    string problem_id PK
    int order_index
    datetime added_at
  }
  CONTESTS {
    string id PK
    string user_id
    int duration_minutes
    string strategy
    datetime created_at
    datetime started_at
    datetime completed_at
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
    datetime recorded_at
  }
  CALENDAR_ICS_TOKENS {
    string user_id PK
    string token_hash
    datetime created_at
    datetime rotated_at
  }
```

## Data Flow: Scheduler Update (Transactional)

```mermaid
flowchart LR
  A[POST /api/reviews] --> B[Validate grade 0..4]
  B --> C[BEGIN TX]
  C --> D[INSERT review_logs]
  D --> E[SELECT user_problem_state FOR UPDATE]
  E --> F[Compute SM-2 base interval]
  F --> G[Apply Policy A min interval]
  G --> H[UPSERT user_problem_state]
  H --> I[COMMIT]
  I --> J[Return updated state]
```

## Data Flow: Google Calendar (ICS)

In MVP, the API emits the ICS dynamically. No background sync is required.

```mermaid
flowchart LR
  GCal[Google Calendar Subscriber] -->|GET ICS URL| API_SVC[Go API]
  API_SVC -->|Query due window| DB[(Postgres)]
  API_SVC -->|text/calendar| GCal
```

## Security Notes (MVP)

- ICS URL is private. Treat it as a password:
  - generate a long random token
  - store only a hash server-side
  - allow rotation (invalidates old URL)
- All domain endpoints require JWT auth; never accept `user_id` from clients.
