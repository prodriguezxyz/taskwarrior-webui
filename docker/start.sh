#!/bin/sh

export NODE_ENV=production

if [ "${AUTH_MODE:-cloudflare}" = "cloudflare" ]; then
	if [ -z "$CF_ACCESS_TEAM_DOMAIN" ] || [ -z "$CF_ACCESS_AUD" ]; then
		echo "AUTH_MODE=cloudflare requires CF_ACCESS_TEAM_DOMAIN and CF_ACCESS_AUD" >&2
		exit 1
	fi
fi

mkdir -p /run/nginx
cd /src/backend
npm start &
nginx -g 'daemon off;'
