FROM oven/bun:alpine AS base

RUN apk update && apk upgrade --no-cache
RUN apk add --no-cache curl

WORKDIR /bookshop-server

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

RUN mkdir -p /bookshop-server/data && \
  chown bun:bun /bookshop-server/data

COPY . .

FROM base AS server
USER bun
CMD ["bun", "src/server.ts"]

FROM base AS worker
USER bun
CMD ["bun", "src/worker.ts"]

FROM base AS cron
RUN apk add --no-cache sqlite mongodb-tools
RUN curl -sSfL "https://cronitor.io/install-linux?sudo=0" \
  -o /tmp/cronitor-install.sh && \
  sh /tmp/cronitor-install.sh && \
  rm /tmp/cronitor-install.sh
ENV TZ=UTC
# BusyBox crond needs root privileges and root-owned crontabs.
USER root
CMD ["/bin/sh", "/bookshop-server/docker/cron/entrypoint.sh"]
