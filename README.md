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

## Docker Compose Setup

### Initial setup vs normal run

`SETUP` controls one-time initialization inside the app container command:

- SQLite profile (`server`): runs `bun migrate && bun seed`
- Mongo profile (`server-with-mongo`): runs `bun seed`
- If `SETUP` is unset/empty, startup skips migrate/seed

`sqlite` is the default Docker Compose profile, so `docker compose up` runs the SQLite stack by default.

Use `SETUP=true` only for first boot (or when you intentionally want to reseed).

Initial setup commands:

```sh
SETUP=true docker compose up
```

or with MongoDB

```sh
SETUP=true docker compose --profile mongo up
```

Normal run commands (after setup):

```sh
docker compose up
```

or with MongoDB

```sh
docker compose --profile mongo up
```

`DB_REPO` is selected automatically by Compose based on the service profile (`SQLITE` for sqlite services, `MONGO` for mongo services).

<details>
<summary>Windows cmd / PowerShell</summary>

```cmd
set SETUP=true && docker compose up
```

```powershell
$env:SETUP = "true"; docker compose up
```

</details>

## Ingress and Base Paths

Nginx is the ingress entrypoint on port `80`:

- `/` -> backend app (`server:5000`)
- `/grafana/` -> Grafana UI (`grafana:3000`)

When ngrok is enabled (`NGROK_AUTHTOKEN` set), it forwards to `nginx:80`, so your HTTPS base URL is the ngrok URL logged at startup (`Ingress established at: <url>`).

Use these paths on that base URL:

- `https://<your-ngrok-domain>/api/...`
- `https://<your-ngrok-domain>/health`
- `https://<your-ngrok-domain>/grafana`

## Logs in Grafana

Container logs are shipped to Loki through Docker's Loki log driver.

- Open Grafana at `http://localhost/grafana/` (or `https://<your-ngrok-domain>/grafana/`)
- Default credentials: `admin` / `admin`
- In Explore, query by `job` label (for example: `server`, `server-with-mongo`, `worker`, `worker-with-mongo`, `mongodb`)
