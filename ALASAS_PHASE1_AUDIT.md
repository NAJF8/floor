# AL ASAS Flower Commerce — Phase 1 Audit

Date: 2026-10-14 (Asia/Baghdad)

## Scope

This audit is read-only. It does not seed, migrate, delete, or modify
Production Firebase data, and it does not push or deploy either repository.

## Repository evidence

- Customer working checkout: `C:\Users\MSI\Desktop\floor`
  - `main` at `0297d75`, behind `origin/main` by 11 commits.
  - Local modifications and untracked Firebase/admin files were preserved.
  - The clean implementation worktree under `.codex/worktrees/alasas-commerce-phase1/floor`
    implementation commits are covered through `c3a68f6`; subsequent commits
    update this audit and its master-prompt status matrix,
    configuration hygiene, delivery/payment UI boundary checks, and audit-only
    updates. The repeatable Auth/Database/Functions harness remains in the
    same isolated branch.
- Admin repository: `C:\Users\MSI\Desktop\floor-admin`
  - The isolated implementation branch now ends at `7f7acb8`, with a clean
    worktree after the verified local changes.
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
  not independently proven. A Database Emulator smoke test on the default
  namespace returned public product `200` and anonymous private-order `401`.
  Authenticated REST-token simulation was not accepted as trustworthy evidence
  because the emulator treated the synthetic token as privileged; no rules
  deployment was attempted.

## Current implementation boundary

- The clean customer worktree now queries
  `shops/floor-232bc/products` with `status == PUBLISHED` and renders only
  valid published records when present. The local RTDB rule file now rejects
  unfiltered public product reads and all direct client writes to that path.
  Admin reads the full product path through the role-checked `adminRead`
  callable, so draft and archived records remain available to authorized staff
  without being exposed to the storefront. Rules were not deployed.
- It accepts `imageUrls`, uses the first image for cards, and now renders a
  selectable multi-image gallery on the product detail page. If the live
  catalog is empty, the existing visual demo remains visible and the footer
  explicitly states that no Firebase products are published.
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
- The customer UI now uses a product-id/quantity cart with persisted packaging,
  packaging-color, add-on, and gift-message options, reads the live catalog,
  requires Google sign-in before calling `createOrder`, and displays the
  server-returned order ID and total. Preview products are visibly blocked from
  checkout. Checkout now reads enabled payment methods, delivery areas, and the
  shop WhatsApp setting from the public Firebase config and prepares a truthful
  WhatsApp message after order creation.
- Coupon and promotion checkout is now wired to the server: the customer sends
  an optional coupon code, while an active discount with an empty code is an
  automatic promotion. The backend selects one eligible server-side discount,
  records it on the order, and atomically limits usage by counter. Invalid,
  expired, below-minimum, or exhausted entered codes are rejected rather than
  silently accepted at the full price. The Admin editor explicitly labels the
  empty-code automatic-promotion path.
- Coupon reservation compensation now attempts to release the usage counter
  and usage marker if the subsequent order write fails, reducing leaked-use
  risk on a failed creation.
- Checkout now sends cart options through the callable; the server sanitizes
  them, filters add-ons against the catalog product, and still calculates all
  monetary values from Firebase. Unit coverage passed for this boundary.
- The Admin product form now supports commercial product metadata, sale-price
  fields, stock, image URLs, marketing flags, and explicit `PUBLISHED`,
  `HIDDEN`, `DRAFT`, `UNAVAILABLE`, and `ARCHIVED` states. Customer catalog
  subscription filters non-published states and shows a valid compare-at price
  and discount badge when present. The Emulator harness also read back two
  persisted image URLs after an Admin price update.
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
- Admin Categories now has a structured editor for Arabic/English names,
  descriptions, image, icon, order, visibility, and featured state. A linked
  category is archived and hidden rather than deleting its products.
- Customer favorites persist locally for anonymous visitors and now merge into
  `users/{uid}/favorites` through an authenticated `syncCustomerFavorites`
  callable after sign-in. Synthetic Emulator readback merged two local IDs
  with a third account ID and rejected an invalid path-like ID.
- The product-detail favorite control now uses the same local storage and
  authenticated merge path as product cards; it is no longer a visual-only
  button. Customer build passed; authenticated browser sync remains unverified.
- Favorite synchronization now distinguishes initial account merge from later
  replacement, so removing a favorite removes it from the authenticated RTDB
  record. Emulator readback proved merge of two synthetic IDs followed by an
  exact single-ID replacement.
- Customer order tracking now calls a dedicated `getCustomerOrder` callable;
  it returns a sanitized order summary only when the authenticated UID owns
  the requested order. Synthetic emulator readback returned the owner's
  `PREPARING` order and 45,000 IQD total, while a second synthetic UID received
  `NOT_FOUND`.
- Customer Account now calls `listCustomerOrders`, returning only sanitized
  summaries owned by the authenticated UID and linking each result to the
  secure tracking page. Synthetic Emulator readback returned one owner order
  without phone data; a second UID returned only its own order.
- Customer and Admin now prepare WhatsApp order/approval messages with a
  tracking URL; opening WhatsApp is explicitly not treated as proof of sending
  or payment.
- Customer checkout now snapshots the validated cart and selected payment
  method before clearing local cart state, so the post-order WhatsApp handoff
  retains products, packaging, add-ons, gift message, and tracking URL. It also
  exposes a direct tracking link; the build passed, while live browser runtime
  remains unverified.
- The Customer product-page route now forwards selected packaging, color,
  add-ons, and gift-message options into the persisted cart instead of dropping
  them at the route callback. The Customer build passed; authenticated browser
  runtime remains unverified.
- Admin Dashboard now derives period-scoped confirmed sales, payment/order
  statuses, discounts, recent orders, low-stock alerts, payment summaries, and
  top products from its authorized Firebase reads. It supports today,
  yesterday, week, month, previous month, all-time, and custom date windows,
  plus a seven-day sales chart. It is still local-only and has no live
  authenticated browser acceptance yet.
- Admin Reports now derives confirmed sales, confirmed non-cash transfers,
  uncollected cash, discounts, status counts, top products, provinces, low
  stock, employee activity, and a local CSV export from authorized reads.
- Admin product editing now exposes an `inventoryRecipe` JSON field with local
  validation for material IDs and positive integer quantities; it is wired to
  the same field consumed by approval-time inventory decrement logic. The
  editor build passed, but authenticated runtime readback remains unverified.
- Product removal from the Admin editor now uses an allowlisted update to
  `status: ARCHIVED` and `active: false` rather than deleting the RTDB record;
  this preserves order-history references and keeps the operation reversible by
  editing the product. The build passed; authenticated archive/readback remains
  unverified.
- The Admin product list now provides local search, status filtering, and
  name/price/stock sorting before any mutation is submitted. This is a build-
  verified UI capability; authenticated browser behavior remains unverified.
- Product duplication now creates a new `DRAFT`, inactive copy with marketing
  flags cleared, so copying a published product cannot publish or represent a
  sale automatically. The Admin build passed; authenticated readback remains
  unverified.
- The Admin product form now offers local-only JPEG/PNG/WebP multi-file
  selection with type, count, and 8MB-per-file validation. It explicitly does
  not upload or save those files because no approved server-side GitHub service
  exists; URL-based image fields remain the only persisted path.
- Operational deletion controls now archive discounts and inventory materials,
  and disable delivery areas and payment methods while retaining their records.
  Approval also refuses archived/inactive inventory materials. Builds and
  Functions tests passed; the new archive-to-approval runtime path remains
  emulator/runtime unverified.
- Category removal now always archives and hides the category, even when no
  products are currently linked; the Admin UI no longer offers a destructive
  category delete path. Direct browser writes to the public shop configuration
  are also disabled locally, leaving the audited Admin callable as the write
  path. No Rules deployment was attempted.
- The Admin callable now rejects destructive `delete` operations, and the
  remaining generic collection editor archives records instead. Functions
  tests and the Admin build passed; authenticated mutation runtime remains
  unverified.
- The Admin callable also rejects destructive `replace` operations, and the
  Admin client no longer exposes delete/replace helpers; import/export remains
  merge-only. Functions tests and the Admin build passed, with no authenticated
  mutation runtime acceptance.
- The `adminWrite` callable now validates critical Admin values server-side:
  product prices/stock/status/recipes, inventory quantities, payment method
  types, discount bounds, category fields, and delivery values. The repeatable
  Emulator harness rejected a negative published product price, negative
  inventory quantity, and unsupported payment type with `INVALID_ARGUMENT`,
  while valid catalog writes and order approval continued to pass. This is
  local callable evidence; Production deployment remains unverified.
- Customer now reads `public/aiAssistant` settings for enablement, assistant
  name, welcome text, chips, and handoff text. It remains a configured
  conversational preview; no external AI/image-generation backend is called.
- Customer Home/Header/Announcement now consume public `homepage` and
  `settings` values for the hero title/description/banner, featured category,
  store name/logo, announcement, and temporary order closure, with explicit
  fallbacks when fields are absent. The Customer build passed; authenticated
  live reflection remains unverified.
- Admin document settings now serialize Boolean fields as actual booleans
  rather than strings; `enabled`, `acceptingOrders`, and `temporaryClosed` are
  exposed as explicit controls. This closes the configuration-type mismatch;
  authenticated runtime readback remains unverified.
- Both web clients now support an explicit local-only
  `VITE_USE_FIREBASE_EMULATORS=true` switch for Auth/RTDB/Functions testing;
  the default build keeps the existing Firebase project configuration.
- Checkout now requires an explicit `PUBLISHED` product state in the server
  pricing path as well as in the public catalog query; a new unit test rejects
  an active product with no publication state.
- Checkout now also rejects disabled delivery provinces and areas on the server
  pricing path. Unit coverage and the repeatable Emulator harness both rejected
  a synthetic `ClosedArea` with `FAILED_PRECONDITION`; enabled delivery still
  priced and completed normally.
- Order IDs and idempotency keys are now constrained to Firebase-safe key
  characters before any RTDB path is built. Unit and Emulator checks rejected
  synthetic `../orders` inputs without touching another path.
- The Customer checkout now filters disabled provinces and areas from the
  selectable lists and normalizes the public config with the same enabled-state
  boundary. Customer production build passed; browser/config readback remains
  unverified without a deployed public configuration.
- Checkout now also resets a payment selection when changing province makes that
  method unsupported, preventing a stale client selection from being submitted.
  Customer production build passed; the callable remains the final authority.
- The callable now independently rejects payment methods whose configured
  province list excludes the requested province, and rejects new orders when
  public settings set `acceptingOrders: false` or `temporaryClosed: true`.
  Unit and Emulator checks both passed for the unsupported-payment and closed-
  store boundaries; client-side filtering is no longer the only protection.
- Idempotent `createOrder` retries now read back the stored order and return the
  same `orderId`, `total`, and `paymentStatus`; the Emulator harness asserts all
  three values on retry.
- The local catalog-rules smoke test passed against the correct
  `floor-232bc-default-rtdb` Database Emulator namespace: an unfiltered public
  read returned `401`, while `orderBy status == PUBLISHED` returned `200` with
  only the synthetic published record; unauthenticated writes to public
  settings, private orders, and user favorites all returned `401`. The
  repeatable Auth/Database/Functions harness then used the Firebase Web SDK
  with a signed-in synthetic customer and received `PERMISSION_DENIED` for
  direct writes to both `private` and `users`, while callable/Admin SDK paths
  continued to pass. The same client could read its own `users/{uid}` node,
  while another user's node and `private/orders` returned
  `PERMISSION_DENIED`. The harness refuses non-local hosts; this remains local
  evidence, not Production Rules parity.
- An earlier CUA-rendered local Customer page could not reach RTDB Emulator
  port `9000` and therefore showed the intentional catalog fallback. A fresh,
  repeatable local browser run now starts the Auth/Database/Functions Emulator,
  seeds synthetic-only data, and reaches `/shop`, `/product/browserRose`,
  `/checkout`, and `/favorites` through the actual Customer app. The rendered
  store name, homepage text, published category, published product, two-image
  gallery, and enabled cash payment were read from the Emulator-backed UI;
  the disabled `ClosedArea` was absent from the delivery selector and the
  draft product was absent from `/shop`. On the mobile-width product page the
  favorite button was initially hidden by a narrow-screen CSS rule; that rule
  was corrected, and CUA read back `إزالة من المفضلة`, then `إضافة إلى
  المفضلة` after removal, and `/favorites` showed one saved synthetic product.
  This is local browser evidence only: no Production write, deploy, or live
  authenticated checkout was attempted.
- Checkout now also renders a local review card listing the selected product,
  quantity, and pre-delivery subtotal before submission. CUA read back one
  synthetic product at `15,000` IQD, the subtotal at `15,000` IQD, the enabled
  University delivery at `4,000` IQD, and no disabled `ClosedArea`; the card
  explicitly states that final discount, stock, and server pricing are checked
  again on submission.
- The admin checkout adds a callable-backed order workflow: payment confirmation,
  approval, status changes, and an inventory lock with one multi-location update.
  Generic Admin CRUD writes now go through an allowlisted `adminWrite` callable
  that checks membership role/permission and rejects sensitive payment fields.
- Private Admin reads now use `adminRead` callable polling and local Rules set the
  `private` parent to non-readable from the browser. Staff linking requires an
  existing Firebase Auth UID and protects immutable bootstrap memberships.
- Staff membership updates now preserve or set an allowlisted permission map for
  catalog, orders, inventory, customers, audit, settings, and staff scopes;
  immutable bootstrap memberships cannot be changed through this flow.
- Synthetic Emulator proof: a Manager with `catalog=true` and `products=false`
  was read back with the same map in both membership and private staff records;
  catalog create succeeded and product create returned `Missing permission:
  products`.
- All allowlisted `adminWrite` operations now append a non-sensitive
  `ADMIN_WRITE` activity record in the same multi-location update as the
  catalog/settings mutation. Emulator readback confirmed a Manager-created
  product and its matching audit entry; Viewer writes and sensitive CVV input
  were rejected.
- Admin Orders displays transfer references when present and exposes the
  approval message only after payment is confirmed; the message is a user-
  initiated WhatsApp link, not an automatic notification.
- Admin Orders now renders `PAYMENT_CONFIRMED` as a read-only dedicated state,
  leaving its transition to `confirmOrderPayment`; `APPROVED` remains the
  selected state in the generic selector so the manager can move it to
  `PREPARING`, while the selector still excludes generic entry to dedicated
  states. The Admin build passed; authenticated order-state runtime remains
  unverified.
- The Functions layer now enforces an explicit order-state transition map and
  rejects unsafe jumps such as `NEW -> DELIVERED`; payment confirmation moves
  eligible orders to `PAYMENT_CONFIRMED` before approval. The transition unit
  tests passed; callable runtime and live Admin acceptance remain unverified.
- The transition map no longer permits cancellation or rejection after
  `APPROVED`, because that state has already reserved inventory and no tested
  release-reservation workflow exists. The boundary is unit-tested; a future
  cancellation-after-reservation flow needs a separate compensating design.
- Latest synthetic approval readback: order total `40,000`, payment
  `CONFIRMED`, order `APPROVED`, reservation `RESERVED`, product stock `2 -> 1`,
  rose material `5 -> 3`, wrap material `2 -> 1`, and repeated approval returned
  `reused: true` without another decrement.
- The repeatable harness also started two `approveOrder` calls concurrently for
  the same order. Exactly one attempt performed the reservation and the other
  completed as a reuse (or was safely rejected as busy); the final readback
  still showed one stock/material decrement, not two.
- Latest synthetic coupon readback: first order total `41,000` from a `40,000`
  subtotal plus `5,000` delivery minus `4,000` coupon discount; a second order
  with the exhausted code returned `DISCOUNT_UNAVAILABLE` and only one usage
  was accepted.
- The same harness read back an automatic category promotion at `42,000` from
  the `45,000` normal total, then confirmed the one-use promotion was exhausted
  and the next no-code order returned to `45,000`. The unit suite now has 11
  passing pricing/state tests.
- Repeatable local Auth/Database/Functions acceptance passed with synthetic
  customer, manager, and second-customer identities. Server pricing returned
  `45,000` IQD, the idempotency retry reused the order, the owner read
  succeeded while the second customer received `NOT_FOUND`, payment moved to
  `CONFIRMED`, approval moved the order to `APPROVED`, repeated approval
  returned `reused: true`, and `NEW -> DELIVERED` was rejected with
  `FAILED_PRECONDITION`. Readback confirmed product stock `2 -> 1`, wrap
  material `3 -> 2`, and reservation status `RESERVED`. The run required a
  longer local Functions discovery timeout because this machine uses Node 25
  while the project requests Node 20; no Production write or deploy occurred.
- The same repeatable harness also passed Admin catalog and identity boundaries:
  an Admin created and read a draft product through the callable, archived a
  category while preserving its product record, received `FAILED_PRECONDITION`
  for a destructive delete, linked a synthetic Firebase Auth UID as an
  `EMPLOYEE` with `products: false`, and a Viewer write received
  `PERMISSION_DENIED`. A synthetic ZainCash order remained `PENDING_REVIEW`
  and its transfer reference read back unchanged. A synthetic Mastercard order
  also remained `PENDING_REVIEW`, read back as `MASTERCARD`, and had no CVV;
  sensitive CVV input was rejected by the Admin callable. This is Emulator
  evidence; Admin browser behavior and Production Rules/deployment remain
  unverified.
- Removed an unsupported `/auth` block from the isolated `firebase.json` after
  Firebase CLI warned that `authorizedDomains` and `providers` were unknown
  configuration properties. The CLI warning disappeared; Google Sign-In code
  remains in `src/firebase.ts` and `signInWithPopup` remains in the Customer
  and Admin clients. This changes local configuration hygiene only and does
  not alter Firebase Console providers or authorized domains.

## Blocking gaps before a Production release

1. Customer checkout cannot currently create orders under the local rules,
   because the callable is only locally emulated and is not deployed. Production
   also has no published catalog/delivery/payment configuration to accept a real
   order, and deployed Rules parity has not been proven. A read-only
   `firebase functions:list --project floor-232bc --debug` check returned
   `403 SERVICE_DISABLED`: the Cloud Functions API has not been used or enabled
   for this project.
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
| RTDB Rules parity | NOT VERIFIED | Local anonymous smoke plus authenticated Firebase Web SDK denial checks passed; Production deployment/parity remains unproven |
| Super Admin preservation | PASS (read-only) | Both exact UID membership records read back |
| Live customer render | PASS (local Emulator browser); Production NOT VERIFIED | CUA rendered the isolated worktree against synthetic RTDB data; new worktree was not deployed |
| Live admin render | NOT VERIFIED for new code | Existing deployed page inspected; no mutation attempted |
| Product/category CRUD | PASS (local callable subset); Production NOT VERIFIED | Synthetic Admin create/read/update, two-image and price readback, category archive, and product-preservation readback passed; full browser acceptance and Production write/readback remain unverified |
| Published product exposure | PASS (local Rules Emulator); Production NOT VERIFIED | Customer query is constrained to `status == PUBLISHED`, direct product/config writes are disabled, and Admin reads through role-checked callable; local smoke returned 401 unfiltered and only the published fixture, rules were not deployed |
| Multi-image gallery | BUILD PASS; upload BLOCKED | Admin can select files locally with validation, store image URLs, and Customer can switch among saved URLs; secure GitHub upload service is not present |
| Published category reflection | BUILD PASS; runtime NOT VERIFIED | Customer subscription and fallback are wired; no authenticated live acceptance |
| Dashboard metrics | BUILD PASS; runtime NOT VERIFIED | Period filter and Firebase-derived indicators compile; no live Admin session readback |
| Reports | BUILD PASS; runtime NOT VERIFIED | Derived financial/operational sections and local CSV export compile; no live Admin session readback |
| Homepage/settings reflection | BUILD PASS; runtime NOT VERIFIED | Admin document editors and Customer hero/header/announcement reflection compile; no live authenticated acceptance |
| AI assistant settings | BUILD PASS; runtime NOT VERIFIED | Customer reads public settings and disables the preview when configured off; real AI generation remains unavailable |
| Rendered Customer shell | PASS (local visual smoke only) | CUA DOM snapshot showed RTL layout and navigation; not proof of live Firebase catalog |
| Create-order backend | PASS (emulator only) | Repeatable authenticated synthetic order harness proved server pricing, store-closure and province-payment enforcement, full retry readback, and owner-only access; Production callable is not deployed |
| Customer cart/checkout wiring | PASS (local config/filter/review browser); callable Production NOT VERIFIED | CUA read back product/quantity/subtotal review, enabled delivery/payment configuration, and omitted disabled delivery; no deployed callable or authenticated live checkout |
| Coupon pricing and usage | PASS (unit + emulator) | 12 server pricing/state tests; emulator coupon and automatic-promotion totals, idempotency retry, usage counter, order discount readback, exhausted-code rejection |
| Payment methods | PASS (local backend + config browser); Production NOT VERIFIED | Structured local editor, disable/archive behavior, server-side province enforcement, and province-aware customer display; no Production mutation or live browser acceptance |
| Import/export safety | BUILD PASS; runtime NOT VERIFIED | Merge-only client flow compiles; no authenticated Admin browser acceptance |
| Destructive admin deletes | PASS (local code/test boundary) | Callable rejects `delete`; category and collection UI use archive/disable updates; no live mutation acceptance |
| Favorites | PASS (emulator + local browser) | Synthetic callable merge/readback plus CUA mobile detail toggle and `/favorites` readback; Google popup/live Production flow remains unverified |
| Customer order tracking | PASS (emulator only) | Owner readback returned a sanitized order summary; a different synthetic UID received `NOT_FOUND`; Google popup/live Production flow remains unverified |
| Customer account order list | PASS (emulator only) | Two synthetic UIDs each received only their own sanitized order summary; no live Google browser acceptance |
| WhatsApp order/approval messages | BUILD PASS; runtime NOT VERIFIED | Customer order and Admin approval links include tracking URLs; opening WhatsApp is not proof of sending |
| Admin order status controls | PASS (local callable); live UI NOT VERIFIED | Payment confirmation, approval, repeat approval, and unsafe transition rejection passed in the Emulator; live Admin controls remain unverified |
| Order status state machine | PASS (local emulator + unit) | Callable runtime rejected `NEW -> DELIVERED`; dedicated payment confirmation and approval transitions were read back; live Admin acceptance remains unverified |
| Payment approval/inventory | PASS (emulator only) | Confirmed payment, concurrent approval lock, stock/material decrement, reservation readback, retry no double decrement; archived-material rejection added but not runtime-proven; Production remains unverified |
| Admin mutation authorization | PASS (emulator only) | Manager write accepted, invalid financial/catalog values rejected, sensitive CVV rejected, Viewer write rejected; Production remains unverified |
| Admin write audit logging | PASS (emulator only) | Manager product create and matching `ADMIN_WRITE` readback |
| Admin private reads/Rules hardening | PASS (emulator only) | `adminRead` role gate and private parent read closure; no Production Rules deploy |
| Staff UID membership linking | PASS (emulator only) | Auth UID lookup, membership/staff readback, non-Super Admin Super Admin assignment rejected |
| Staff scope permissions | PASS (emulator only) | Permission map read back in both membership/staff paths; catalog write accepted and products write denied |
| Default catalog seed | BLOCKED | Preview-only script exists; approved Admin credential is not configured |
| GitHub image upload | BLOCKED | Server-side credential/service not present |

## Master prompt report keys

| Key | Status | Evidence boundary |
| --- | --- | --- |
| CUSTOMER_BUILD | PASS | Customer isolated build passed |
| ADMIN_BUILD | PASS | Admin build passed |
| CUSTOMER_DEPLOY | NOT VERIFIED | No deployment attempted |
| ADMIN_DEPLOY | NOT VERIFIED | No deployment attempted |
| FIREBASE_CONNECTION | PASS | Read-only project/database access |
| RTDB_RULES | NOT VERIFIED | Local Rules Emulator passed; Production parity not proven |
| SUPER_ADMIN_ACCOUNTS | PASS | Both supplied UIDs read back unchanged and immutable |
| DASHBOARD | BUILD PASS; runtime NOT VERIFIED | Firebase-derived dashboard code; no authenticated Admin browser session |
| CATEGORY_CRUD | PASS (local callable); Production NOT VERIFIED | Create/read/archive and product preservation passed in Emulator |
| DEFAULT_CATEGORIES | BLOCKED | Preview seed exists; no approved Admin credential for write |
| PRODUCT_CRUD | PASS (local callable); Production NOT VERIFIED | Create/read/update, status boundary, price and image readback passed |
| DEFAULT_PRODUCTS | BLOCKED | Preview seed exists; no approved Admin credential for write |
| MULTI_IMAGE_UPLOAD | BUILD PASS; upload BLOCKED | URL gallery works; secure upload service absent |
| GITHUB_IMAGE_UPLOAD | BLOCKED | No approved server-side GitHub App/service |
| INVENTORY_SYNC | PASS (Emulator only) | Concurrent approval reserved and decremented once |
| DISCOUNTS | PASS (unit + Emulator) | Coupon and automatic promotion pricing/usage passed |
| FAVORITES | PASS (Emulator + local browser) | Merge/readback and mobile detail toggle passed |
| CART | PASS (local browser/build) | Multi-line cart model and checkout review compiled/rendered; live order not verified |
| PAYMENT_METHODS | PASS (local backend + browser config) | Types, enablement, province enforcement and display passed locally |
| BANK_TRANSFER | BUILD PASS; runtime NOT VERIFIED | Structured fields exist; no live authenticated session |
| MASTERCARD_PAYMENT_INFO | PASS (Emulator safety) | Recipient fields read back; CVV rejected/not stored |
| ZAINCASH | PASS (Emulator only) | Pending review and transfer reference readback passed |
| CASH_PAYMENT | PASS (Emulator only) | Unpaid creation, confirmation and approval path passed |
| WHATSAPP_ORDER | BUILD PASS; runtime NOT VERIFIED | Message URL prepared; opening is not sending proof |
| PAYMENT_CONFIRMATION | PASS (Emulator only) | Authorized confirmation and audit readback passed |
| ADMIN_ORDER_APPROVAL | PASS (Emulator only) | Approval lock and repeat behavior passed |
| WHATSAPP_APPROVAL_MESSAGE | BUILD PASS; runtime NOT VERIFIED | Approval URL/message preparation exists; no automatic sending |
| DELIVERY_AREAS | PASS (local backend + browser) | Enabled fee rendered; disabled area rejected/hidden |
| STAFF_PERMISSIONS | PASS (Emulator only) | UID linking and Viewer/Employee scope checks passed |
| HOMEPAGE_BUILDER | BUILD PASS; runtime NOT VERIFIED | Editors and public reflection are wired; no live Admin session |
| AI_ASSISTANT_SETTINGS | BUILD PASS; runtime NOT VERIFIED | Public enable/disable behavior wired; no external AI generation |
| REPORTS | BUILD PASS; runtime NOT VERIFIED | Derived reports/CSV compile; no live Admin session |
| ACTIVITY_LOGS | PASS (Emulator only) | Admin mutation/payment/order audit records read back |
| IMPORT_EXPORT | BUILD PASS; runtime NOT VERIFIED | Merge-only validation compiled; no live Admin session |
| LIVE_CUSTOMER_TEST | PASS (local Emulator browser); Production NOT VERIFIED | CUA rendered connected synthetic catalog/checkout/favorites |
| LIVE_ADMIN_TEST | NOT VERIFIED | Google-authenticated Admin browser acceptance not performed |
