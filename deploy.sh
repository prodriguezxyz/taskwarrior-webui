#!/usr/bin/env bash
# Build, transfer and restart taskwarrior-webui on the VPS.
#
# Usage:
#   ./deploy.sh              # build + transfer + restart
#   ./deploy.sh --skip-build # reuse existing :latest
#   ./deploy.sh --no-restart # transfer only, restart manually later
#
# Config via env vars (can also live in .deploy.env, gitignored):
#   VPS_HOST          ssh alias or user@host       (required)
#   COMPOSE_PATH      path to docker-compose.yml   (required)
#   IMAGE_NAME        default: taskwarrior-webui

set -euo pipefail

[ -f .deploy.env ] && source .deploy.env

: "${VPS_HOST:?set VPS_HOST in env or .deploy.env}"
: "${COMPOSE_PATH:?set COMPOSE_PATH in env or .deploy.env}"
IMAGE_NAME="${IMAGE_NAME:-taskwarrior-webui}"

SKIP_BUILD=0
NO_RESTART=0
for arg in "$@"; do
    case "$arg" in
        --skip-build) SKIP_BUILD=1 ;;
        --no-restart) NO_RESTART=1 ;;
        -h|--help)
            sed -n '2,13p' "$0" | sed 's/^# \{0,1\}//'
            exit 0
            ;;
        *) echo "unknown flag: $arg" >&2; exit 2 ;;
    esac
done

DATE_TAG=$(date +%Y%m%d)

if [ "$SKIP_BUILD" -eq 0 ]; then
    echo "==> building $IMAGE_NAME:$DATE_TAG and :latest"
    docker build -t "$IMAGE_NAME:$DATE_TAG" -t "$IMAGE_NAME:latest" .
fi

echo "==> transferring $IMAGE_NAME:latest to $VPS_HOST"
docker save "$IMAGE_NAME:latest" | gzip | ssh "$VPS_HOST" "gunzip | docker load"

if [ "$NO_RESTART" -eq 1 ]; then
    echo "==> skipped restart (--no-restart)"
    exit 0
fi

echo "==> restarting on $VPS_HOST:$COMPOSE_PATH"
ssh "$VPS_HOST" "cd '$COMPOSE_PATH' && docker compose up -d --force-recreate && docker image prune -f"

echo "==> verifying"
ssh "$VPS_HOST" "cd '$COMPOSE_PATH' && docker compose ps"

echo "==> done. Recent logs:"
ssh "$VPS_HOST" "cd '$COMPOSE_PATH' && docker compose logs --tail=30"
