# Backend architecture

The Bun/Hono backend owns the API, database access, payments, background email, and scheduled jobs. Custom Stripe PaymentIntents and interchangeable SQLite/Drizzle and MongoDB/Mongoose adapters are deliberate learning goals. Browser state and interface behavior belong to the [frontend](../../bookshop-client/docs/architecture.md).

## Process and ownership boundaries

| Component              | Responsibility                                             |
| ---------------------- | ---------------------------------------------------------- |
| `server.ts` / `app.ts` | API lifecycle / Hono routes                                |
| `worker.ts`            | Email relay, BullMQ processing, Redis and SMTP connections |
| Cron jobs              | Maintenance, payment reconciliation, and backups           |
| Controllers / services | HTTP contracts / use-case rules                            |
| Repositories           | Database-specific operations and transaction boundaries    |

Entrypoints validate configuration for their role and explicitly acquire resources. Module imports do not open database connections or construct provider clients. Direct imports keep rendering and worker dependencies out of API/repository flows; `repositories/index.ts` selects the database adapter.

Startup and shutdown are bounded. Signal handlers cover asynchronous startup, cleanup follows reverse acquisition order, and shutdown drains API requests or active email work before closing dependencies. Cron stops scheduling and signals its active jobs. Failed or interrupted one-off jobs exit unsuccessfully.

`/health` reports liveness. `/ready` requires a connected database and complete schema and becomes unavailable during shutdown. Compose gates dependent services on readiness. Redis and SMTP outages do not make API database/outbox writes unavailable.

## Databases and setup

`DB_REPO` selects `SQLITE` or `MONGO` across API, worker, cron, and scripts. `db.ts` coordinates connection attempts, readiness, and failed-startup cleanup. The selected adapter owns its connection and schema initialization; invalid configuration fails without switching databases.

| Concern                       | SQLite / Drizzle                       | MongoDB / Mongoose                         |
| ----------------------------- | -------------------------------------- | ------------------------------------------ |
| Atomic state and email intent | Synchronous SQL transaction            | Explicit shared-session transaction        |
| Concurrent writes             | Unique indexes and conditional updates | Unique indexes and conditional updates     |
| Outbox claim                  | Immediate transaction                  | Atomic `findOneAndUpdate`                  |
| Numeric IDs                   | Auto-increment                         | Counter allocation in the insert's session |

MongoDB requires a replica set and initializes collections/indexes before transactions. Transaction operations execute sequentially on the same session. Compose connects to the configured external MongoDB deployment and provisions no local MongoDB server.

`database/setup.ts` initializes the demo database: SQLite migrations precede schema validation and seeding; MongoDB connection/model initialization precedes seeding. Authors are seeded before books, followed by news and the admin account. Catalogue seeds insert only missing fixed IDs, preserving existing records and allowing retries after partial completion. MongoDB counters advance to at least the highest stored ID and never move backward. The configured admin email is matched case-insensitively: an existing active admin is preserved, including credentials; a non-admin or deleted account is a conflict, never promoted or restored by setup. Setup reports inserted/existing counts and never clears data. Ordinary API startup validates the schema and never seeds.

The `setup` command uses the same explicit `DB_REPO` selection as normal services. Its host entrypoint, `scripts/setup.ts`, validates configuration and launches `database/setup.ts` with Bun for MongoDB or in a temporary container for SQLite. The database entrypoint only owns connection, migrations, seeding, and cleanup; it never launches Docker. Separate entrypoints prevent recursive container launches without command-line mode flags. SQLite uses the same volume as API, worker, and cron. Both processes use the shared lifecycle manager for cancellation and cleanup. Missing or blank variables fail before connecting or launching Docker. Host MongoDB runs must occur with other writers stopped and outside backup windows because they do not participate in Compose's writer coordination.

## Authentication and account lifecycle

Authenticated requests and token refresh require an active, non-deleted account; verification is checked separately. Logout clears session cookies independently of account lookup. Signed guest payment cookies remain separate from account sessions.

Verification and password-reset tokens are consumed through conditional updates requiring the current token, future expiry, and active account. Marking an account verified, including through CMS, clears its verification token and expiry in the same write. The email worker checks the queued token against the current token and expiry. Repeated or superseded tokens cannot change the account.

Users and orders support reversible CMS soft deletion. Deleted account emails remain reserved, and deletion protects the last active admin. Restoring an account retains its identity, password, and verification state. Catalogue deletion is permanent; payment history and order reconciliation remain available after order soft deletion.

## Custom checkout

1. The client supplies an idempotency key for its current attempt. The server binds it to the principal and request contents to derive a unique checkout request ID.
2. Catalogue prices produce an immutable order snapshot. USD unit and discounted unit prices round to cents before multiplying quantities; totals sum integer cents. A mismatch with the client's expected amount returns 409 before draft creation.
3. Concurrent requests resolve to the same persisted draft. Retries reuse its snapshot and checkout request ID, including as Stripe's idempotency key.
4. Stripe creates a PaymentIntent carrying both `orderId` and `checkoutRequestId`. Linking it to the draft is recoverable across timeouts; Stripe and database writes cannot share a transaction. Both metadata fields prevent unrelated payments from matching reused demo order IDs.
5. The client records terms acceptance, then confirms through the Payment Element. Signed webhooks or reconciliation update the local payment snapshot.
6. The first successful payment sets `paidAt` and commits customer confirmation and admin notification intents in the same transaction. A guest without an email has no customer confirmation intent.

Stripe owns payment state. The browser's success display and CMS edits cannot mark an order paid. Once set, `paidAt` is never cleared or silently downgraded.

Payment retrieval and terms acceptance require account authorization or the signed guest payment-session cookie. Account order history matches the account email, including guest purchases using that address; there is no explicit guest-claim workflow.

### Terms publication and acceptance

Terms are immutable, versioned English/Hungarian documents stored in the selected database. Publishing changed content creates a revision; identical content reuses the current version. Public endpoints expose current and archived documents.

Checkout's terms endpoint returns the current document reference and persisted order summary. Acceptance records the version, language, and server timestamp once. Unpublished or changed terms, unauthorized access, and ended checkouts are rejected. The client must resolve changed terms before confirming payment.

CMS may delete only versions unused by any order, including unpaid or soft-deleted orders. Atomic reference checks protect concurrent acceptance/deletion. Deleting the last revision blocks checkout. Terms acceptance is excluded from general order/CMS writes. Confirmation emails do not include the archived terms document; merchant-specific legal content is outside this demo.

## Payment recovery

Webhooks verify signatures and process recognized PaymentIntent events in this application's metadata scope. Duplicate/stale events are rejected or resolved against a fresh Stripe read. Webhooks and reconciliation use conditional database updates with bounded re-reads on concurrent changes.

Maintenance runs every ten minutes and reconciles a bounded batch of existing orders. It retrieves Stripe's current state and validates identity, metadata, amount, and currency. Unlinked drafts are recoverable through their metadata; missing or ambiguous matches remain visible for retry or investigation. Completely missing local orders require manual investigation.

Reconciliation never creates, confirms, captures, cancels, or refunds payments. It preserves webhook event markers and records its own attempt timestamps. Three consecutive failed checks atomically save an alert ID and email intent; successful reconciliation clears the failure state. Webhook failures rely on Stripe retries and do not increment that counter.

## Transactional email outbox

```text
API / webhook / reconciliation
  -> database transaction: state change + email intent
  -> commit
  -> worker relay leases intent
  -> BullMQ accepts stable job ID
  -> relay acknowledges publication
  -> email processor renders snapshot and sends through SMTP
```

An intent insert failure rolls back the associated state change. A Redis outage leaves committed intents available for retry. Relay leases use unique tokens so a stale publisher cannot acknowledge a replacement lease. Republishing the same job ID deduplicates queue acceptance while the job remains in Redis. Publication retries back off with bounded provider requests; SMTP jobs have a fixed retry limit.

Redis reconnects automatically. Recovery monitoring observes the queue connection and both worker connections, reports recovery only when all required connections are ready, and stays quiet during intentional shutdown. SMTP pools replace failed connections; send results determine transport health, and the next successful send reports recovery after a transport failure. Outbox polling continues through database/Redis outages and does not report recovery on a poll that still schedules a failed publication for retry.

Registration, password resets, first-paid transitions, and reconciliation alerts own their email intents inside repository transactions. Generic account/CMS edits and PaymentIntent linking do not send emails. Payloads contain only the data needed for rendering.

The consumer skips obsolete account tokens and resolved reconciliation alerts. Lookup failures remain retryable. CMS email history is scoped to an exact payment ID and separates queue publication from SMTP processing; summaries exclude bodies, account links, and lease tokens. Queue acknowledgement is not proof of delivery.

Publication is at least once. A crash after SMTP acceptance but before job acknowledgement can cause a duplicate send. Redis uses persistent AOF storage and no eviction; retained jobs provide deduplication history. Loss of processed Redis jobs has no automatic outbox replay, and manual replay may duplicate email. Database/provider outages can also prevent alerts from being recorded or sent.

## API response and error contracts

Repositories return internal records; response allowlists expose public/CMS fields and normalize dates/nulls. User responses exclude password hashes and account tokens. CMS order writes accept customer/shipping corrections only; payment state, paid markers, totals, currency, items, and terms acceptance are protected.

API failures use stable application codes and HTTP statuses. Validation responses expose sanitized Zod metadata for localization, without raw input, private parameters, or internal messages. Expected 4xx responses remain quiet; server failures are logged with safe diagnostics. Logs redact credentials and omit query strings, cookies, and authorization headers.

## Image storage and observability

Sharp validates and normalizes uploaded images to WebP with input, pixel, and processing limits. Random S3 keys separate avatar/product images by database. Maintenance removes generated images older than 24 hours only when unreferenced, including by soft-deleted users; it rechecks references before deletion and excludes external URLs and other namespaces.

Compose sends service logs to Loki under `job` labels; browser reports pass through the API with `source="frontend"`. Application loggers emit indented JSON at every level, including errors; the Loki pipeline joins multiline entries before extracting labels. Grafana provides inspection, and Cronitor monitors scheduled runs. Loki's own Docker logs use the local driver. Container logs rotate, and shipping retries/timeouts are bounded.

At the default info level, logs emphasize service lifecycle, recovery, meaningful maintenance/payment activity, and failures. Successful one-off jobs clean up without a shutdown message; interruptions and failures remain visible. Routine email delivery/skip and transport readiness details use debug, while delivery outcomes remain in the outbox records. Helpers propagate errors to their request/job owner rather than logging and rethrowing them. Expected 4xx responses are quiet in both the application and proxy access logs; proxy 5xx responses remain errors.

Expected payment failures are business outcomes at info; ignored stale/duplicate/unsupported webhooks and reconciliation batch summaries use debug. Retryable email delivery failures use warn, and terminal failures use error, with attempt counts for diagnosis. Application logs use structured metadata for identifiers and error details. Emoji are reserved for operational attention: ⚠️ for dependency outages, ❌ for delivery/process failures, blocked email infrastructure, or payment integrity failures requiring investigation, and ✅ for recovery from a reported outage. Routine startup, readiness, delivery, setup, and payment success messages have no emoji.

## Database backups

The backup job creates a private temporary archive, uploads it to S3, verifies its size and SHA-256 checksum for the uploaded version, then applies retention. Multipart checksums match the uploader's part boundaries. Failed verification never triggers pruning. Cancellation terminates dump children and settles cancelled upload requests before cleanup; cleanup requests remain independent of job cancellation.

| Database/mode   | Archive and consistency                                                                          |
| --------------- | ------------------------------------------------------------------------------------------------ |
| SQLite          | Online `sqlite3 .backup`, including committed WAL data, compressed as `.sqlite.gz`               |
| Mongo `logical` | Database-scoped `mongodump` archive; all writers must be paused for cross-collection consistency |
| Mongo `oplog`   | Full replica-set archive with oplog capture; requires a deployment supporting oplog access       |

`MONGO_BACKUP_MODE` defaults to `logical`, suitable for Atlas M0, and requires an explicit database in `DB_MONGO_URL`. Logical backups drain and stop API/worker processes, and wait for active maintenance/setup jobs before dumping. The API and worker remain offline for the entire dump, then restart before S3 upload and retention. New writers wait outside the database. A failed drain or timeout aborts the backup; dump failure/cancellation also releases the pause. Oplog backups preserve authentication while removing the database path and do not pause writers; there is no fallback between modes.

Compose coordinates writers on one host through a shared local runtime volume. This is not a distributed deployment contract; network filesystems and multiple hosts require a separately validated coordination design. Direct/manual writers must use `docker/database-access.sh job`; external clients must be stopped separately.

Writer processes inherit their shared lock so a supervisor crash cannot permit a dump while the application still runs. Descendants must stay in the supervised process group and finish database work before acknowledging shutdown; detached database writers are unsupported. The application acknowledges cleanup with a newline-terminated exit status. The shell enforces a 50-second drain deadline, terminates an unresponsive group, and rejects the dump. `BOOKSHOP_DATABASE_DRAIN_TIMEOUT_SECONDS` can shorten or adjust that deadline; it must leave room for the application's shutdown bound and expire before the backup's 60-second acquisition timeout. Kernel locks release when their holders exit, and the cleanup acknowledgement supports Bun's development watcher.

Archives are private objects under `backups/sqlite/` or `backups/mongo/`. Cron wrappers prevent overlapping runs in their container and impose a deadline. Scratch files are removed after success or failure; abandoned multipart uploads also require bucket lifecycle cleanup.

Retention defaults to 7 occupied UTC days, 4 Monday-start weeks, and 12 calendar months, keeping the latest backup in each period. The union of those selections, the current upload, and all archives less than 24 hours old are protected. Only recognized objects for the selected database are pruned. Listing must finish before deletion; listing failure deletes nothing, and deletion failure stops cleanup. `BACKUP_RETENTION_DRY_RUN=true` uploads/verifies a backup and reports deletion candidates without deleting them.

The [bucket lifecycle template](backup-lifecycle.json) aborts incomplete uploads after one day and expires noncurrent versions after 30 days. It must be installed separately; backup jobs do not manage bucket policies or lifecycle rules. Versioned-bucket pruning creates delete markers, so retained old versions remain until lifecycle expiration. S3 permissions must cover listing, upload, verification, deletion, and multipart abort, with version/KMS permissions where applicable.

Recovery is manual into an isolated target. Verify checksums and restored data/indexes before switching databases. SQLite recovery includes `PRAGMA integrity_check`. Logical Mongo archives restore without `--oplogReplay`; oplog archives require full-dump replay without database filters/remapping. Checksums establish archive integrity, not successful restoration.

## Runtime and development

Compose runs API, worker, cron, Redis, and the logging stack. Either repo's `dev` command starts local Vite plus Compose; `setup` initializes missing demo data separately. Startup/restarts do not repeat setup, and shutdown preserves stored data. See the [README](../README.md#local-development) for commands.

MongoDB reconnects after runtime outages, with API readiness unavailable until reconnection; failed process startup is retried by Compose's restart policy. The optional ngrok tunnel retries initial transport failures with capped backoff and cancels pending retries during shutdown; established sessions use SDK reconnection. Explicit ngrok provider rejections require intervention instead of repeated startup attempts. SQLite lock contention uses a bounded busy timeout. Payment recovery remains owned by Stripe webhook retries and scheduled reconciliation rather than replaying checkout or SMTP side effects.

SQLite persists in the Docker-managed `sqlite_data` volume, mounted at `/bookshop-server/data` for API, worker, and cron, including SQLite's WAL/shared-memory files. Keep `DB_SQLITE_FILE` under `data` so all writers use that persistent storage. API, worker, and scheduled database jobs run as `bun:bun`; root-owned cron switches users before executing jobs. Image-created directories belong to `bun`, and fresh volumes inherit that ownership; no host UID/GID mapping or root startup repair is required. A host-local SQLite file is separate from the volume and does not initialize the Docker database.

This demo has no fulfillment, inventory reservation, refund, or dispute workflows. Live replica-set, Redis/SMTP, webhook, and restore checks remain separate from mocked provider tests.
