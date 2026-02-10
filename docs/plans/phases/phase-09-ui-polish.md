# Phase 09 — UI Polish (Navigation + Lists + Library)

Goal: fix UI inconsistencies and improve information density/scrolling so the app stays usable with large libraries/lists.

## Problems observed
- Shell sidebar stretches to match content height, making it feel "too long" relative to the number of menu items.
- Long Lists/Library views grow vertically without bounds, forcing excessive page scrolling.
- Lists "add item" sometimes appears to fail even when the item is actually added (stale UI state after refresh).
- Library lacks metadata editing (title/platform/difficulty/topics) which is needed to keep the catalog clean.

## Deliverables
- Shell sidebar:
  - no stretch-height coupling with main column
  - sticky on desktop and scrollable if it exceeds viewport height
- Lists page:
  - list selector remains visible on desktop (sticky)
  - details panel has bounded height and internal scroll for large lists/topics
  - add-to-list UX does a verified reload on error (prevents false-negative error)
- Library page:
  - dense desktop table view with bounded height and internal scroll
  - mobile-friendly card view retained
  - edit modal to update metadata fields
- API:
  - `PATCH /api/v1/problems/{id}` supports metadata updates in addition to `is_active`

## Exit criteria
- Sidebar does not visually "match" main column height.
- On desktop, sidebar remains visible while scrolling long lists.
- Lists details panel and Library results remain usable with 150+ items.
- Playwright E2E suite passes.

