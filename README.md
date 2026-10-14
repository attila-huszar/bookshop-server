# Bookshop Backend

[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=fff)](https://www.typescriptlang.org/)
[![Bun](https://img.shields.io/badge/Bun-000?logo=bun)](https://bun.sh/)
[![Hono](https://img.shields.io/badge/Hono-E36002?logo=hono&logoColor=fff)](https://hono.dev/)
[![Stripe](https://img.shields.io/badge/Stripe-635BFF?logo=stripe&logoColor=fff)](https://stripe.com/)
[![Drizzle](https://img.shields.io/badge/Drizzle-C5F74F?logo=drizzle&logoColor=000)](https://orm.drizzle.team/)
[![SQLite](https://img.shields.io/badge/SQLite-003B57?logo=sqlite)](https://www.sqlite.org/)
[![MongoDB](https://img.shields.io/badge/MongoDB-47A248?logo=mongodb&logoColor=fff)](https://www.mongodb.com/)
[![Redis](https://img.shields.io/badge/Redis-FF4438?logo=redis&logoColor=fff)](https://redis.io/)
[![Docker](https://img.shields.io/badge/Docker-2496ED?logo=docker&logoColor=fff)](https://www.docker.com/)
[![Grafana](https://img.shields.io/badge/Grafana-F46800?logo=grafana&logoColor=fff)](https://grafana.com/)
[![Zod](https://img.shields.io/badge/Zod-3E67B1?logo=zod&logoColor=fff)](https://zod.dev/)
[![ngrok](https://img.shields.io/badge/ngrok-1F1E37?logo=ngrok)](https://ngrok.com/)

[![CI](https://github.com/attila-huszar/bookshop-server/actions/workflows/bun.yml/badge.svg)](https://github.com/attila-huszar/bookshop-server/actions/workflows/bun.yml)
[![CodeQL](https://github.com/attila-huszar/bookshop-server/actions/workflows/github-code-scanning/codeql/badge.svg)](https://github.com/attila-huszar/bookshop-server/actions/workflows/github-code-scanning/codeql)

[![Cronitor Badge](https://cronitor.io/badges/lsZIJ8/production/JszuBy9vjjd8K0pXvs_TdX1Fpxs.svg)](https://bookshop.cronitorstatus.com/)

🛠️ [Service Status](https://bookshop.cronitorstatus.com/)

👉 [Bookshop Frontend](https://github.com/attila-huszar/bookshop-client)

A TypeScript API built with Bun and Hono for the Bookshop demo. The project explores custom Stripe checkout and two interchangeable database implementations: SQLite/Drizzle and MongoDB/Mongoose.

## Main capabilities

- Book and author catalogue, search, filters, and news.
- Accounts with email verification, password reset, profiles, and order history.
- Guest and account checkout using Stripe PaymentIntents and the client's Payment Element.
- Admin CMS for catalogue, users, orders, and email delivery history.
- Background email delivery, payment reconciliation, scheduled backups, and logs in Grafana.

## Setup

Install Bun, Node.js 22.12+, and Docker, then start Docker Desktop or the Docker daemon. Keep `bookshop-server` and `bookshop-client` as sibling directories.

From the server directory, install dependencies and create both environment files:

```sh
bun install --frozen-lockfile
cp .env.template .env
cd ../bookshop-client
npm ci
cp .env.template .env
cd ../bookshop-server
```

Install the Loki logging plugin once:

```sh
docker plugin install grafana/loki-docker-driver:latest --alias loki --grant-all-permissions
```

Configure the environment files:

- Server: set `ADMIN_EMAIL`/`ADMIN_PASSWORD`, cookie/JWT secrets, `STRIPE_SECRET` (test key), SMTP credentials, and AWS S3 settings for avatar uploads.
- Database: set exactly one `COMPOSE_PROFILES` value in the server `.env`: `sqlite` (default) or `mongo`.
- Client: set `VITE_STRIPE_PUBLIC_KEY` to the publishable test key from the same Stripe account. Default URLs are `VITE_BASE_URL=http://localhost:5173` and `VITE_SERVER_URL=http://localhost:5000/api`; keep the server's `CLIENT_BASE_URL` aligned.

## Local development

For payment updates, run the Stripe CLI in a separate terminal:

```sh
stripe listen --forward-to http://localhost:5000/webhooks/stripe
```

Set the printed signing secret as `STRIPE_WEBHOOK_SECRET` in the server `.env` before starting.

From either repository, initialize a fresh database and start the app:

```sh
bun run dev:setup
```

For later starts, use `bun run dev`. Setup seeds the catalogue and an admin account using `ADMIN_EMAIL`/`ADMIN_PASSWORD`; run it only for a fresh database. The dev command starts Vite and the Docker services with API/worker reloads. Ctrl+C stops the session and preserves stored data.

| Service      | Local URL                    |
| ------------ | ---------------------------- |
| Shop         | http://localhost:5173        |
| API          | http://localhost:5000/api    |
| Health check | http://localhost:5000/health |
| Grafana      | http://localhost/grafana/    |

Grafana's default login is `admin` / `admin`. In Explore, query logs by the `job` label, such as `server` or `worker`.

For a backend-only session, run `bun run docker:setup` on a fresh database or `docker compose up --build` on subsequent starts, from the server directory. To enable an HTTPS tunnel in this mode, set `NGROK_AUTHTOKEN`; the ngrok URL is logged at startup.

See [Architecture and checkout flow](docs/architecture.md) for database, payment, and email implementation details.
