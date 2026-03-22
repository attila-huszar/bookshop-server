FROM oven/bun:alpine AS base

RUN apk update && apk upgrade --no-cache
RUN apk add --no-cache sqlite curl
RUN addgroup -S app && adduser -S -u 1000 -G app app

WORKDIR /bookshop-server

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .
RUN mkdir -p /bookshop-server/docker/cron/crontabs && \
  chown -R app:app /bookshop-server

FROM base AS server
USER app
CMD ["bun", "src/app.ts"]

FROM base AS worker
USER app
CMD ["bun", "worker:email"]

FROM base AS cron
RUN apk add --no-cache bash mongodb-tools
RUN curl -sSfL "https://cronitor.io/install-linux?sudo=0" \
  -o /tmp/cronitor-install.sh && \
  sh /tmp/cronitor-install.sh && \
  rm /tmp/cronitor-install.sh
RUN chmod +x /bookshop-server/docker/cron/entrypoint.sh && \
  mkdir -p /bookshop-server/docker/cron/crontabs && \
  chown -R app:app /bookshop-server/docker/cron
USER app
CMD ["/bin/sh", "/bookshop-server/docker/cron/entrypoint.sh"]
