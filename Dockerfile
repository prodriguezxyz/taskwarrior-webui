FROM alpine:latest

RUN echo "https://dl-cdn.alpinelinux.org/alpine/v3.20/main" > /etc/apk/repositories
RUN echo "https://dl-cdn.alpinelinux.org/alpine/edge/community" >> /etc/apk/repositories
RUN apk --no-cache add nodejs npm nginx task3 python3 build-base

COPY ./frontend /src/frontend
COPY ./backend /src/backend
COPY ./nginx/nginx.conf /etc/nginx/nginx.conf
COPY ./nginx/server.conf /etc/nginx/conf.d/default.conf
COPY ./docker/start.sh /start.sh

ENV TASKRC="/.taskrc"
ENV TASKDATA="/.task"

# Cloudflare Access auth — set via docker-compose .env at runtime.
# AUTH_MODE defaults to "cloudflare" in backend/src/auth.ts and docker/start.sh
# when unset, so it isn't baked here (BuildKit flags ENV names containing "AUTH").
ENV CF_ACCESS_TEAM_DOMAIN=""
ENV CF_ACCESS_AUD=""

# Fix npm build
ENV NODE_OPTIONS="--openssl-legacy-provider"

# Frontend
RUN cd /src/frontend && npm ci \
	&& npm run build && npm run export \
	&& cp -r /src/frontend/dist /static \
	&& rm -r /src/frontend

# Backend
RUN cd /src/backend && npm ci \
	&& npm run build \
	&& npm prune --production \
	&& rm -r /src/backend/src

EXPOSE 80

# Taskwarrior data volume
VOLUME [ "/.task", "/.taskrc" ]

CMD ["/start.sh"]
