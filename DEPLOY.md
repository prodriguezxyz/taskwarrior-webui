# Deploy

Ship a new build of this fork to the VPS. The flow is **build locally → `docker save` → stream over SSH → `docker compose up -d`**. There is no registry in the loop; the CI workflow in `.github/workflows/` publishes to the upstream's Docker Hub namespace and is unused for this fork.

## Quickstart

One-time setup:

```sh
cp .deploy.env.example .deploy.env
$EDITOR .deploy.env          # fill in VPS_HOST and COMPOSE_PATH
chmod +x deploy.sh
```

## Cloudflare Access (auth)

The backend rejects every request that does not carry a valid `Cf-Access-Jwt-Assertion` header. Configure the Access Application once in the Cloudflare dashboard, then inject the resulting tag and team domain via the VPS `.env`.

1. Cloudflare dashboard → **Zero Trust → Access → Applications → Add application → Self-hosted**.
2. Application domain: the domain where the webui is served (e.g. `tw.example.com`).
3. Identity provider: One-time PIN (email OTP) or whichever IdP you use.
4. Policy: `Allow` with the list of emails permitted to use the app.
5. After saving, copy:
   - **Application Audience (AUD) Tag** → `CF_ACCESS_AUD`
   - **Team domain** (e.g. `pedro.cloudflareaccess.com`) → `CF_ACCESS_TEAM_DOMAIN`
6. On the VPS, in the `.env` next to `docker-compose.yml`:

   ```
   AUTH_MODE=cloudflare
   CF_ACCESS_TEAM_DOMAIN=pedro.cloudflareaccess.com
   CF_ACCESS_AUD=<paste-aud-tag>
   ```

   And in `docker-compose.yml`:

   ```yaml
   environment:
     AUTH_MODE: ${AUTH_MODE}
     CF_ACCESS_TEAM_DOMAIN: ${CF_ACCESS_TEAM_DOMAIN}
     CF_ACCESS_AUD: ${CF_ACCESS_AUD}
   ```

The container fails to start if `AUTH_MODE=cloudflare` and either env var is missing.

For local development (`npm run dev`), set `AUTH_MODE=dev` to bypass Cloudflare; see `CLAUDE.md`.

Regular release:

```sh
./deploy.sh                  # build + transfer + restart
```

## What the script does

1. `docker build -t taskwarrior-webui:YYYYMMDD -t taskwarrior-webui:latest .` — single-stage Alpine image with task3 (v3), frontend static bundle, backend compiled, nginx.
2. `docker save taskwarrior-webui:latest | gzip | ssh $VPS_HOST "gunzip | docker load"` — stream the image over SSH, no intermediate file.
3. On the VPS: `docker compose up -d --force-recreate` at `$COMPOSE_PATH`. `--force-recreate` is required because docker-compose otherwise sees an unchanged service definition and won't pick up the new image.
4. `docker image prune -f` on the VPS to drop dangling layers.
5. Prints `docker compose ps` + last 30 log lines for a quick sanity check.

## Flags

| Flag | Use case |
|---|---|
| `--skip-build` | Image already built (e.g. you iterated with `docker build` manually). Reuses `taskwarrior-webui:latest`. |
| `--no-restart` | Only transfer the image to the VPS. Useful if you want to restart at a later time. |

## Verification

After the script completes, open the site and walk through the fork's features:

- Sidebar with project list and pending counts.
- "Today" tab (due-today + overdue).
- Unified toolbar: tabs + filter chips (tags, priority) + search.
- Search: `/` or `Ctrl+K` focuses it. Typing does a global soft search and shows a match-count banner.
- Task dialog date fields (`Due`, `Until`, `Scheduled`, `Wait`) open a calendar. Typing `03/6/2026` must not throw `Error 400: Cannot divide real numbers by strings`.
- `task sync` triggers an auto-refresh of the task list.
- Profile selector appears in the top bar if `profiles.json` declares ≥2 profiles.

See `CHANGELOG.md` for the full feature inventory with commit SHAs.

## Rollback

If a release is bad and the previous image is still on the VPS:

```sh
ssh "$VPS_HOST"
docker image ls taskwarrior-webui --format '{{.Tag}} {{.ID}}'
# Find a prior date tag, e.g. 20260320
docker tag taskwarrior-webui:20260320 taskwarrior-webui:latest
cd "$COMPOSE_PATH"
docker compose up -d --force-recreate
```

The compose file pins `:latest`, so re-tagging is enough — no YAML edit.

## Manual fallback

If the script breaks, run the steps by hand:

```sh
# Local
docker build -t taskwarrior-webui:$(date +%Y%m%d) -t taskwarrior-webui:latest .
docker save taskwarrior-webui:latest | gzip | ssh $VPS_HOST "gunzip | docker load"

# VPS
ssh $VPS_HOST
cd $COMPOSE_PATH
docker compose up -d --force-recreate
docker compose logs -f --tail=50
docker image prune -f
```

## Image hygiene

- Keep `:latest` and the most recent `:YYYYMMDD`. They share layers, so two tags is ~808 MB total, not 1.6 GB.
- Prune old date tags periodically:

  ```sh
  ssh "$VPS_HOST" "docker image ls taskwarrior-webui --format '{{.Tag}}' \
      | grep -E '^[0-9]{8}$' | sort -r | tail -n +4 \
      | xargs -r -I{} docker image rm taskwarrior-webui:{}"
  ```

  Keeps the 3 most recent, drops the rest.

## Notes

- `Dockerfile` pulls `task3` from Alpine `edge/community`, so builds produce a Taskwarrior v3 image. v2 and v3 task data are **not** cross-compatible — do not point a v3 container at v2 data.
- `docker-compose.yml` lives on the VPS only; it is not tracked in this repo.
- The upstream CI workflow (`.github/workflows/build-and-publish.yml`) publishes to `dcsunset/taskwarrior-webui` and is irrelevant for this fork's deploys.
