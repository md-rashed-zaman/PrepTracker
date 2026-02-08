# PrepFlow — Interview Prep Tracker (Spaced Repetition + Contest Generator)

This document is the **single source of truth** for product requirements, business logic, and execution plan for an AI agent (or engineering team) to build the system.

For a phase-by-phase execution breakdown, see `docs/plans/2026-02-08-prepflow-phased-plan.md`.

---

## 0) Product summary

Build a web app that helps software engineers prepare for technical interviews by:
- Tracking problems (as links to external platforms like LeetCode, NeetCode, etc.)
- Scheduling revisions using a **spaced repetition algorithm (SM-2)**
- Syncing upcoming revisions to **Google Calendar** (so Google Calendar reminders can notify the user)
- Adding light **gamification** via mastery/streak/consistency metrics
- Generating **timed contests** from the user’s tracked problems (no built-in coding arena)

The app is **not** a LeetCode clone. Users practice on external sites and return to record outcomes (grade, time spent, etc.).

---

## 1) Tech stack & architecture

### Backend
- Go (Golang)
- PostgreSQL
- API style: REST (start simple)
- Migrations: `golang-migrate` (recommended) or `atlas`
- Auth (recommended): backend-managed auth (see **Auth service** below)
- Background jobs: `pg_cron` (Postgres), `asynq`, or a simple Go cron loop

### Frontend
- Next.js (App Router)
- shadcn/ui components
- Tailwind CSS
- Build tool note:
  - Next.js typically builds with **Turbopack/Webpack** (not Vite).
  - If the project must use Vite somewhere, use it for:
    - a shared `ui` package build (monorepo) **or**
    - Storybook/Playground for shadcn components
  - The production app remains Next.js.

### High-level modules
- **Problem Catalog**: normalized problems & metadata (title, URL, topics, difficulty, platform)
- **User Problem State**: per-user scheduling state (SM-2)
- **Review Logs**: immutable history of attempts (foundation for FSRS upgrade)
- **Lists**: user-created + template imports (Blind 75, NeetCode 150)
- **Contests**: generated timed sessions referencing existing problems
- **Analytics**: mastery scores, overdue counts, consistency, weak-topic flags
- **Auth service**: user identity + sessions (JWT + refresh tokens)
- **Calendar integration**: publish due dates to Google Calendar (ICS or OAuth-based)

### Auth service (recommended)
Goal: per-user ownership of all data (progress tracking), with a simple auth flow that works well with a Go API.

Recommended approach for MVP:
- Reuse the `auth-service` pattern from `/mnt/VaultD/Projects/ApptRemind/services/auth-service`:
  - Email + password (bcrypt)
  - Access token: JWT (Bearer)
  - Refresh token: stored hashed in Postgres, revocable
  - Endpoints: `/api/v1/auth/register`, `/api/v1/auth/login`, `/api/v1/auth/refresh`, `/api/v1/auth/logout`, `/api/v1/auth/me`
- Keep it as:
  - a separate service if running multiple backend services, or
  - an internal module inside a single API service if staying monolithic for MVP.

Non-goal for MVP:
- OAuth/social login (can be added later; the rest of the system should not depend on auth provider choice).

### Google Calendar integration (recommended MVP approach)
Goal: if a problem is due on a given day, the user sees it on Google Calendar and can get Google Calendar reminders.

Two viable approaches:
1. ICS feed subscription (recommended for MVP)
   - App exposes a per-user private ICS URL.
   - User subscribes to it in Google Calendar.
   - Pros: no Google OAuth; easier; less security/compliance overhead.
   - Cons: Google calendar subscription refresh can be slow; reminders are usually calendar-level defaults.
2. Google OAuth + Calendar API (V2 or MVP if you want “proper sync”)
   - User connects their Google account via OAuth.
   - App creates/updates events directly in Google Calendar.
   - Pros: near real-time updates; better per-event reminders; can create a dedicated “PrepFlow” calendar.
   - Cons: more engineering + token storage; app verification/consent friction depending on configuration.

---

## 2) Scope (MVP) & Non-goals

### MVP goals
1. User can add problems (link + metadata).
2. User can import template lists (Blind 75, NeetCode 150 snapshots).
3. User can review due problems daily:
   - record grade 0–4
   - scheduler updates next due date
4. User can connect revisions to Google Calendar:
   - MVP: subscribe to a private ICS feed
   - Optional: OAuth-based Calendar API sync
4. User can generate a timed contest:
   - chooses duration + strategy
   - app selects problems by priority
   - user records contest results (grade/time)
5. Dashboards:
   - due today, overdue, due soon
   - topic mastery overview
   - streak/consistency metrics

### Explicit non-goals (for now)
- No built-in coding arena or judge.
- No AI coach.
- No mock interview engine with AI.
- No notes/codes inside contests (notes belong to the problem track only).

### Scalability goals
- Keep an **append-only review log** for each attempt.
- Keep problem catalog + user-state separated.
- Algorithm can upgrade to FSRS later without data loss.

---

## 3) Core domain concepts

### Entities (domain language)
- **Problem**: a coding/system design question hosted elsewhere (URL).
- **UserProblemState**: the user’s mastery/scheduler state for a problem.
- **Review**: an attempt to recall/solve a problem (event in logs).
- **List**: an ordered set of problems (custom or imported template snapshot).
- **Contest**: a timed session containing selected problems and results.

### Grade rubric (0–4)
Grades should be behavior-based and fast to enter.

- **0**: couldn’t solve / blank / wrong approach
- **1**: solved only after viewing solution / heavy hints
- **2**: solved but struggled / slow / uncertain
- **3**: solved within acceptable time + explained cleanly
- **4**: solved fast + confident + explained clearly

Grade drives scheduler, mastery, and contest selection.

---

## 4) Spaced repetition scheduler (SM-2 + Policy A min distance)

### Stored state per (user, problem)
- `reps` (int): successful consecutive reviews (>=0)
- `interval_days` (int): last computed interval in days (>=1)
- `ease` (float): how easy this problem is for the user (min 1.3). Start 2.5
- `due_date` (date/time)
- `last_review_at` (timestamp)
- Optional: `last_grade`, `last_time_spent_sec`

### User control: minimum revision distance
- Per user: `min_interval_days` (M)
- Meaning: next due date must not be earlier than M days **and** intervals should shift forward accordingly.

#### Policy A (OFFSET MODE) — chosen
1) Compute normal SM-2 `base_interval_days`.
2) Apply user minimum like:

```
final_interval_days = max(M, base_interval_days + (M - 1))
due_date = today + final_interval_days
```

Example with `M = 7`:
- base 1 → final 7
- base 6 → final 12
- base 14 → final 20
Matches requirement: intervals “get further ahead accordingly”.

### SM-2 update logic (adapted)
Inputs:
- Current state: `reps`, `interval_days`, `ease`
- `grade` in [0..4]
- `today` = date of review (use user timezone)

Rules:
1) If `grade <= 1` (fail):
   - `reps = 0`
   - `interval_days = 1`
   - `ease = max(1.3, ease - 0.2)`  (simple penalty)
2) Else (`grade >= 2`) success:
   - `reps += 1`
   - If `reps == 1`: `interval_days = 1`
   - Else if `reps == 2`: `interval_days = 6`
   - Else: `interval_days = round(interval_days * ease)`
   - Update ease with SM-2 style formula:
     - Use direct 0–4 version (recommended for simplicity):
       - `d = 4 - grade`
       - `ease = ease + (0.10 - d*(0.08 + d*0.02))`
       - `ease = max(1.3, ease)`
3) Apply minimum distance policy A to get `final_interval_days` and `due_date`.

### Implementation details & edge cases
- **Overdue handling**: still schedule from **today**, not from old due date.
- **Multiple reviews same day**: allow but avoid skipping logs. If multiple, last one determines state.
- **Time zone**: all due computations should respect user timezone (store user tz; compute due date at local midnight or a fixed hour like 09:00).
- **Data integrity**:
  - Always append `review_logs` first.
  - Then update `user_problem_state` in the same transaction.

---

## 5) Mastery & gamification metrics

### Problem-level metrics (derived)
- **Mastery score** (0–100): used for dashboards and contest prioritization.
  - Simple formula (v1):
    - `mastery = clamp( 20*log2(reps+1) + 25*(ease-1.3) - overdue_penalty, 0, 100 )`
  - `overdue_penalty` could be `min(30, overdue_days*2)`.
- **Recall health** buckets based on `due_date`:
  - Overdue
  - Due today
  - Due soon (next 1–3 days)
  - Not due

### User-level metrics (derived)
- **Consistency**: % of reviews done on/before due date over last 14/30 days.
- **Streak**: consecutive days with at least one review or with all due reviews done (choose one definition and document it).
- **Topic mastery**: average mastery weighted by problem importance or difficulty.

### Badge examples (professional)
- “7-day On-time Review Streak”
- “Graphs Mastery ≥ 70”
- “Completed 3 contests this week”

No flashy UI required; keep it clean and measurable.

---

## 6) Lists (custom + template import)

### Requirements
- Users can create their own lists and organize problems topic-wise.
- Users can import established lists (Blind 75, NeetCode 150) into their account.
- Imported lists must be editable by user (reorder/remove/add) without affecting templates.

### Template import strategy (snapshot copy)
- Templates stored as JSON seed files in repo (versioned):
  - `templates/blind75.v1.json`
  - `templates/neetcode150.v1.json`
- Import behavior:
  1) For each template item: upsert into `problems` (dedupe by normalized URL + platform).
  2) Create a new `list` owned by the user with metadata (`source_type='template'`, `source_key='blind75'`, `version='v1'`).
  3) Insert ordered `list_items` for that user list.

Optional later:
- “Update available” flow that can diff template versions vs user snapshot.

---

## 7) Contest generator (timed sessions)

### Inputs
- Duration minutes (e.g., 30/60/90)
- Difficulty mix (e.g., 2 Easy, 2 Medium, 1 Hard)
- Topic strategy:
  - Balanced (spread across topics)
  - Weakness-focused (low mastery, frequent fails)
  - Due-heavy (overdue/due soon priority)

### Output
- A contest with ordered problems + target minutes per problem.
- User practices externally and returns to record results.

### Contest selection scoring
Compute `priority` per candidate problem:

```
priority =
  3*overdue_days
  + 2*(100 - mastery)
  + 15*recent_fail_flag
  + topic_balance_bonus
```

Candidate pool:
- all overdue + due soon
- plus a small sample of weak-not-due-yet (prevents blind spots)

Selection algorithm:
1) Filter candidates by user constraints (exclude archived/disabled problems).
2) Partition by difficulty buckets.
3) Use weighted sampling by `priority` within each bucket while meeting topic constraints.
4) Create contest record and contest_items.
5) After contest completion: save results and also create corresponding `review_logs` (contest reviews should count for scheduling).

### Contest does NOT store notes/codes
Notes/codes belong to the problem track only.

---

## 8) Data model (Postgres)

### Core tables (suggested)

#### users
- id (uuid pk)
- email (unique)
- name
- timezone (text)
- min_interval_days (int default 1)
- created_at, updated_at

Notes:
- If using a separate `auth-service`, store credentials (password hash, refresh tokens) in an auth DB/table owned by auth.
- Keep app-specific settings in the PrepFlow DB (timezone, min_interval_days, preferences). Key by the same `user_id`.

#### problems
- id (uuid pk)
- platform (text)  // leetcode, gfg, codeforces, etc.
- url (text unique)  // normalized
- title (text)
- difficulty (text enum: easy/medium/hard/unknown)
- topics (text[])
- created_at, updated_at

#### user_problem_state
- user_id (uuid fk)
- problem_id (uuid fk)
- reps (int)
- interval_days (int)
- ease (numeric(4,2))
- due_at (timestamptz)
- last_review_at (timestamptz)
- last_grade (int)
- is_active (bool default true)
- primary key (user_id, problem_id)

#### review_logs (append-only)
- id (uuid pk)
- user_id (uuid fk)
- problem_id (uuid fk)
- reviewed_at (timestamptz)
- grade (int)
- time_spent_sec (int null)
- source (text) // 'daily_review' | 'contest' | 'manual'
- contest_id (uuid null fk)
- created_at

#### lists
- id (uuid pk)
- owner_user_id (uuid null fk) // null = template list
- name (text)
- description (text null)
- source_type (text) // 'custom' | 'template'
- source_key (text null) // 'blind75', 'neetcode150'
- version (text null) // 'v1'
- is_public (bool default false)
- created_at, updated_at

#### list_items
- list_id (uuid fk)
- problem_id (uuid fk)
- order_index (int)
- added_at (timestamptz)
- primary key (list_id, problem_id)

#### contests
- id (uuid pk)
- user_id (uuid fk)
- duration_minutes (int)
- strategy (text) // balanced, weakness, due-heavy
- created_at
- started_at (timestamptz null)
- completed_at (timestamptz null)

#### contest_items
- contest_id (uuid fk)
- problem_id (uuid fk)
- order_index (int)
- target_minutes (int)
- primary key (contest_id, problem_id)

#### contest_results
- contest_id (uuid fk)
- problem_id (uuid fk)
- grade (int)
- time_spent_sec (int)
- solved_flag (bool)
- recorded_at (timestamptz)
- primary key (contest_id, problem_id)

Indexes:
- `user_problem_state(user_id, due_at)`
- `review_logs(user_id, reviewed_at desc)`
- `problems(url)` unique
- `list_items(list_id, order_index)`

---

## 9) Backend API (REST)

### Auth
- Recommended: backend-managed auth (ApptRemind-derived `auth-service`) issuing JWT access tokens + refresh tokens.
- Frontend stores access token (Bearer) and uses refresh flow to keep sessions alive.

### Endpoints (v1)
#### Problems
- POST `/api/problems` (add a problem link + metadata)
- GET `/api/problems?query=&topic=&difficulty=`
- GET `/api/problems/:id`
- PATCH `/api/problems/:id` (metadata edits)

#### User state & reviews
- GET `/api/reviews/due?date=today` (returns due items)
- POST `/api/reviews` (record a review attempt; updates scheduler)
  - body: `{problemId, grade, timeSpentSec, source, contestId?}`

#### Lists
- POST `/api/lists` (create custom list)
- GET `/api/lists`
- GET `/api/lists/:id`
- POST `/api/lists/:id/items` (add problem)
- PATCH `/api/lists/:id/items/reorder`
- POST `/api/lists/import` (import template by key/version)

#### Contests
- POST `/api/contests/generate`
  - body: `{durationMinutes, strategy, difficultyMix, topicMix}`
- POST `/api/contests/:id/start`
- POST `/api/contests/:id/complete`
- POST `/api/contests/:id/results` (bulk submit results)

#### Analytics
- GET `/api/stats/overview`
- GET `/api/stats/topics`
- GET `/api/stats/streaks`

---

## 10) Frontend UX plan (Next.js + shadcn)

### Core pages
1) **Today**
   - list of due problems (overdue first)
   - quick grade buttons 0–4
   - optional time spent
2) **Library**
   - all problems; filters by topic/difficulty/platform
   - add new problem (URL + quick metadata)
3) **Lists**
   - create list
   - import template list
   - reorder list items
4) **Contests**
   - generator form (duration, strategy, difficulty mix)
   - contest view (ordered problems + links + timer)
   - submit results (grade/time per problem)
5) **Stats**
   - mastery per topic
   - due/overdue trend
   - streaks, consistency

Design rules:
- Keep UI professional and minimal.
- Use shadcn components (Card, Table, Tabs, Dialog, Badge, Progress).
- Provide clear status chips: Overdue / Due Today / Due Soon / Not Due.

---

## 11) Scheduler & contest execution flows

### Review flow (transactional)
1) Validate grade 0–4.
2) Insert `review_logs` row.
3) Load `user_problem_state` (create if missing with defaults).
4) Run SM-2 update → `base_interval_days`.
5) Apply Policy A min distance → `final_interval_days`.
6) Update `user_problem_state`: reps, interval_days, ease, due_at, last_review_at, last_grade.
7) Return updated state to client.

### Contest flow
1) Client requests generation with constraints.
2) Backend selects candidate pool + computes priority.
3) Sample according to difficulty mix + strategy.
4) Persist contest + items.
5) Client starts timer (frontend), then submits results.
6) Backend saves results and also inserts `review_logs` for each item, then updates scheduler per item (same as review flow).

---

## 12) Testing plan

### Backend tests
- Unit test SM-2 update logic (grade transitions).
- Unit test Policy A min distance correctness (example-driven).
- Unit test contest selection constraints (difficulty mix satisfied; topic strategy respected).
- Integration tests: review API writes log + updates state in one transaction.

### Frontend tests
- Basic e2e flows:
  - import template list
  - mark reviews for due items
  - generate contest + submit results
- Use Playwright later; for now minimal smoke tests acceptable.

---

## 13) Migration path to FSRS (future)

Preconditions already met by design:
- `review_logs` contain immutable attempt history.
- State table can store FSRS parameters later (e.g., stability, difficulty).

Plan:
1) Add fields to `user_problem_state`: `fsrs_difficulty`, `fsrs_stability`, etc.
2) Write a migration script that replays logs into FSRS to compute state.
3) Switch scheduler engine behind a feature flag per user.
4) Keep Policy A minimum interval as a post-processing step (still applicable).

---

## 14) Implementation milestones

### Milestone 0 — Repo bootstrap
- Decide: monolith vs (api + auth-service)
- Establish repo layout + local dev (docker compose for Postgres)
- CI baseline (lint/test)

### Milestone 1 — Auth + core tracking
- Auth service (email+password, JWT + refresh) or auth module (if monolith)
- User settings (timezone, min_interval_days)
- Problem CRUD
- Due list (Today) + review logging + SM-2 scheduling

### Milestone 2 — Lists
- Custom lists
- Template import (Blind 75 + NeetCode 150 seeded)
- List browsing + reorder

### Milestone 3 — Contests
- Contest generator + contest pages
- Submit results and update scheduler

### Milestone 4 — Analytics & polish
- Mastery per topic
- Streak/consistency
- Better filters and search

---

## 15) Acceptance criteria (MVP)

- User can add 10 problems and see them in Library.
- User can import Blind 75 list and it becomes editable (snapshot).
- Today page shows due problems based on due_at.
- Recording a grade updates due_at using SM-2 + Policy A min interval.
- Contest generator produces an ordered list respecting difficulty mix and strategy.
- Submitting contest results updates review logs and schedules for included problems.

---
