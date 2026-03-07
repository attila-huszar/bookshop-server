FROM oven/bun:alpine AS base

RUN apk update && apk upgrade --no-cache
RUN apk add --no-cache sqlite curl

WORKDIR /bookshop-server

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .

FROM base AS server
CMD ["bun", "src/app.ts"]

FROM base AS worker
CMD ["bun", "worker:email"]

FROM base AS cron
RUN apk add --no-cache bash mongodb-tools
RUN curl -sSfL "https://cronitor.io/install-linux?sudo=0" \
  -o /tmp/cronitor-install.sh && \
  sh /tmp/cronitor-install.sh && \
  rm /tmp/cronitor-install.sh
RUN chmod +x /bookshop-server/docker/cron/entrypoint.sh
CMD ["/bin/sh", "/bookshop-server/docker/cron/entrypoint.sh"]
