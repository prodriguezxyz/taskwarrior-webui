# Repository Guidelines

## Project Structure & Module Organization

This repository contains a Taskwarrior web UI split into a Nuxt/Vue frontend and a Koa/TypeScript backend.

- `frontend/`: Nuxt 2 SPA, Vue components in `components/`, pages in `pages/`, Vuex store in `store/`, shared utilities in `utils/`, static assets in `static/`, and global CSS in `assets/`.
- `backend/`: Koa API in `src/`, including task routes, auth, profiles, sync, and per-profile queueing. Test/dev configs live in `backend/test/`.
- `nginx/` and `docker/`: container runtime configuration.
- `screenshots/`: UI reference images used in docs.

## Build, Test, and Development Commands

Run commands from the relevant package directory.

```sh
cd backend && npm run dev
```
Starts the API on port `3000` with `AUTH_MODE=dev` and test profile/user config.

```sh
cd backend && npm run build
```
Compiles TypeScript to `backend/dist/`.

```sh
cd frontend && npm run dev
```
Starts the Nuxt dev server on port `8080`, proxying `/api` to the backend.

```sh
cd frontend && npm run build
```
Builds the production frontend bundle.

```sh
cd frontend && npm run lint
```
Runs ESLint with auto-fix for `.ts`, `.js`, and `.vue` files.

## Coding Style & Naming Conventions

Use TypeScript for backend and frontend logic. Follow existing style: tabs for indentation, single quotes, semicolons, and concise helper functions. Vue components use `PascalCase.vue`; utilities use `camelCase.ts`. Keep backend modules focused by route or concern, as in `tasks.ts`, `profiles.ts`, and `auth.ts`.

Avoid persisting frontend-only task fields such as `_profile`, `_collapsedCount`, or `_siblingUuids`.

## Testing Guidelines

There is no dedicated automated test suite in the current tree. At minimum, run backend and frontend builds before submitting changes. For UI changes, run the frontend locally and verify affected workflows manually. Use `backend/test/users.json` and `backend/test/profiles.json` for local development data.

## Commit & Pull Request Guidelines

The history follows Conventional Commits with optional scopes, for example:

- `feat(frontend): move tasks between profiles`
- `fix(frontend): scope quick-add suggestions to active profile`
- `chore: ignore todoist migration artifacts`

Pull requests should include a short description, affected area (`frontend`, `backend`, `docker`, etc.), manual verification steps, and screenshots for visible UI changes. Link related issues when applicable and call out migration/configuration changes.

## Security & Configuration Tips

Production auth defaults to Cloudflare Access. Set `AUTH_MODE=cloudflare`, `CF_ACCESS_TEAM_DOMAIN`, `CF_ACCESS_AUD`, `USERS_CONFIG`, and `PROFILES_CONFIG` for deployments. Use `AUTH_MODE=dev` only for local development. Treat Taskwarrior data, Todoist dumps, and `.taskrc` files as sensitive; do not commit them.
