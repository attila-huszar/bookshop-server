# Architecture and checkout flow

## Purpose and boundaries

This is a learning/demo bookshop, not a production commerce platform. Custom Stripe PaymentIntents, SQLite/Drizzle, and MongoDB/Mongoose are deliberate learning choices. The goal is to make failure handling and responsibilities explicit without introducing microservices or a dependency-injection framework.

The API owns authentication, catalogue validation, checkout snapshots, and customer corrections. Stripe owns payment state. The email worker owns outbox publication and SMTP. The maintenance process owns periodic cleanup and reconciliation. HTTP controllers translate requests/responses; services enforce use-case rules; repositories own database-specific operations and atomic writes.

Database selection happens once in the repository entrypoint. Each adapter imports its own SQLite tables or Mongo models directly; no second model selector or model-union casts are needed. Invalid `DB_REPO` values fail during configuration parsing. Missing CMS update targets return `null` from either adapter, and the service translates that into a 404. Cleanup operations return affected counts rather than account records.

Entrypoints explicitly connect/close the database. Importing database/application modules does not open database connections. Queue connections belong to the worker process, not the API. Hono's root error handler maps expected domain failures and validation failures to JSON responses; request logs omit headers and token-bearing query strings.

The reconciliation runner records failures through `ordersDB.recordReconciliationFailure`. Each order has a consecutive failure count and a current alert ID, alongside its attempt/success timestamps. After three failed checks, the repository saves that alert ID and its error email intent in one transaction. Successful reconciliation clears both failure fields. Webhook failures log and return an error for Stripe's retry; they do not increment the counter or send error emails. Services do not pass email drafts to repositories. State-changing use cases still commit intents in their repository transaction. The worker's `outbox.service.ts` publishes committed intents to BullMQ; API services must not import that relay. User profile and CMS allowlists live together in `response.utils.ts` as `publicUserResponse` and `adminUserResponse`.

## Custom checkout

1. The client keeps a random client idempotency key for the active checkout attempt. Identical retries reuse it; a different cart or a fresh attempt gets a different key.
2. The server combines that key, principal scope (account UUID or guest), and request contents into a SHA-256-derived checkout request ID.
3. The server reads catalogue prices and builds an immutable order snapshot. A price conflict returns 409 before creating a new draft. Checkout recovery explicitly refreshes book prices, bypassing cached query results.
4. A unique checkout request ID makes racing requests resolve to the same persisted draft. Replays use that snapshot, not today's prices.
5. Stripe creates the PaymentIntent using the checkout request ID as its SDK idempotency key. Metadata contains the numeric order ID and unique checkout request ID.
6. Linking the PaymentIntent saves its reference without sending an admin email. Stripe creation and database persistence cannot share a transaction; a timeout is not proof of Stripe failure. Retry or reconciliation recovers the link.
7. The browser's Stripe Payment Element confirms the payment. The payment token stays in memory; browser storage keeps only safe identifiers, not the Stripe client secret.
8. Signed PaymentIntent webhooks update the local snapshot. The first successful payment sets `paidAt` and saves the customer confirmation and admin New order intents in the same database transaction. A guest without an email receives no customer email.
9. The return page reads Stripe status using the authorized payment endpoint. Its success display is not authority to mark an order paid. Webhooks/reconciliation do that independently.

Guest payment access uses the signed payment-session cookie; authenticated access is also supported. Account order history currently matches the account's email, including guest purchases made with that email. Explicit account ownership and a guest-claim workflow would be a separate production feature.

### Identifiers

| Identifier                 | Owner           | Purpose                                                                                    |
| -------------------------- | --------------- | ------------------------------------------------------------------------------------------ |
| Client idempotency key     | Browser         | Retry one checkout attempt                                                                 |
| Checkout request ID        | Server/database | Principal-and-request-bound checkout identity; unique order key; Stripe idempotency option |
| Order ID                   | Database        | Human-readable local order reference                                                       |
| PaymentIntent ID           | Stripe          | Authoritative payment identity linked to the order                                         |
| Event ID and creation time | Stripe          | Webhook duplicate/staleness checks, not reconciliation timestamps                          |
| Outbox/job ID              | Server          | Deduplicate publication of a particular email intent                                       |

Metadata deliberately keeps both `orderId` and `checkoutRequestId`: the first identifies the local order; the second prevents old Stripe test payments from matching reused numeric IDs after demo database resets. There is no unused `metadata.requestId`. Stripe's SDK `idempotencyKey` and `client_secret` names remain vendor wire/API fields.

## Payment invariants and recovery

CMS orders and users use reversible soft deletion: a nullable `deletedAt` field, set by the admin-only DELETE endpoints and cleared by PATCH `/api/cms/restore/orders` or `/api/cms/restore/users`. Both adapters update only records whose deletion state changes and return an affected count. Repeating a command preserves the original timestamp and changes no records. The CMS reads one list per entity and filters active/deleted views locally. Only CMS responses expose `deletedAt`; ordinary correction schemas cannot change it. Orders retain checkout/payment, customer-history, reconciliation, and email access. There are no order or user hard-delete endpoints. Catalogue deletion remains permanent and is named **Hard delete**.

User repositories expose `getActiveUserBy` for lookups that always exclude soft-deleted records. Updates and token reset writes also require an active record. Registration uses the separate boolean `emailExists` check, which includes soft-deleted accounts so their addresses remain reserved without returning their account data. Here, active means not soft-deleted; verification is checked separately. Required and optional authentication load the active user once per request into typed `authUser` context. Admin authorization and profile/order/avatar/payment handlers reuse that record, and response mappers keep it internal. Profile writes still require an active record at the repository boundary. Refresh independently checks the active account before issuing tokens. Logout clears both session cookies without a token or account lookup. Signed guest payment cookies remain independent. Pending verification/reset emails are skipped when the recipient lookup finds no active account. CMS deletion protects the last active admin, and unverified-account maintenance soft deletes expired registrations. Restoring a user retains its identity, password and verification status; admins can correct an expired unverified registration in the CMS.

Stripe statuses are not assigned invented numeric ranks. A failed attempt can return to `requires_payment_method` and then move through another confirmation attempt. The application never clears `paidAt` or silently downgrades a paid order.

Webhooks reject stale/duplicate events; same-second or pre-reconciliation conflicts may require a fresh Stripe read. Reconciliation always retrieves Stripe's current PaymentIntent and verifies identity, metadata, amount, and currency. Both paths use optimistic conditional updates against the persisted payment snapshot; concurrent winners cause bounded re-reads rather than blind overwrites. Single-order reconciliation and its bounded batch runner live together in `orders.service.ts`; maintenance invokes the batch runner.

Only recognized PaymentIntent events in this application's metadata scope are processed. Unrelated PaymentIntents and non-PaymentIntent events are acknowledged without changing orders. This follows Stripe's webhook constraints around retries and unordered delivery. See [Stripe webhooks](https://docs.stripe.com/webhooks).

Maintenance runs every ten minutes. A run checks at most 100 orders, oldest attempt first. Orders modified in the last five minutes are left alone. Routine pending checks are paced at thirty minutes; terminal audits are paced daily. Failed orders retry with at least five minutes between attempts, normally ten minutes under cron. All reconciliation bookkeeping stays on the order; there is no separate issue store or retry loop. Unlinked drafts are searched by both metadata keys, then the matched intent is retrieved. No match is left for a later check because Stripe Search is eventually consistent; ambiguous matches and violated financial invariants require investigation.

Reconciliation never creates, confirms, captures, cancels, or refunds payments. It preserves real webhook event markers and writes its own check timestamp. The cron wrapper prevents overlapping runs in its container; the script has a nine-minute hard deadline and stops starting Stripe checks after eight minutes.

Empty maintenance runs are silent: cleanup summaries require affected records, and reconciliation summaries require at least one checked order. The expired-registration summary includes `totalDeleted` and a `users` list containing only each affected account's `userId` and `email`. SQLite returns these identities from the update; Mongo selects and soft deletes them in one transaction, and logs only after commit. Cronitor still tracks each wrapped run, and failures remain logged. BusyBox `crond` uses `-l 9` to suppress routine daemon messages while retaining errors and job output.

## Transactional email outbox

The database-to-Redis boundary uses the [transactional outbox pattern](https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/transactional-outbox.html):

```text
API/webhook/reconciliation
  -> database transaction: state change + email intent
  -> commit
       |
email worker's relay (polls every 2 seconds)
  -> lease one due intent for 60 seconds
  -> publish to BullMQ using the intent's stable ID
  -> mark processed only after Redis accepts the job
       |
BullMQ email processor
  -> render payload snapshot
  -> send using SMTP
```

The explicit user repository operations `createUserWithVerification` and `setPasswordResetToken` build email intents from the saved user through a pure payload helper and insert them in the same transaction. Services validate input and generate tokens; generic user creation/updates (including CMS writes) do not create emails. Order linking is silent; the winning first-paid update saves the customer confirmation and admin New order intents. An order failure update saves one error intent atomically after three consecutive failed checks. Conditional updates reject duplicate, superseded, or already recovered attempts; duplicate webhooks do not count as failed checks.

A failed intent insert rolls back its associated state change. A Redis outage after a successful database commit leaves the intent available for a later relay attempt. Publication failures back off exponentially, capped at one hour; producer retries/timeouts are bounded. SMTP jobs separately have three attempts with exponential backoff.

Each lease has a unique token. An expired lease can be reclaimed after a crash; an old publisher cannot acknowledge or release its successor's lease. If Redis accepted a job but the database acknowledgement failed, the relay republishes the same ID. [BullMQ job IDs](https://docs.bullmq.io/guide/jobs/job-ids) deduplicate that replay while the job remains in Redis.

`processedAt` means accepted by the queue; it is **not** proof that SMTP delivered an email. Admin notifications have two phases: New order after the first paid transition, and Reconciliation failed after three failed checks. Successful reconciliation clears the order's alert ID, and the consumer skips error jobs whose ID no longer matches the order or whose order was deleted. A paid marker alone does not suppress an audit alert. One alert/job ID remains active until recovery; new failures after recovery can create a fresh alert. The first-paid admin job ID uses `admin-new-` and its payload, subject and title say New order.

The admin-only `GET /api/cms/email-outbox` returns paginated, filtered summaries. The CMS Orders tab requests a history only when expanded and supplies the order's exact `paymentId`; both adapters match admin notifications' `paymentId` and customer confirmations' `order.paymentId`. Recipient/type/status filters apply within that order, so similar payment IDs and account emails cannot mix into its history. Delivery fields are independent of relay leases: publication sets Queued only if the worker has not already recorded an outcome, so a fast SMTP send cannot be overwritten by a later relay acknowledgement. The worker saves Sending before processing and then Sent/Skipped, or Retrying/Failed after an exception. Delivery attempts count processor runs; next retry times estimate BullMQ's configured exponential backoff, not the exact execution time. Publication/delivery errors are generic. Reconciliation reasons describe controlled invariant failures or safe Stripe error categories, without copying raw SQL/provider messages, credentials, or token-bearing links. CMS summaries expose that reason separately from delivery errors. Historical processed rows display Processed rather than guessing whether they were sent or discarded.

A failure to save the initial Sending record prevents SMTP processing and is retryable. A failure to save Sent/Skipped is logged without failing the completed job, avoiding an extra send caused solely by tracking failure; the last saved status may then remain Sending. The CMS does not offer resend/delete actions, and its summaries never include email bodies, account links, or lease tokens.

Before sending verification or password-reset emails, the consumer checks that the recipient still exists, the queued link matches their current token, and that token has not expired. Verification emails are also skipped for already-verified accounts. Database lookup failures remain retryable job failures, not reasons to discard an email. These checks reduce stale sends but cannot make the database check and SMTP send atomic.

Reconciliation can recover an existing unlinked draft through Stripe metadata. Webhooks for payments with no matching local order return an error for Stripe retries and remain visible in structured logs. Completely missing orders are not stored, polled, or automatically emailed by this demo; inspect logs and Stripe Dashboard manually. Existing orders still alert for financial mismatches, conflicting paid status, ambiguous matches, and database/provider failures after three failed checks. The error template highlights the reason and links to the matching test/live dashboard, with the continuing retry policy.

Database/outbox outages can prevent failure counts or email intents from being saved. Logs and the failed maintenance result/Cronitor remain the fallback; the design does not promise email during an outage of its own dependencies.

The customer mail payload is a JSON-safe snapshot of the needed payment/items/shipping data, not a full database order with internal timestamps or checkout fields.

Intent construction assigns stable order-email IDs once and shares the item-summary allowlist. Rendering selects the template and its variables, then uses one interpolation/MJML/error-handling path. Order repositories return the saved order or `null`; first-paid detection stays inside the transaction that saves confirmation intents, rather than leaking unused flags to callers.

`EMAIL` in `constants/email.ts` defines all supported email kinds, static subjects, and account-link paths/token fields. Payload types derive their discriminants from that registry; the intent builders, repositories, renderer, and worker use the same definitions. Admin subjects remain dynamic because they include the order reference and notification phase.

### Delivery limits

This is at-least-once publication, not exactly-once SMTP. A process can die after SMTP accepted a message but before BullMQ acknowledged completion; a retry can send a duplicate. Stable job IDs do not prevent that window.

Redis uses a persistent volume, no-eviction policy, and AOF with `appendfsync always`, prioritizing durability over write throughput. These are demo defaults, not high availability. See [Redis persistence](https://redis.io/docs/latest/operate/oss_and_stack/management/persistence/).

Outbox rows and completed/failed jobs are retained for inspection and deduplication. Removing jobs removes their deduplication history. Retention, failed-job retry tooling, alerting on outbox age, and broker-disaster recovery need an explicit operational policy before production. Losing the Redis volume after a row was processed is not automatically repaired by the relay; manual re-drive may duplicate email. Protect database backups and queue storage because they contain customer data and verification/reset links.

## The two database implementations

| Concern                      | SQLite / Drizzle                    | MongoDB / Mongoose                            |
| ---------------------------- | ----------------------------------- | --------------------------------------------- |
| Atomic state + email         | Synchronous SQL transaction         | Explicit shared-session transaction           |
| Concurrent checkout creation | Unique index + conflict winner read | Unique index + duplicate-key winner read      |
| Concurrent payment update    | Conditional UPDATE                  | Conditional findOneAndUpdate                  |
| Relay claim                  | Immediate transaction               | Atomic findOneAndUpdate                       |
| Numeric IDs                  | SQLite auto-increment               | Counter allocation using the insert's session |

MongoDB transactions require a replica set for this demo. Compose initializes a single-node `rs0`, and startup initializes collections/indexes before transaction use. Operations inside a transaction are awaited sequentially, not placed in `Promise.all`. See [Mongoose transactions](https://mongoosejs.com/docs/transactions.html).

The single-node replica set is for exercising transactions, not failover. Only one database profile is active at a time. Initial SQLite migrations and Mongo schemas are edited in place because demo databases are recreated; this is not a production migration strategy.

## Client state and API contracts

RTK Query owns books, author references, news, account orders, and CMS data. Mounted query hooks retain subscriptions; loaders warm the same cache. CMS mutations invalidate public and CMS query tags together. Thin thunk adapters preserve loader/Search/form dispatch contracts but do not own entity caches; mutation adapters dispose of their result entries.

The remaining Redux slices own cart intent, authentication/session state, checkout workflow state, and book pagination/filter UI. Query responses are immutable; Search copies results before merging them. Logout, login transitions, and lost refresh sessions reset the query cache. Cache data and payment secrets are not persisted to browser storage. See [RTK Query cache invalidation](https://redux-toolkit.js.org/rtk-query/usage/automated-refetching).

Repositories return internal records. Response mappers whitelist public/CMS fields and normalize dates/nulls so Mongo-specific properties and bookkeeping do not leak into API contracts. CMS user responses contain neither password hashes nor verification/reset tokens. Client mutation types describe commands (for example author IDs when editing books), not arbitrary database records.

CMS order Add is disabled. Customer/shipping details remain editable; status, paid time, totals, currency, and items are read-only, with the server enforcing the same allowlist. There is no CMS “mark paid” action.

## Logs

Compose sends each service's output to Loki under a separate `job` label:

| Component               | Jobs in Grafana               | Routine output                                                        |
| ----------------------- | ----------------------------- | --------------------------------------------------------------------- |
| API                     | `server`, `server-with-mongo` | Lifecycle and payment outcomes                                        |
| Email worker            | `worker`, `worker-with-mongo` | Sent/skipped emails, failures, lifecycle                              |
| Maintenance and backups | `cron`, `cron-with-mongo`     | Nonempty maintenance summaries and backup actions                     |
| MongoDB                 | `mongodb`                     | Quiet connection logging; informational Checkpointer messages dropped |
| Redis                   | `redis`                       | Warnings and critical messages                                        |
| Ingress                 | `nginx`                       | Failed HTTP requests and daemon warnings/errors                       |
| Grafana                 | `grafana`                     | Warnings and errors                                                   |

Browser reports pass through the API and add `source="frontend"`, so `{source="frontend"}` isolates them without losing the API container's `job` label. Vite's development output stays in the local terminal. SQLite is embedded in the API/worker/cron processes and has no separate container stream.

Application logs default to `LOG_LEVEL=info`; set it to `debug` in the server `.env` to include payment-access and ignored webhook diagnostics. The SMTP pool's idle event and optional client configuration defaults are silent. Unrelated Stripe event types are acknowledged silently; unsupported PaymentIntent event types remain warnings. Actual payment/email outcomes and failures stay visible. The outbox relay keeps polling every two seconds, logs a continuing polling outage at most once a minute, and logs recovery once.

Loki uses Docker's `local` log driver so its own output does not feed back into Loki. Inspect it with `docker compose logs loki`. Container log files rotate at 10 MB with three files per container; Loki retains ingested logs according to its existing retention config. Loki driver retries and send timeouts are bounded. Logging-option changes require recreating containers with `docker compose up -d --build` from the server repo; restarting an existing container does not update its logging driver. Nginx failure summaries omit query strings, cookies, and authorization headers.

## Verification and production follow-ups

Development is coordinated directly by the package scripts: either repo's `dev` command starts local Vite plus Docker Compose. The same Compose file switches API/worker reloads on through `BUN_RUN_MODE=--watch`; ordinary Docker startup defaults to `run`. Initialization is explicit (`dev:setup`), and shutdown stops containers without deleting volumes. See [local development](../README.md#local-development) for commands and port configuration.

Automated tests cover real in-memory SQLite transactions/rollbacks, Mongo shared-session/error propagation, reconciliation races, guest access, first-paid behavior, relay leases/retries, response boundaries, and client cache invalidation/session isolation. Mongo unit tests do not replace a live replica-set smoke test; Redis and SMTP should also be exercised with an isolated test environment.

Useful smoke scenarios: complete a guest and account checkout; retry a lost creation response; stop Redis while changing state then restore it; restart a relay after queue publication; omit a webhook and run maintenance; submit two concurrent success updates; verify only one confirmation intent per payment.

Before treating this as production commerce: establish an order-ownership/fulfillment model, add refund/dispute/inventory workflows, set retention and recovery policies beyond CMS soft deletion, configure managed/replicated infrastructure, and establish metrics/alerts. Those are separate capabilities, not implied by the current PaymentIntent success marker.
