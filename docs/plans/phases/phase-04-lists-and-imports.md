# Phase 04: Lists + Imports (2-3 days)

Goal: users can organize problems and import template lists as editable snapshots.

## Deliverables
- Custom lists CRUD:
  - create list
  - add/remove/reorder items
- Template import:
  - template JSON files committed in repo
  - import creates a new user-owned list snapshot
  - dedupe problems by normalized URL/platform

## Data model
- `lists`
- `list_items`
- Template storage strategy:
  - repo JSON seeds (versioned filenames)

## UI
- Lists page:
  - create list
  - import template
  - reorder list items (drag/drop optional; buttons acceptable)

## Tests
- Import idempotency rules (does not duplicate problems, list items order preserved).

## Exit criteria
- Acceptance criteria Milestone 2 from `AGENTS.md` passes end-to-end.

