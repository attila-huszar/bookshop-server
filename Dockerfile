FROM oven/bun:alpine AS base

RUN apk update && apk upgrade --no-cache
RUN apk add --no-cache sqlite

WORKDIR /bookshop-server

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .

FROM base AS server
CMD ["bun", "src/app.ts"]

FROM base AS worker
CMD ["bun", "worker:email"]

FROM base AS cron
RUN apk add --no-cache curl bash mongodb-tools
RUN curl -s "https://cronitor.io/install-linux?sudo=0" | sh
RUN chmod +x /bookshop-server/docker/cron/entrypoint.sh
CMD ["/bookshop-server/docker/cron/entrypoint.sh"]
