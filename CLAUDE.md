# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

A web UI for [Taskwarrior](https://taskwarrior.org/), split into a Nuxt.js (Vue 2 + Vuetify) frontend and a Koa.js backend. The backend wraps the `task` CLI via the `taskwarrior-lib` package; the frontend is a static SPA that talks to the backend over `/api`.

Node version pinned at **16.17.1** (`.tool-versions`). The frontend requires `NODE_OPTIONS=--openssl-legacy-provider` (already baked into its npm scripts) because of old Nuxt 2 / Webpack 4 crypto compatibility.

## Development

Run the backend and frontend in two separate shells:

```sh
# Backend — listens on localhost:3000, uses ./backend/test/.taskrc and ./backend/test/.task
cd backend && npm install && npm run dev

# Frontend — Nuxt dev server on localhost:8080, proxies /api → localhost:3000
cd frontend && npm install && npm run dev
```

Open `http://localhost:8080`. The dev `TASKRC`/`TASKDATA` point into `backend/test/` so local development does not touch your real Taskwarrior data.

The backend's `npm run dev` script sets `AUTH_MODE=dev` so requests don't need a Cloudflare Access JWT during local development. In production the default is `AUTH_MODE=cloudflare`, which requires `CF_ACCESS_TEAM_DOMAIN` and `CF_ACCESS_AUD` (see `DEPLOY.md`). The `dev` mode populates `ctx.state.email` from `DEV_USER_EMAIL` (default `dev@localhost`).

### Frontend lint

```sh
cd frontend && npm run lint   # eslint --fix on .ts/.js/.vue
```

The backend has no lint script wired up despite ESLint being in devDependencies.

### Production build

```sh
cd frontend && npm run build && npm run export   # generates frontend/dist (static)
cd backend  && npm run build                      # compiles TS → backend/dist
cd backend  && npm start                          # runs node dist/app.js
```

In production the backend binds `0.0.0.0:3000` (vs. `localhost` in dev), and the static frontend is served by nginx (see `nginx/server.conf`), which also reverse-proxies `/api/` to the backend.

## Architecture

### Backend (`backend/src/`)

Tiny Koa app:

- `app.ts` — wires middleware (bodyParser, logger, `koa-qs` for array query strings) and mounts `/tasks` and `/sync` routers. A top-level error handler converts `TaskError` (thrown by `taskwarrior-lib`) into HTTP 400 with the message exposed.
- `taskwarrior.ts` — single `TaskwarriorLib` instance configured from `TASKRC` / `TASKDATA` env vars. All routes share this instance.
- `tasks.ts` — `GET /tasks` (list), `PUT /tasks` (bulk upsert via `taskwarrior.update`), `DELETE /tasks?tasks=<uuid>&tasks=<uuid>` (bulk delete; `koa-qs` is what makes the repeated `tasks` params deserialize to an array).
- `sync.ts` — `POST /sync` shells out to `task sync`.

There is no database; state lives in the Taskwarrior data directory and every request re-shells out to the `task` binary via `taskwarrior-lib`.

### Frontend (`frontend/`)

Nuxt 2 in **SPA / static** mode (`ssr: false`, `target: 'static'`) — there is no server-side rendering. Notable pieces:

- `store/index.ts` — single Vuex store. Tasks are fetched once and kept in state; mutations like delete/update re-fetch the full list. Persistent user prefs (`settings`, `hiddenColumns`) are serialized to `localStorage`, not the backend.
- `pages/index.vue` — the only route; switches display `mode` (e.g. Projects) and filters/feeds `TaskList`.
- `components/` — `TaskList.vue` (main grid), `TaskDialog.vue` (add/edit), `ColumnDialog.vue`, `ConfirmationDialog.vue`, `SettingsDialog.vue`. Components are auto-imported (`components: true` in `nuxt.config.js`).
- `nuxt.config.js` — `/api` is proxied to `http://localhost:3000/` in dev via `@nuxtjs/proxy` (the `/api` prefix is stripped before forwarding). Vuetify is loaded via `@nuxtjs/vuetify` with `treeShake: true` and custom SCSS variables at `~/assets/variables.scss`.
- UI stack: Vuetify + Material Design Icons + PWA module (`@nuxtjs/pwa`).

The `Task` type is shared via the `taskwarrior-lib` npm package imported by both ends — there is no shared local package.

## Docker / Deployment

`Dockerfile` builds a single Alpine image that contains nginx, the Koa backend (prod-pruned), the static frontend (copied to `/static`), and the `task3` binary (Taskwarrior v3). `docker/start.sh` launches `npm start` (backend) in the background and nginx in the foreground.

Important: the image uses Alpine `v3.20/main` + `edge/community` to pick up `task3`. Taskwarrior v2 and v3 data files are **not compatible** — the image tag `:3` corresponds to v3, the default tag to v2. The CI workflow `.github/workflows/build-and-publish.yml` publishes both.

Runtime config:

- `TASKRC` — path to `.taskrc` (default `/.taskrc`)
- `TASKDATA` — path to `.task` dir (default `/.task`)

Both are also declared as container volumes. When overriding, mount the files/dirs into the paths you set — see `README.md` for the common "preserve absolute home paths" pattern needed when `.taskrc` references absolute cert paths for taskserver sync.

## Gotchas

- `DELETE /tasks` expects repeated query params (`?tasks=uuid1&tasks=uuid2`). `koa-qs` is what parses that — don't switch to JSON bodies without updating both sides.
- Any write path (`PUT /tasks`, `DELETE /tasks`, `POST /sync`) shells out to `task`; failures surface as `TaskError` → HTTP 400.
- `frontend/package.json` pins `normalize-url@4.5.1` deliberately (newer majors break Nuxt 2); don't bump it casually.
- The frontend has a local devDep on `taskwarrior-lib` at a different version than the backend — it's used only for the `Task` type. Keep types in sync if you touch either.
