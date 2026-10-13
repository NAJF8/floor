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

## Blocking gaps before a Production release

1. Customer checkout cannot currently create orders under the local rules,
   while broad private reads would expose too much data to any active member.
2. Payment confirmation and stock reservation need a trusted atomic backend or
   carefully tested transaction/rules design; a browser button is not financial
   proof.
3. GitHub image upload has no approved server-side GitHub App/service in the
   checked repositories. No token was added to frontend code.
4. Product/category seed data requires a preview and explicit approval before
   any Production write. No seed was executed.
5. Authenticated CRUD, non-Super-Admin denial, customer checkout, payment
   readback, inventory idempotency, and physical/live deployment acceptance
   remain unverified.

## Status summary

| Area | Status | Evidence boundary |
| --- | --- | --- |
| Customer build | PASS | Local clean worktree and existing checkout build |
| Admin build | PASS | Local admin checkout build |
| Firebase connection | PASS (read-only) | Firebase CLI project/data reads |
| Super Admin preservation | PASS (read-only) | Both exact UID membership records read back |
| Live customer render | NOT VERIFIED for new code | Existing deployed page inspected; new worktree not deployed |
| Live admin render | NOT VERIFIED for new code | Existing deployed page inspected; no mutation attempted |
| Product/category CRUD | NOT VERIFIED | No Production write performed |
| Orders/payments/inventory | BLOCKED | No trusted backend and no safe isolated acceptance environment |
| GitHub image upload | BLOCKED | Server-side credential/service not present |

