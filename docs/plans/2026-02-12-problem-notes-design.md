# Problem Notes (Single Doc) — Hybrid Storage (JSON + Markdown)

## Goal
Add a Notion-inspired "Notes" document per `(user, problem)` to capture:
- takeaways / pitfalls / patterns
- code snippets

Scope is a single living document per problem (no journaling/threading yet).

## UX
- Entry points:
  - `Library`: per-problem `Notes` action.
  - `Today` + `Contests`: per-problem `Notes` link.
- Route:
  - `/(app)/library/[id]/notes` (mobile-friendly, avoids huge modals).
- Editor:
  - TipTap (WYSIWYG) + slash menu (`/`) for blocks:
    - headings (1–3), bullet list, numbered list, quote, code block, divider
  - Autosave (debounced) + manual `Save` button.
  - Status chip: Draft / Saving / Saved / Error.

## Storage Strategy (Hybrid)
- Canonical storage is **TipTap JSON** for fidelity.
- Additionally store **Markdown** for:
  - future export/sharing
  - future search indexing

No HTML is stored or rendered.

## Backend
### Table
`problem_notes`:
- `user_id uuid` (FK -> `users.id`, cascade delete)
- `problem_id uuid` (FK -> `problems.id`, cascade delete)
- `content_md text`
- `content_json jsonb`
- `created_at timestamptz`
- `updated_at timestamptz`
- PK `(user_id, problem_id)`

Migration: `services/api/migrations/0004_problem_notes.*.sql`

### API
All endpoints require auth (JWT).

- `GET /api/v1/problems/{id}/notes`
  - returns `exists:false` + an empty doc if no notes exist
- `PUT /api/v1/problems/{id}/notes`
  - upserts notes content

OpenAPI: `openapi/preptracker.v1.yaml`

## Frontend
### Proxy routes
- `GET/PUT /api/problems/[id]/notes` -> Go API

### Components
- `apps/web/src/components/notes/notes-editor.tsx`
- `apps/web/src/components/notes/slash-command.ts`

### Styling
- `apps/web/src/app/globals.css` adds `.pf-notes-editor` styles and code block formatting.

## Testing
- Playwright core flow covers:
  - add problem -> open notes -> type -> autosave -> reload -> content persists

