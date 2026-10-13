# AL ASAS Flower Commerce — Phase 1 Audit

Date: 2026-10-14 (Asia/Baghdad)

## Scope

This audit is read-only. It does not seed, migrate, delete, or modify
Production Firebase data, and it does not push or deploy either repository.

## Repository evidence

- Customer working checkout: `C:\Users\MSI\Desktop\floor`
  - `main` at `0297d75`, behind `origin/main` by 11 commits.
  - Local modifications and untracked Firebase/admin files were preserved.
  - A clean implementation worktree was created from `origin/main` at
    `46dab86` under `.codex/worktrees/alasas-commerce-phase1/floor`.
- Admin repository: `C:\Users\MSI\Desktop\floor-admin`
  - `main` at `864b0d7`, clean after clone.
- The customer build in the existing checkout and the clean implementation
  worktree both completed successfully.
- The admin build completed successfully. The customer dependency audit reports
  15 vulnerabilities (5 moderate, 10 high); no automatic upgrade was applied.

## Firebase read-only evidence

- Project: `floor-232bc`.
- Root keys: `shopMemberships`, `shops`.
- `shopMemberships` contains exactly the two supplied UIDs, both active
  `SUPER_ADMIN` memberships with `immutableBootstrap: true`.
- `shops/floor-232bc/private/activityLogs` contains the initial provisioning
  record. No products, public categories, orders, or inventory records were
  found at the paths currently used by the applications.
- The local rules file is restrictive at the root, but deployed-rule parity was
  not independently proven. No rules deployment was attempted.

## Current implementation boundary

- The clean customer worktree now subscribes to
  `shops/floor-232bc/products` and renders valid live records when present.
- It accepts `imageUrls` and uses the first image for the catalog card/detail
  view. If the live catalog is empty, the existing visual demo remains visible
  and the footer explicitly states that no Firebase products are published.
- This change is local-only and has not been deployed or pushed.
- The existing admin app reads/writes several paths, but its generic CRUD is not
  yet a complete order, payment, inventory, audit, or permission workflow.

## Local backend progress

- Added a local-only `functions/createOrder` callable. It requires Firebase Auth,
  reads product prices/payment methods/delivery fees from the database, ignores
  client totals, starts every order with an unpaid or pending-review payment
  state, and uses a per-user idempotency key.
- Auth, RTDB, and Functions emulators were started with synthetic data only.
  The integration read back a 75,000 IQD order, returned `UNPAID`, reused the
  same order ID on retry, and rejected an unauthenticated call. No emulator
  data or credentials were sent to Production.
- The customer UI now uses a product-id/quantity cart, reads the live catalog,
  requires Google sign-in before calling `createOrder`, and displays the
  server-returned order ID and total. Preview products are visibly blocked from
  checkout. Checkout now reads enabled payment methods, delivery areas, and the
  shop WhatsApp setting from the public Firebase config and prepares a truthful
  WhatsApp message after order creation.
- Coupon checkout is now wired to the server: the customer sends an optional
  coupon code, the backend selects one eligible server-side discount, records
  the discount on the order, and atomically limits usage by counter. Invalid,
  expired, below-minimum, or exhausted entered codes are rejected rather than
  silently accepted at the full price.
- Coupon reservation compensation now attempts to release the usage counter
  and usage marker if the subsequent order write fails, reducing leaked-use
  risk on a failed creation.
- The Admin product form now supports commercial product metadata, sale-price
  fields, stock, image URLs, marketing flags, and explicit `PUBLISHED`,
  `HIDDEN`, `DRAFT`, `UNAVAILABLE`, and `ARCHIVED` states. Customer catalog
  subscription filters non-published states and shows a valid compare-at price
  and discount badge when present.
- The Admin payment section now has structured types for cash, Mastercard,
  bank transfer, and ZainCash, including publish state, ordering, supported
  provinces, and allowed receiving details. Secret card fields remain rejected
  by the callable write policy.
- Import/Export is now merge-only: collection imports update named records and
  document imports update named fields without replacing or deleting omitted
  data; invalid record keys/values are rejected before writes.
- Customer Home now subscribes to visible public categories and uses them for
  its category cards, while retaining the existing visual fallback when no
  published categories exist.
- Customer favorites now persist locally for anonymous visitors and render in
  the Favorites page; Google-account synchronization remains intentionally
  unimplemented until a safe user-scoped backend path is added.
- Customer order tracking now calls a dedicated `getCustomerOrder` callable;
  it returns a sanitized order summary only when the authenticated UID owns
  the requested order. Synthetic emulator readback returned the owner's
  `PREPARING` order and 45,000 IQD total, while a second synthetic UID received
  `NOT_FOUND`.
- Admin Dashboard now derives period-scoped confirmed sales, payment/order
  statuses, discounts, recent orders, and low-stock alerts from its authorized
  Firebase reads. It is still local-only and has no live authenticated browser
  acceptance yet.
- Both web clients now support an explicit local-only
  `VITE_USE_FIREBASE_EMULATORS=true` switch for Auth/RTDB/Functions testing;
  the default build keeps the existing Firebase project configuration.
- A CUA-rendered local Customer page showed the Arabic RTL layout, navigation,
  hero, category cards, product cards, and no blank screen. The isolated
  browser could not reach RTDB Emulator port `9000`, so it displayed the
  intentional catalog fallback; live catalog rendering remains NOT VERIFIED.
- The admin checkout adds a callable-backed order workflow: payment confirmation,
  approval, status changes, and an inventory lock with one multi-location update.
  Generic Admin CRUD writes now go through an allowlisted `adminWrite` callable
  that checks membership role/permission and rejects sensitive payment fields.
- Private Admin reads now use `adminRead` callable polling and local Rules set the
  `private` parent to non-readable from the browser. Staff linking requires an
  existing Firebase Auth UID and protects immutable bootstrap memberships.
- All allowlisted `adminWrite` operations now append a non-sensitive
  `ADMIN_WRITE` activity record in the same multi-location update as the
  catalog/settings mutation. Emulator readback confirmed a Manager-created
  product and its matching audit entry; Viewer writes and sensitive CVV input
  were rejected.
- Latest synthetic approval readback: order total `40,000`, payment
  `CONFIRMED`, order `APPROVED`, reservation `RESERVED`, product stock `2 -> 1`,
  rose material `5 -> 3`, wrap material `2 -> 1`, and repeated approval returned
  `reused: true` without another decrement.
- Latest synthetic coupon readback: first order total `77,000` from an `80,000`
  subtotal plus `5,000` delivery minus `8,000` coupon discount; retry reused
  the same order ID; a second order with the exhausted code returned
  `DISCOUNT_UNAVAILABLE`; usage count was `1` and only the first order was
  recorded.

## Blocking gaps before a Production release

1. Customer checkout cannot currently create orders under the local rules,
   because the callable is only locally emulated and is not deployed. Production
   also has no published catalog/delivery/payment configuration to accept a real
   order, and deployed Rules parity has not been proven.
2. The payment and inventory callables are emulator-verified only and still need
   Production deployment plus authenticated Admin browser acceptance. A browser
   button or transfer reference is not financial proof.
3. GitHub image upload has no approved server-side GitHub App/service in the
   checked repositories. No token was added to frontend code.
4. Product/category seed data requires a preview and explicit approval before
   any Production write. The idempotent preview script is present, but this
   machine has no approved Admin credential, so the live preview was not run.
5. Product/category seed data, customer checkout, payment readback, and
   physical/live deployment acceptance remain unverified.

## Status summary

| Area | Status | Evidence boundary |
| --- | --- | --- |
| Customer build | PASS | Local clean worktree and existing checkout build |
| Admin build | PASS | Local admin checkout build |
| Firebase connection | PASS (read-only) | Firebase CLI project/data reads |
| Super Admin preservation | PASS (read-only) | Both exact UID membership records read back |
| Live customer render | NOT VERIFIED for new code | Existing deployed page inspected; new worktree not deployed |
| Live admin render | NOT VERIFIED for new code | Existing deployed page inspected; no mutation attempted |
| Product/category CRUD | BUILD PASS; runtime NOT VERIFIED | Structured product editor and status filtering are local-only; no Production write performed |
| Published category reflection | BUILD PASS; runtime NOT VERIFIED | Customer subscription and fallback are wired; no authenticated live acceptance |
| Dashboard metrics | BUILD PASS; runtime NOT VERIFIED | Period filter and Firebase-derived indicators compile; no live Admin session readback |
| Rendered Customer shell | PASS (local visual smoke only) | CUA DOM snapshot showed RTL layout and navigation; not proof of live Firebase catalog |
| Create-order backend | PASS (emulator only) | Authenticated synthetic order, server pricing, readback, retry idempotency |
| Customer cart/checkout wiring | BUILD PASS; runtime NOT VERIFIED | Live product IDs/config and callable client are wired; no deployed callable or authenticated browser acceptance |
| Coupon pricing and usage | PASS (unit + emulator) | 7 server pricing tests; emulator pricing, idempotency retry, usage counter, order discount readback, exhausted-code rejection |
| Payment methods | BUILD PASS; runtime NOT VERIFIED | Structured local editor and province-aware customer display; no Production mutation or live browser acceptance |
| Import/export safety | BUILD PASS; runtime NOT VERIFIED | Merge-only client flow compiles; no authenticated Admin browser acceptance |
| Favorites | BUILD PASS; local visitor behavior NOT VERIFIED | LocalStorage persistence and Favorites rendering are wired; account sync is not implemented |
| Customer order tracking | PASS (emulator only) | Owner readback returned a sanitized order summary; a different synthetic UID received `NOT_FOUND`; Google popup/live Production flow remains unverified |
| Payment approval/inventory | PASS (emulator only) | Confirmed payment, approval, stock/material decrement, reservation readback, retry no double decrement |
| Admin mutation authorization | PASS (emulator only) | Manager write accepted, sensitive CVV rejected, Viewer write rejected |
| Admin write audit logging | PASS (emulator only) | Manager product create and matching `ADMIN_WRITE` readback |
| Admin private reads/Rules hardening | PASS (emulator only) | `adminRead` role gate and private parent read closure; no Production Rules deploy |
| Staff UID membership linking | PASS (emulator only) | Auth UID lookup, membership/staff readback, non-Super Admin Super Admin assignment rejected |
| Default catalog seed | BLOCKED | Preview-only script exists; approved Admin credential is not configured |
| GitHub image upload | BLOCKED | Server-side credential/service not present |

