# Order Worker preparation

The existing `alasas-floor-image-upload` Worker is an image-upload service. It is not an order backend and must not be extended by copying the Firebase Functions entrypoint.

The prepared `src/order-backend.js` reuses only the dependency-free order calculation from `functions/src/order.js`. It requires three server-side adapters before staged deployment:

- `authenticate(request)`: verify a Firebase ID token with Google secure-token certificates and return `{ uid }`.
- `repository.readSnapshot()`: read products, delivery, payment methods, discounts, and settings from Firebase Production using a server credential.
- `repository.claimIdempotency()` and `writeOrderAtomically()`: perform an atomic idempotency claim and final order write, including inventory/discount concurrency rules.

The Worker must use a Cloudflare secret-backed Google service-account OAuth flow (or an equivalent narrowly scoped trusted service) for Firebase RTDB REST access. The credential is not a frontend Firebase API key, is not stored in this repository, and is not configured by this change. Recommended secret names for a later approved deployment are:

- `FIREBASE_PROJECT_ID`
- `FIREBASE_DATABASE_URL`
- `FIREBASE_SERVICE_ACCOUNT_EMAIL`
- `FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY`

`src/rtdb-adapter.js` implements JWT assertion creation, token caching/refresh, Bearer-authenticated REST reads/writes, ETag reads, URL validation, and request timeouts. Its order-write method intentionally throws `ATOMIC_STOCK_COORDINATOR_REQUIRED`: Firebase RTDB REST ETag conditional writes protect one location, but cannot atomically compare stock, claim idempotency, and create an order across multiple RTDB branches. A read-then-write fallback would permit two concurrent buyers to consume the last unit.

Therefore the order handler fails closed until a coordinator is supplied. The coordinator must serialize the product/inventory lock and perform the stock decrement, idempotency claim, and order record update under one trusted authority. A Cloudflare Durable Object can be used, but it must also be the single writer for all competing stock/order paths; merely adding a local Worker mutex is insufficient.

The isolated emulator fixture proves Auth Emulator availability, REST read/write plumbing, and direct customer write denial. Google token exchange with a real Service Account is intentionally not run because no secret may be created or supplied in this phase.

The Worker should use Cloudflare rate limiting (or a Durable Object/KV-backed limiter), strict origin/method checks, short request limits, and an idempotency key scoped to the authenticated UID. No RTDB rules or Production data are changed by this preparation.

## Phase 3.2 D1 boundary

`migrations/0001_order_engine.sql` defines the D1 order engine, catalog versions, D1-owned inventory, order items, idempotency, movements, and audit events. Firebase remains the source for catalog content and publish state; the controlled sync copies price/status/name and version into D1. It does not overwrite D1 inventory. Inventory is seeded separately and is changed only by order reservation or cancellation movements.

The D1 engine uses a conditional inventory `UPDATE`, then a `transaction_guards` CHECK that requires every requested product row to have changed. D1's transactional `batch()` rolls back the entire sequence if that guard fails, including idempotency, order, items, and movements. Cloudflare documents D1 batch sequences as SQL transactions that roll back on statement failure. The local tests use SQLite `BEGIN IMMEDIATE` to model the same all-or-nothing behavior and cover a concurrent last-item conflict.

The local-only config is `wrangler.orders.local.toml`; it has no Cloudflare database ID and must never be used with `--remote`. The order API is not wired into `alasas-floor-image-upload`.

`src/order-worker-entry.js` is the separate order Worker entrypoint. It verifies Firebase ID tokens, loads active Admin membership through the privileged RTDB adapter, and exposes `/orders` plus `/admin/orders`. It is selected only by the local/example order configuration, never by the image-upload `wrangler.toml`.

## Phase 3.3 security and staging boundary

- `order-security.js` enforces an exact `ALLOWED_ORIGINS` allowlist, a 64 KiB JSON body limit, and a fail-closed `RATE_LIMITER` binding. Missing rate limiting is a 503, not an implicit allow.
- `d1-admin-api.js` requires an active role and denies `permissions.orders === false`; all order mutations are server-side and use bound SQL parameters. Cancellation scopes inventory restoration by `shop_id` and is idempotent.
- `ORDERS_ENABLED` defaults to disabled. A staging deployment must keep it `false` until local and isolated smoke tests pass and a separate approval enables intake. Admin read/update APIs remain separately protected by Firebase membership.
- `wrangler.orders.staging.example.toml` is a template only. It contains no D1 ID, service-account material, or Cloudflare secret value. Do not run a remote migration or deploy from it without approval.

### Staging checklist (not executed here)

1. Create or select an isolated staging D1 database and record its ID outside Git.
2. Configure `RATE_LIMITER` and the named Firebase service-account secrets in Cloudflare only.
3. Run `wrangler d1 migrations apply DB --remote --env staging` and verify the migration result.
4. Deploy the separate order Worker with intake disabled, then run authenticated smoke tests for catalog sync, Admin RBAC, order rejection, cancellation, and readback.
5. Set `ORDERS_ENABLED=true` only after those tests and explicit release approval.

### Rollback and stop plan

Immediately set `ORDERS_ENABLED=false` or remove the order Worker route, preserve D1 audit rows, and stop intake. Investigate from `order_events`, `inventory_movements`, and D1 backups/Time Travel where available; do not delete or rewrite orders. Roll back the Worker to the last approved version, keep Firebase content untouched, and reconcile any in-flight idempotency keys before reopening.
