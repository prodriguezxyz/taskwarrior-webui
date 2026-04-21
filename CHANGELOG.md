# Changelog

This fork of [DCsunset/taskwarrior-webui](https://github.com/DCsunset/taskwarrior-webui) tracks additions made on the `personal/integrated` branch. Upstream has been effectively inactive since mid-2024, so this fork is where changes live.

Entries are grouped by theme. Each line includes the commit SHA so you can inspect or cherry-pick.

## UI & Navigation

- **Sidebar with project filter** (`f71eece`) — permanent left navigation listing "All tasks" and every project with pending counts. Replaces the previous Tasks/Projects mode toggle. Project selection is a filter stored in Vuex; page title, task count and progress % adapt to the active project.
- **Minimal design system** (`9b61032`) — neutral/calm palette with emerald as the only accent, Inter typography, custom CSS tokens (`--tw-bg`, `--tw-surface`, `--tw-accent`, borders, text scales). Linear/Todoist-inspired. Applies across toolbar, sidebar, dialogs, tabs, filter chips, search banner, group headers.
- **Today tab** (`a87e236`) — due-today plus overdue tasks in a dedicated tab.

## Task list

- **Unified toolbar** (`0f10fcd`) — tabs + action buttons merged into a single row with compact icon buttons.
- **Overdue / Today / Upcoming grouping** (`0f10fcd`) — Pending and Today are grouped visually in a colored header row. Overdue group is highlighted red.
- **Tag & priority filter chips** (`0f10fcd`) — toggleable filter bar with AND-combined chips. The Filters button lights up when any chip is active.
- **Row-level urgency coloring** (`0f10fcd`) — urgent / expired classes are now based on the row's own status instead of the active tab, so search results render correctly when mixing statuses.

## Search

- **Client-side text search** (`79f92c4`) — filter the visible task list by typing.
- **Compact search** (`704c2de`, `50e1d2c`) — search collapses into a magnifier icon; expands on click.
- **Ctrl+K shortcut** (`041b33d`) — `/` and `Ctrl+K` focus the search input.
- **Global soft search** (`0f10fcd`) — while typing, search ignores the active project and status tabs but still respects tag and priority filters. A banner shows the total match count. Clearing the query restores the previous view.

## Task dialog

- **Date/time picker** (`2c2af25`) — `Due`, `Until`, `Scheduled`, `Wait` use a reusable `DateTimeInput` component with a compact calendar and optional time row (Todoist-style toggle). Text input remains editable so relative dates (`tomorrow`, `eom`, `fri`…) still work. Picker emits `YYYY-MM-DD` or `YYYY-MM-DDTHH:mm:00` — both parsed cleanly by Taskwarrior.
  - Fixes: users typing locale dates like `03/6/2026` were hitting `Error 400: Cannot divide real numbers by strings` from Taskwarrior's expression evaluator.

## Sync & profiles

- **Profile selector** (`cdb84a3`) — backend endpoint `/api/profiles` plus a frontend dropdown for switching between multiple `TASKRC`/`TASKDATA` configurations.
- **Auto-refresh after sync** (`9afaba8`) — task list is re-fetched after `task sync` completes.

## Notes

- Upstream branch: `upstream/master` (last meaningful commit: 2024-12-31).
- Personal integration branch: `personal/integrated`.
- Active feature branches merge into `personal/integrated` as they mature.
- Open upstream PRs from this fork (as of 2026-04):
  - [#94](https://github.com/DCsunset/taskwarrior-webui/pull/94) — client-side text search
  - [#97](https://github.com/DCsunset/taskwarrior-webui/pull/97) — refresh task list after sync
