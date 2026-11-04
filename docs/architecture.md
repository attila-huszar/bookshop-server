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

`database/setup.ts` initializes a fresh demo database: SQLite migrations precede schema validation and seeding; MongoDB connection/model initialization precedes seeding. Authors are seeded before books, followed by news and the admin account. Setup does not clear existing data or provide an idempotent reseed. Ordinary API startup validates the schema and never seeds.

## Authentication and account lifecycle

Authenticated requests and token refresh require an active, non-deleted account; verification is checked separately. Logout clears session cookies independently of account lookup. Signed guest payment cookies remain separate from account sessions.

Verification and password-reset tokens are consumed through conditional updates requiring the current token, future expiry, and active account. Repeated or superseded tokens cannot change the account.

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

Registration, password resets, first-paid transitions, and reconciliation alerts own their email intents inside repository transactions. Generic account/CMS edits and PaymentIntent linking do not send emails. Payloads contain only the data needed for rendering.

The consumer skips obsolete account tokens and resolved reconciliation alerts. Lookup failures remain retryable. CMS email history is scoped to an exact payment ID and separates queue publication from SMTP processing; summaries exclude bodies, account links, and lease tokens. Queue acknowledgement is not proof of delivery.

Publication is at least once. A crash after SMTP acceptance but before job acknowledgement can cause a duplicate send. Redis uses persistent AOF storage and no eviction; retained jobs provide deduplication history. Loss of processed Redis jobs has no automatic outbox replay, and manual replay may duplicate email. Database/provider outages can also prevent alerts from being recorded or sent.

## API response and error contracts

Repositories return internal records; response allowlists expose public/CMS fields and normalize dates/nulls. User responses exclude password hashes and account tokens. CMS order writes accept customer/shipping corrections only; payment state, paid markers, totals, currency, items, and terms acceptance are protected.

API failures use stable application codes and HTTP statuses. Validation responses expose sanitized Zod metadata for localization, without raw input, private parameters, or internal messages. Expected 4xx responses remain quiet; server failures are logged with safe diagnostics. Logs redact credentials and omit query strings, cookies, and authorization headers.

## Image storage and observability

Sharp validates and normalizes uploaded images to WebP with input, pixel, and processing limits. Random S3 keys separate avatar/product images by database. Maintenance removes generated images older than 24 hours only when unreferenced, including by soft-deleted users; it rechecks references before deletion and excludes external URLs and other namespaces.

Compose sends service logs to Loki under `job` labels; browser reports pass through the API with `source="frontend"`. Grafana provides inspection, and Cronitor monitors scheduled runs. Loki's own Docker logs use the local driver. Container logs rotate, and shipping retries/timeouts are bounded.

## Database backups

The backup job creates a private temporary archive, uploads it to S3, verifies its size and SHA-256 checksum for the uploaded version, then applies retention. Multipart checksums match the uploader's part boundaries. Failed verification never triggers pruning. Cancellation terminates dump children and settles cancelled upload requests before cleanup; cleanup requests remain independent of job cancellation.

| Database/mode   | Archive and consistency                                                                          |
| --------------- | ------------------------------------------------------------------------------------------------ |
| SQLite          | Online `sqlite3 .backup`, including committed WAL data, compressed as `.sqlite.gz`               |
| Mongo `logical` | Database-scoped `mongodump` archive; all writers must be paused for cross-collection consistency |
| Mongo `oplog`   | Full replica-set archive with oplog capture; requires a deployment supporting oplog access       |

`MONGO_BACKUP_MODE` defaults to `logical`, suitable for Atlas M0, and requires an explicit database in `DB_MONGO_URL`. Compose shares a runtime coordination volume across database writers. Logical backups request a pause, drain API/worker processes, and wait for active maintenance/setup jobs before dumping. New writers wait outside the database. Services resume after the dump, before S3 upload and retention. A failed drain or timeout aborts the backup; dump failure/cancellation also releases the pause. Kernel locks release on crashes, and a cleanup acknowledgement supports Bun's development watcher. Direct/manual writers must use `docker/database-access.sh job`; external clients must be stopped separately. Coordination covers only writers sharing this volume. Oplog backups preserve authentication while removing the database path and do not pause writers; there is no fallback between modes.

Archives are private objects under `backups/sqlite/` or `backups/mongo/`. Cron wrappers prevent overlapping runs in their container and impose a deadline. Scratch files are removed after success or failure; abandoned multipart uploads also require bucket lifecycle cleanup.

Retention defaults to 7 occupied UTC days, 4 Monday-start weeks, and 12 calendar months, keeping the latest backup in each period. The union of those selections, the current upload, and all archives less than 24 hours old are protected. Only recognized objects for the selected database are pruned. Listing must finish before deletion; listing failure deletes nothing, and deletion failure stops cleanup. `BACKUP_RETENTION_DRY_RUN=true` uploads/verifies a backup and reports deletion candidates without deleting them.

The [bucket lifecycle template](backup-lifecycle.json) aborts incomplete uploads after one day and expires noncurrent versions after 30 days. It must be installed separately; backup jobs do not manage bucket policies or lifecycle rules. Versioned-bucket pruning creates delete markers, so retained old versions remain until lifecycle expiration. S3 permissions must cover listing, upload, verification, deletion, and multipart abort, with version/KMS permissions where applicable.

Recovery is manual into an isolated target. Verify checksums and restored data/indexes before switching databases. SQLite recovery includes `PRAGMA integrity_check`. Logical Mongo archives restore without `--oplogReplay`; oplog archives require full-dump replay without database filters/remapping. Checksums establish archive integrity, not successful restoration.

## Runtime and development

Compose runs API, worker, cron, Redis, and the logging stack. Either repo's `dev` command starts local Vite plus Compose; `setup` initializes a fresh database separately. Startup/restarts do not repeat setup, and shutdown preserves volumes. See the [README](../README.md#local-development) for commands.

SQLite persists under `/bookshop-server/data` in the shared volume. API, worker, and scheduled database jobs run as `bun:bun`; root-owned cron switches users before executing jobs. Existing volume ownership must permit that shared access. Manual database jobs should also run as `bun:bun`.

This demo has no fulfillment, inventory reservation, refund, or dispute workflows. Live replica-set, Redis/SMTP, webhook, and restore checks remain separate from mocked provider tests.
