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

[![Better Stack Badge](https://uptime.betterstack.com/status-badges/v2/monitor/1vrpa.svg)](https://uptime.betterstack.com/?utm_source=status_badge)
Deployed on AWS EC2, with Docker and ngrok for https

🛠️ [Service Status](https://bookshop.betteruptime.com/)

👉 [Bookshop Frontend](https://github.com/attila-huszar/bookshop-client)

## Learning goals and architecture

A full-stack demo built to learn custom Stripe PaymentIntents and compare SQLite/Drizzle with MongoDB/Mongoose. Both databases implement the same checkout/payment/email use cases; this is intentionally not a hosted Checkout integration or a production commerce platform.

- The API validates requests and owns order snapshots; Stripe owns payment status.
- Order/account changes and their email intents commit together using a transactional outbox.
- A long-lived email worker relays committed intents to BullMQ and sends SMTP mail. The API does not open Redis/SMTP connections.
- A separate maintenance process cleans up expired account data and reconciles missed/stale Stripe updates.
- Public/CMS response mappers hide database internals and account tokens. Hono centrally formats HTTP errors.

The admin CMS **Orders** tab expands each order's notification history using `GET /api/cms/email-outbox` with its exact `paymentId` and validated `page`, `limit`, `type`, `status`, and `search` filters. Both database adapters match customer and admin notifications to that payment, then filter and paginate summaries; payloads, account links, lease tokens, and raw provider errors stay private. Account emails are outside the order view. The worker records Sending, Retrying, Sent, Skipped, and Failed separately from queue publication. Sent means SMTP accepted the message. Historical Processed rows have no recorded delivery outcome. This endpoint is read-only; there is no resend/delete action.

CMS **Soft delete** uses `DELETE /api/cms/orders` with `{ orderIds }` and `DELETE /api/cms/users` with `{ userIds }`. Both retain the record and set `deletedAt`; `PATCH /api/cms/restore/orders` and `PATCH /api/cms/restore/users` accept the same ID lists and clear it. Commands return the number of changed records. **Show deleted orders/users** switches to deleted records and offers **Restore**. Only CMS responses include the deletion timestamp. Books and authors keep permanent deletion, labelled **Hard delete**.

Authentication loads the active user once per request and shares it through internal request context. Logout clears refresh/payment cookies even for expired or deleted accounts, without authenticating or refreshing the session.

Soft-deleted orders remain available to checkout/payment lookups, customer history, reconciliation, and queued order emails. Deleted users cannot log in, refresh a session, access authenticated endpoints, update their account, or receive verification/reset emails; their email address stays reserved and their orders remain retained. The last active admin cannot be soft deleted. Restore a user before editing it. Maintenance also soft deletes expired unverified accounts; an admin must verify or correct an expired unverified account before it can log in.

See [Architecture and complete checkout flow](docs/architecture.md) for identifiers, transactions, retries, cache ownership, and demo limitations. [AGENTS.md](AGENTS.md) contains coding-agent instructions rather than end-user setup instructions.

### Local development

Keep `bookshop-server` and `bookshop-client` as sibling directories. Install Bun, Node.js 22.12+, and Docker; start Docker Desktop/the Docker daemon. Install server dependencies with `bun install --frozen-lockfile` and client dependencies with `npm ci`. Configure **both** repositories' `.env` files with development credentials and Stripe test keys.

From either repository:

```sh
npm run dev
# Or: bun dev

# First boot of a fresh demo database only:
npm run dev:setup
# Or: bun dev:setup
```

The package scripts run local Vite alongside `docker compose up`. The API and worker use Bun watch/restart mode; Redis, cron, Mongo (when selected), and the existing logging/ingress services stay in the same Compose file. No separate launcher or development Compose file is required.

Choose exactly one database in the server `.env` using `COMPOSE_PROFILES=sqlite` or `COMPOSE_PROFILES=mongo`; Compose sets the API/worker database automatically. Both dev and normal Docker commands use the same project's volumes. Setup migrates/seeds explicitly, never deletes data, and should not be repeated against an already-seeded database.

Keep URLs aligned manually: the default client is `http://localhost:5173`, and the API is `http://localhost:5000/api`. If the API's `PORT` changes, update the client's `VITE_SERVER_URL` too. Vite uses a strict port so it cannot silently switch away from the configured client origin. The client-only command is `npm run dev:client`.

Ctrl+C stops both processes, and the dev script's teardown stops Compose containers without removing volumes. Run one dev session at a time. Restart after changing dependencies or environment files. Development disables the ngrok tunnel; the existing Loki Docker plugin requirement still applies.

Recreating the demo database changes account identifiers. Old sessions expire automatically: a missing authenticated profile returns 401, and refresh clears its cookie instead of issuing a token for the removed account. Sign in again with the freshly seeded account.

Forward Stripe test webhooks to `http://localhost:5000/webhooks/stripe` using Stripe CLI and set its signing secret in `STRIPE_WEBHOOK_SECRET`. Test payments through the custom client checkout; generic CLI-triggered PaymentIntents without this application's metadata are deliberately ignored.

Stopping the local tunnel tests missed webhook delivery. Payments can still succeed, and scheduled reconciliation reads Stripe directly to recover the local order and its confirmation emails. Other enabled webhook destinations in the same Stripe account can still receive those events; use separate Stripe sandboxes for servers with independent databases to avoid another instance reporting a missing local order.

### Checks

```sh
bun run typecheck
bun run lint
bun run format:check
bun test
docker compose config --quiet
```

The tests use in-memory SQLite and mocks for external providers/Mongo sessions; they do not send real emails or charge cards. Complete a live Mongo/Redis/SMTP smoke test before deployment.

## Docker Compose Setup

### Service architecture

- `server` / `server-with-mongo`: HTTP API
- `worker` / `worker-with-mongo`: database outbox relay + BullMQ/SMTP email worker
- `cron` / `cron-with-mongo`: scheduled maintenance and backup jobs

All services are built from one multi-target Dockerfile (`server`, `worker`, `cron`) to keep dependency layers shared and service responsibilities isolated.

### Initial setup vs normal run

`SETUP=true` enables explicit initialization through `docker/entrypoint.sh` inside the API container before starting its process:

- SQLite: migrate, then seed.
- MongoDB: seed only.
- Normal startup: neither.

Select `COMPOSE_PROFILES=sqlite` (the template default) or `COMPOSE_PROFILES=mongo` in the server `.env`. Use one profile at a time: both API services use the `api` network alias and publish the same port. Do not add `--profile mongo` while `COMPOSE_PROFILES=sqlite` is set, because Compose enables both.

From the server repository:

```sh
bun run docker:setup      # First boot of a fresh database
docker compose up --build # Normal Docker-only run
bun run docker:dev        # Docker-only run with API/worker reloads
```

The package scripts also work via `npm run`. Plain Docker startup uses Compose directly; `docker:setup` and `docker:dev` set initialization/reload flags through `cross-env` on Windows and POSIX. Keep `SETUP` unset for subsequent starts; setup is never a database reset.

`BUN_RUN_MODE` defaults to `run` for ordinary Docker startup; `docker:dev` sets it to `--watch`. Reloads restart only the API/worker process, so migration/seed is not repeated on source changes.

`COMPOSE_PROJECT_NAME` (template default `bookshop`) namespaces containers, networks, and volumes. Dev and normal Docker startup use this same configured project. No volumes are removed by any startup script.

Inside Compose, the API always listens on `5000`. `PORT` selects the host port, so changing it does not affect Nginx or health checks.

## Ingress and Base Paths

Nginx is the ingress entrypoint on port `80`:

- `/` -> backend app (`api:5000`, shared alias for either database profile)
- `/grafana/` -> Grafana UI (`grafana:3000`)

When ngrok is enabled (`NGROK_AUTHTOKEN` set), it forwards to `nginx:80`, so your HTTPS base URL is the ngrok URL logged at startup (`Ingress established at: <url>`).

Use these paths on that base URL:

- `https://<your-ngrok-domain>/api/...`
- `https://<your-ngrok-domain>/health`
- `https://<your-ngrok-domain>/grafana`

## Logs in Grafana

Container logs are shipped to Loki through Docker's Loki log driver.

### Install Docker Loki log driver

Install the Grafana Loki Docker plugin before starting this stack. The driver runs on the Docker host, so it uses Loki's published port at `http://127.0.0.1:3100`; Compose service DNS names are for containers on the Compose network.

Install the plugin:

```bash
docker plugin install grafana/loki-docker-driver:latest \
  --alias loki --grant-all-permissions
```

Verify the plugin is installed:

```bash
docker plugin ls
```

Quick test (push a test log to a localhost Loki):

```bash
docker run --rm --log-driver=loki \
  --log-opt loki-url="http://localhost:3100/loki/api/v1/push" \
  busybox echo "hello loki"
```

Use the `loki` driver in `docker-compose.yml`:

```yaml
services:
  server:
    image: your-image
    logging:
      driver: loki
      options:
        loki-url: 'http://127.0.0.1:3100/loki/api/v1/push'
        loki-retries: '3'
```

Or set the Docker daemon default logger (`/etc/docker/daemon.json`):

```json
{
  "log-driver": "loki",
  "log-opts": {
    "loki-url": "http://127.0.0.1:3100/loki/api/v1/push"
  }
}
```

After changing `daemon.json` restart Docker (Docker Desktop: restart from UI).

Notes:

- Loki stores its logs and indexes under `/loki` in the `loki-data` volume.
- On Docker Desktop for Windows, run the `docker plugin install` command from PowerShell or WSL with the Docker context set to Docker Desktop.

- Open Grafana at `http://localhost/grafana/` (or `https://<your-ngrok-domain>/grafana/`)
- Default credentials: `admin` / `admin`
- In Explore, query by `job` label (for example: `server`, `worker`, `cron`, `mongodb`)

## Scheduled Jobs (Cron)

`cron` and `cron-with-mongo` run dedicated crontab files from `docker/cron`.

The cron container runs BusyBox `crond` as root with root-owned crontabs. Its timezone is UTC, and scheduler/job output goes to container logs.

- SQLite profile (`docker/cron/sqlite.crontab`)
  - every 10 min: order reconciliation and reset-token / unverified-user cleanup
  - daily at 02:00: SQLite backup
- Mongo profile (`docker/cron/mongo.crontab`)
  - every 10 min: order reconciliation and reset-token / unverified-user cleanup
  - daily at 02:30: Mongo backup

Run maintenance manually inside the cron container for the active database profile. These commands use the same locking, timeout, and monitoring wrapper as scheduled jobs:

```sh
# SQLite profile:
docker compose exec cron sh docker/cron/jobs/maintenance.sh
# Mongo profile:
docker compose exec cron-with-mongo sh docker/cron/jobs/maintenance.sh
```

Each task is isolated: cleanup failures do not prevent reconciliation, and a failed task or order makes the process exit nonzero.

Reconciliation checks at most 100 orders per run, oldest attempt first. Orders modified in the last five minutes are left alone; routine pending checks are spaced 30 minutes apart and terminal audits run daily. Failed orders retry with at least five minutes between attempts. The ten-minute cron schedule normally makes three failed checks span about 20 minutes. Each order stores attempt/success timestamps, a consecutive failure count, and the current alert ID; there is no separate reconciliation table.

Linked orders use Stripe's current PaymentIntent. Unlinked drafts are recovered by searching their `orderId` and `checkoutRequestId` metadata and then retrieving the matching intent. Search is eventually consistent, so no match is retried later; multiple matches, amount/currency mismatches, and attempted downgrades of paid orders are logged for manual review. The job never creates, confirms, captures, cancels, or refunds payments.

Webhooks and reconciliation share conditional order updates and first-payment notifications. Reconciliation preserves real webhook event markers, protects against concurrent/stale updates, and preserves existing account emails. `paidAt` is never cleared. The atomic first-paid transition writes the customer confirmation and admin **New order** intents to the transactional outbox, using stable IDs. Payment creation/linking sends no admin email. A missed webhook repaired by reconciliation sends the same New order notification once. The worker relays them to BullMQ; SMTP delivery remains at-least-once.

Admin **Reconciliation failed** emails are queued only after three consecutive failed checks of an order. They highlight a safe explanation, order/payment references, failed-check count, continuing retry policy, and a direct Stripe Dashboard link in the correct test/live mode. Ordinary declined, canceled, or abandoned checkouts do not trigger an error mail. Paid orders can still alert on financial/audit errors. The worker compares the queued alert ID with the order before sending. Successful reconciliation resets the failure count and clears the alert ID, making pending alerts obsolete. An unresolved failure sends one alert; failures after recovery can create a new alert ID. The CMS order email history includes the reconciliation reason separately from publication/SMTP failures.

If the database/outbox itself is unavailable, the failure remains visible in logs and the maintenance exit status/Cronitor. Email cannot be guaranteed during an outage of the infrastructure it uses.

The Docker wrapper uses a nonblocking file lock to prevent overlapping maintenance runs and a nine-minute timeout. Reconciliation stops starting new checks after eight minutes to leave time for shutdown; Stripe reads use a ten-second request timeout and one network retry. Maintenance shutdown closes its database connection; email intents are already durable. The separate worker stops its relay before closing the consumer, producer, SMTP pool, and database. Keep a single cron scheduler per database; the file lock is local to that container.

If cron logs show `unknown shorthand flag: 's' in -s`, maintenance never started: Cronitor parsed the timeout command's flags. The monitoring wrapper passes its environment through `CRONITOR_ENV` and uses `--` before the monitor key to preserve the wrapped command's arguments.

Webhook failures are logged and return an error so Stripe can retry. Maintenance recovers existing local orders, including unlinked drafts. A payment with no local order at all requires investigation in logs/Stripe Dashboard; this demo does not store or automatically email those orphan payments. Failed maintenance checks still reach Cronitor through the nonzero exit status.

The initial SQLite migration/snapshot and Mongo order schema include the reconciliation fields. This version starts with fresh demo databases and queues.

## Cronitor Integration

Cron jobs are wrapped with `cronitor exec` when `CRONITOR_API_KEY` is set.

- install happens in the `cron` image build via installer script download from `https://cronitor.io/install-linux?sudo=0`
- API key is loaded from env (`CRONITOR_API_KEY`)
- monitor keys for job scripts:
  - `maintenance`
  - `sqlite-backup`
  - `mongo-backup`

If `CRONITOR_API_KEY` is empty, cron jobs still run normally without monitoring.

## Backups

SQLite backups create a file snapshot of `DB_SQLITE_FILE`; Mongo backups create a `mongodump` archive (`.archive.gz`). Run a backup inside the cron container for the active database profile:

```sh
# SQLite profile:
docker compose exec cron sh docker/cron/jobs/backup_sqlite.sh
# Mongo profile:
docker compose exec cron-with-mongo sh docker/cron/jobs/backup_mongo.sh
```

Defaults are defined in `src/config/env.ts` (via `Bun.env.BACKUP_DIR` and `Bun.env.BACKUP_RETENTION_DAYS`):

- `BACKUP_DIR` defaults to `data/backups`
- `BACKUP_RETENTION_DAYS` defaults to `7`

## Email Queue Persistence

Redis stores BullMQ email jobs in the `redis_data` volume with AOF persistence and `appendfsync always`, prioritizing durability over throughput. Workers wait for Redis health and API initialization; the API does not depend on Redis health. A committed unpublished intent remains in the database during a Redis outage.

Outbox rows and job history are retained in this demo for inspection and deduplication. See [delivery limits and operational follow-ups](docs/architecture.md#delivery-limits) before pruning history or restoring queue/database volumes. A processed outbox entry means accepted by Redis (or an obsolete alert discarded), not SMTP delivery; losing Redis storage after publication is not automatically repaired.
