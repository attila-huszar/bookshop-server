FROM oven/bun:alpine

RUN apk update && apk upgrade --no-cache

RUN apk add --no-cache sqlite

WORKDIR /bookshop-server

COPY package.json bun.lockb ./
RUN bun install --frozen-lockfile

COPY . .

CMD ["bun", "src/app.ts"]
