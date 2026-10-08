# Batches and manufacturing: audit / implementation plan

Date: 8 October 2026. Preserve existing inventory audit changes, database IDs, stock, BOMs, production records and ledger history. Do not run migrations against the client database during development.

## Plan and confirmed findings

1. Replace manual-only batch depletion with transactional product-level FEFO (dated lots), FIFO (undated lots), explicit untracked residuals, expiry checks and immutable allocation history. Support fractional base units through a value-preserving integer-to-float migration. Transfers must not consume product-level lots; reversals must restore original allocations, not invent fresh receipt dates.
2. Validate manufacturing database integer fields, IDs, duplicate BOM materials/steps, calendar dates and unit compatibility. Protect BOM edits/step numbering with transactions; avoid corrupting historical snapshots.
3. Guard order and step state transitions in locked transactions. Refuse terminal-order restart, cross-order completion step IDs, stale staff ownership, unsafe deletion and replay. Preserve start timestamps on resume/repeated calls.
4. Fix completion cost/yield: actual consumption plus scrap, zero labour as an intentional override, default machine cost from snapshotted routing, usable output as cost denominator, failed QC yields zero sellable stock, weighted inventory cost rather than replacing cost of all older stock.
5. Make production creation/custom-order status/timeline atomic and eliminate non-atomic stale-client fallback. Validate active work centers/staff and take immutable BOM snapshots in the transaction.
6. Make post-completion QC affect physical/custom stock atomically; refuse changes that would revoke already delivered/sold stock. Keep completed jobs and their stock history protected.
7. Fix manufacturing loaders, mutation errors/save guards, raw-material metadata/stock editing and stale selected-order display. Verify pure rules plus transactional batch/stock rollback fixtures; report real PostgreSQL/browser verification limits.

## Implemented changes

### Lot allocation strategy

New non-transfer receipts create an `AUTO-<ledger ID>` lot and a signed `BatchMovement` allocation alongside the stock ledger in the same transaction. Negative movements allocate earliest-expiry lots first, then undated receipts oldest-first, with receipt date/ID tie-breakers. Normal sales/production/manual usage cannot consume expired lots; an approved negative stock correction or supplier return may remove them. Expiry uses the Asia/Kolkata calendar date and remains usable through its expiry day.

The technique combines expiry-first selection with FIFO for goods lacking expiry dates. This selection principle follows [Odoo's removal-strategy documentation](https://www.odoo.com/documentation/17.0/applications/inventory_and_mrp/inventory/shipping_receiving/removal_strategies.html); its implementation here is specific to this application's existing schema.

- Lots remain **product-level across locations**, consistent with existing data. A transfer does not consume or create another receipt lot. This is not warehouse/bin-level lot picking; the system cannot infer historical per-location lot ownership that was never recorded.
- Untracked legacy stock is an explicit residual (`physical stock - sum of lot balances`). It can be issued only after eligible tracked lots; it is never treated as expired-lot replacement. Overallocated/invalid legacy lots fail with a review message instead of being silently rewritten.
- Order draft reversals restore the original depleted lots, capped by their signed reference history, preserving purchase/expiry dates. Legacy or untracked returned quantities stay explicitly untracked. Receipt reversal for a newly tracked purchase refuses to consume unrelated lots when its own receipt has already been used.
- Batches with automatic allocation history cannot have quantities edited as ordinary metadata. Their numbers, dates, cost and supplier/PO annotations remain editable. Untracked legacy batches can be added/corrected within physical coverage limits. Movements are shown in the desktop stock ledger, and the UI states the product-level tracking scope.
- This is stock-allocation tracking, **not a new FIFO financial COGS engine**. Manufacturing material cost uses the order's frozen BOM cost snapshot (now preserving fractional unit costs); finished-stock valuation is weighted with newly produced usable output.

### Manufacturing fixes

| Area | Root cause / missing behavior | Implemented correction |
| --- | --- | --- |
| Input validation | Fractional IDs, finished counts/minutes/cost totals and impossible dates reached integer columns or invalid date conversion. | Positive integer IDs, valid calendar/order dates, whole finished units/minutes/cost totals, distinct material/timing lines. Material consumption precision is explicitly 0.001 base units. |
| BOM | Duplicate materials, inconsistent UOM, concurrent step numbering/deletion; UI ignored cost overrides. | Locked transactional BOM edits, duplicate prevention, base-unit compatibility, last-material protection, active work-center validation, effective override display. Existing production snapshots are not changed when a BOM is edited. |
| Creation | Display-ID race and custom-order status/timeline updates outside the creation transaction; stale-client fallback could drop staff assignment silently. | Serialized PRD display allocation, BOM snapshot creation and custom status/timeline in one transaction. Required relation failures return errors; no silent fallback. |
| Order states | Arbitrary restart/hold could reopen completed/cancelled jobs; staff checks happened before writes. | Locked transition table, checked staff ownership inside writes, preserved start time on resume, active work centers required on start. |
| Step states | Repeated starts overwrote times; DONE could reopen; updates were allowed on terminal orders. | In-progress parent requirement, consistent timestamps, no DONE reopening, explicit zero minutes respected, transactional time variance. |
| Completion | Client could write timings for another order; stale snapshots/replay; incorrect unused-issued deduction. | Fresh locked order membership validation; one transaction for materials, lots, scrap, usable output and completion. Previously recorded physical issues are accounted for; annotations alone are not physical deductions. |
| Costing/yield | Explicit zero labour was overridden; machine snapshot default omitted; cost divided by defective output; failed QC still had yield; old stock cost overwritten. | Intentional zero overrides, routing-derived machine default when omitted, cost per usable unit, zero failed output/yield, weighted finished-stock cost. Zero-output FAILED jobs can record their loss costs without creating stock. |
| QC | Changing quality/scrap updated only labels, not physical/custom stock. | Completed-job QC adjusts output atomically; new tracked output deductions are restricted to this job's receipt lots. Delivered custom stock and unavailable/sold output cannot be revoked via unrelated stock. Legacy jobs lacking lot provenance require review instead of guessed deductions. |
| Scrap | Reuse relied on outer stale fields and could reuse a waste lot. | Fresh locked lot fields, REUSABLE-only stock return, cost-bearing receipt lot, once-only disposition. |
| MRP | Invalid quantities/UOM and no accounting for expired lots or open-job demand. | Input/unit/duplicate checks; available estimate subtracts expired lots and other open-job planned demand. UI explicitly says it is a conservative planning estimate, not a hard reservation. |
| Deletion | Held/cancelled jobs could lose operational history. | Only untouched PLANNED jobs without custom-order links, stock movements or started steps may be deleted. Other jobs must be cancelled and retained. |
| UI | Infinite loaders, unhandled network failures, stale detail modal, optimistic step success and stale raw-stock replacement. | Error/retry state, safe action results, refreshed order detail, checked inline results, and atomic raw metadata/stock editing with ADD intent or expected-balance SET. Active-job QC routes through completion; later QC starts from saved values. |
| Analytics | Failed/defective output inflated production and READY quantity included delivered history. | Usable-output totals/trends/product rankings and READY-only custom inventory count; labour variance can show savings as well as overruns. |

## Data protection and migration

No live database was connected to for test writes. No seeds, resets, data backfill, schema push, applied migration, commit, push or VPS deployment were performed. `prisma generate` only regenerated the local client; `prisma validate` only validated the schema. Prior inventory changes were retained.

Migration: `prisma/migrations/20261008090000_batch_allocations/migration.sql`.

- Converts `ProductBatch.quantity`, `ProductBatch.remainingQty` and `MaterialConsumption.unitCost` from integer to double precision. Existing integer values convert exactly; this allows fractional new quantities/cost snapshots without rounding them to whole units.
- Adds `BatchMovement`, restrictive foreign keys and lookup/allocation indexes.
- Contains no DELETE, TRUNCATE, existing-record UPDATE, historical backfill or dropped column/table. The DDL is transactional, but takes table locks; use a controlled deployment window.
- **The new application requires this migration before serving requests.** Existing compose configuration already has a `migrate` service required by `app`; neither compose nor secret/ngrok/session files were changed.

Do not revert these columns to integers once fractional values exist. Do not blindly downgrade to an older generated client; use a compatible rollback build or a verified coordinated backup restore.

## Verification — 8 October 2026

| Check | Result |
| --- | --- |
| `npm run test:inventory` | **27 passed / 0 failed**. Includes FEFO/FIFO, expiry, fractional units, original-lot reversal, transfer conservation, multi-location allocation rollback, metadata-plus-stock rollback and prior inventory coverage. |
| `npm run test:manufacturing` | **7 passed / 0 failed**. State/timestamp/ownership guards, material/step membership, validation, usable output, zero/default costs, weighted cost and locked operation fixtures. |
| Focused ESLint on modified action/UI/helpers/validation files | **No errors**. Five existing `next/no-img-element` performance warnings remain in manufacturing UI. |
| `npm run build` | **Passed**, optimized compilation and 107/107 pages. Existing config skips build-time type checking. |
| `npx tsc --noEmit --pretty false` after build | **No diagnostics in changed inventory/manufacturing files**. Repository still has unrelated errors in `app/actions/financials.ts:234`, `prisma.config.ts:12` and five existing tests importing unavailable `vitest`. |
| `npx prisma validate` / local client generation | **Passed**. Does not verify migration execution against an actual database. |
| `git diff --check` | **Passed**, Windows line-ending notices only. |

Tests use isolated transaction fixtures and pure helpers. They do not simulate real PostgreSQL lock scheduling or exercise every server action through an authenticated browser. Full manufacturing completion/QC integration, migration-on-restored-data and mobile visual checks remain staging acceptance work; the local build is not a bug-free production guarantee.

## Safe deployment and acceptance

1. Verify a restorable database and uploads backup. Restore it to staging and record product/location totals, original lot IDs/balances, BOMs and production counts. Review old mismatches/negative balances/duplicate material lines; do not bulk rewrite them.
2. Apply the migration to the **restored staging database**, regenerate/build the client/application and check old values/counts remain unchanged. Use normal `prisma migrate deploy`, never reset/seed/force schema push.
3. Exercise manager/staff permissions, BOM units/overrides and concurrent routing edits. Test create/start/hold/resume, terminal restart rejection, staff reassignment, bad/cross-order step IDs and concurrent completion against real PostgreSQL.
4. Test mixed-expiry/undated lots, fractional material usage, expired shortage rollback, receipts, multi-location issue, transfers, order/PO draft reversal and ledger allocations. Compare product total to location sum and batch total to physical stock. Don't perform test writes in customer production data.
5. Complete ordinary and custom jobs with zero/partial/failed output, scrap/reuse/disposal, explicit-zero labour, default machine cost and fractional BOM override. Verify weighted inventory cost, custom READY quantities, multi-job custom status and every rollback path.
6. Test repeated QC and correction after partial sales/delivery. Corrections must not steal unrelated lot stock; legacy output with insufficient provenance must show a review error. Test raw metadata save plus insufficient stock failure leaves both unchanged.
7. After staging passes, schedule a maintenance window, stop new production writes, build the deployment image, apply migration and start the app. With the current compose services, the explicit migration step is `docker compose run --rm migrate`; build its updated image first. Ensure it exits successfully before starting `app`. Keep a compatible rollback image and backups.
8. Perform read-only production verification first. Any stock/batch reconciliation must be based on the client's verified count and approved operation, not an automated repair or smoke-test write.

## Files in this follow-up

- `app/(dashboard)/inventory/page.js`, `app/(dashboard)/manufacturing/page.js`.
- `app/actions/batches.ts`, `manufacturing.ts`, `products.ts`, `godowns.ts`, `purchases.ts`, `drafts.ts`.
- `lib/inventory/batches.ts` (new), `stock.ts`, `products.ts`, `stock.test.ts`.
- `lib/manufacturing/logic.ts`, `operations.ts`, `logic.test.ts` (new); existing downloads helper unchanged.
- `lib/validations/batch.ts`, `manufacturing.ts`, `calendar.ts` (new).
- `prisma/schema.prisma`, the new migration, `package.json`, this report and the superseded-report notice in `docs/inventory-audit.md`.

Unrelated chatbot, email, ngrok, session and VPS configuration files were not changed.
