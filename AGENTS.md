# Coding-agent instructions

- Consider this repo and `../bookshop-client` together for auth, checkout, payments, and email changes.
- Preserve the custom PaymentIntent/Payment Element checkout and both SQLite/Drizzle and MongoDB/Mongoose implementations. They are deliberate learning goals.
- Demo databases are recreated. Update initial SQLite migration/snapshot and Mongo schemas in place; do not add compatibility scaffolding unless requested. Do not delete an actual database/volume without explicit authorization.
- Stripe owns payment status. Never enable CMS writes to payment state, paid markers, checkout totals, currency, or item snapshots.
- State-changing email intents must commit in the same database transaction. Repositories own transaction boundaries; pure payload builders do not perform I/O. Mongo transaction operations must use the same explicit session and execute sequentially.
- Database connections belong to explicit entrypoint startup/shutdown, not module imports. The email worker owns Redis and SMTP connections; API email use cases persist outbox intents.
- Runtime-validate external requests; keep internal update schemas separate from public/CMS allowlists. Response mappers must not expose account tokens, password hashes, Mongo internals, or order reconciliation bookkeeping.
- Keep guest checkout access and signed payment cookies working. Own variables use `paymentToken`; do not rename Stripe SDK/wire fields such as `client_secret` or `idempotencyKey`.
- All Git operations are performed by the user. Do not run any Git commands unless explicitly instructed. Respect user changes. Use `rg` for search and `apply_patch` for edits.
- Keep control flow readable: use braces for guards/loops and blank lines before returns/switches and between logical sections. Avoid rest destructuring in function parameters; prefer named parameters or typed input objects.
- Run `bun run typecheck`, `bun run lint`, `bun run format:check`, and `bun test`. Validate Compose changes with `docker compose config --quiet`. State explicitly when live provider/database checks were not available.
- Keep README.md focused on project basics and setup. Put this app's feature, architecture, and operational details in `docs/architecture.md`; link to `../bookshop-client/docs/architecture.md` for frontend responsibilities. Keep agent instructions here.
