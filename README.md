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

Install Bun, Node.js 26, and Docker. Start Docker and keep `bookshop-server` and `bookshop-client` as sibling directories.

From the server directory:

```sh
bun install --frozen-lockfile
cp .env.template .env
cd ../bookshop-client
npm ci
cp .env.template .env
cd ../bookshop-server
```

Install the logging plugin once:

```sh
docker plugin install grafana/loki-docker-driver:latest --alias loki --grant-all-permissions
```

Configure the environment files:

- Server: set admin credentials, cookie/JWT secrets, Stripe test keys, SMTP credentials, and AWS S3 settings using `.env.template`.
- Database: select `DB_REPO=MONGO` or `SQLITE`. For Atlas, replace the URI placeholders with URL-encoded credentials and your cluster hostname, and allow your outgoing IP in Atlas Network Access. Use `bookshop-dev` locally and `bookshop-prod` in production, with separate database-scoped users. Keep `MONGO_BACKUP_MODE=logical` for Atlas M0.
- Client: set `VITE_STRIPE_PUBLIC_KEY` from the same Stripe account and keep the local URL defaults aligned with the server.

## Local development

Run the Stripe CLI in a separate terminal:

```sh
stripe listen --forward-to http://localhost:5000/webhooks/stripe
```

Set its signing secret as `STRIPE_WEBHOOK_SECRET` in the server `.env`.

Stop existing database writers, then initialize the selected database from either repository:

```sh
bun run setup
```

MongoDB setup runs on the host; SQLite setup uses the shared Docker volume. Setup preserves existing data and admin passwords. See [database setup](docs/architecture.md#databases-and-setup) for constraints.

Start the client and Docker services:

```sh
bun run dev
```

Use `bun run dev` for subsequent starts; startup never seeds the database. Ctrl+C stops the session and preserves stored data. Before testing checkout, publish English and Hungarian terms in the admin CMS under **Terms and Conditions**.

| Service | Local URL                   |
| ------- | --------------------------- |
| Shop    | <http://localhost:5173>     |
| API     | <http://localhost:5000/api> |
| Grafana | <http://localhost/grafana/> |

Grafana's default login is `admin` / `admin`; query logs by the `job` label, such as `server` or `worker`.

For a backend-only session, run `docker compose up --build` from the server directory. Set `NGROK_AUTHTOKEN` to enable its optional HTTPS tunnel; the URL is logged at startup.
