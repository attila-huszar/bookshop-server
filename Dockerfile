FROM oven/bun:slim

RUN apt-get update && apt-get install -y --no-install-recommends \
  && rm -rf /var/lib/apt/lists/*

USER bun
WORKDIR /opt/bookshop-be

COPY package.json bun.lockb ./
RUN bun install --frozen-lockfile

COPY . .

CMD ["bun", "dev"]
