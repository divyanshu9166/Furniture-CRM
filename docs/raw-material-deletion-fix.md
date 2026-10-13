# Zero-stock raw-material deletion — 2026-10-13

## Root cause

Inventory and Manufacturing use the same Product table, not independent raw
material stores. Both removal paths call `moveProductToDraft`. The previous
guard counted every GodownStock row, even if its quantity was exactly zero.
Consequently empty location assignments blocked an otherwise unused item.

A screenshot alone does not prove the selected material has no ledger, BOM or
purchase history. The live VPS/database was not accessed in this investigation.

## Repair and safety

- Both entry points now use `lib/inventory/product-drafts.ts` inside a
  serializable transaction with a product row lock.
- Product stock and every location balance must be exactly zero. Nonzero,
  negative, nonfinite or conflicting balances are not erased or auto-reconciled.
  Tiny nonzero balances that round to zero in the UI are still protected.
- Existing BOM, production, order, quotation, invoice, purchase, return, ledger,
  batch, consumption, scrap, custom-order inventory and transfer guards remain.
  A missing custom-order reference guard was added to prevent the optional
  referenceProductId FK being silently cleared during deletion.
- Only after every guard passes, a recoverable Product draft is created with
  all existing metadata and empty location IDs. Only that product's
  quantity-zero GodownStock rows are removed, followed by the product. Godowns,
  other products, ledger entries and business documents are not deleted.
- Snapshot creation, zero-row cleanup and deletion roll back together on a
  failure. Serializable conflicts retain the existing bounded retry policy.
  Repeated requests cannot create duplicate drafts for an already removed item.
- Restore reinstates the empty assignments for still-existing godowns without
  fabricating stock, ledger entries or batches. Missing godowns are not recreated.
  Legacy drafts without the new optional snapshot field remain compatible.
- Manufacturing removal checks the canonical raw-material category under the
  lock, matching Inventory category aliases. ADMIN/MANAGER permissions remain.
- Single/bulk confirmation text now accurately describes Drafts' 30-day restore
  window. Bulk failures retain the failed selections and report preserved items.
- Inventory, Manufacturing, Godowns and Drafts are revalidated after removal or
  product restoration so both views reflect the same state.

Zero stock is not permission to destroy accounting/production history. Used
materials are intentionally not hard-deleted: the error now names the actual
linked history rather than incorrectly blaming an empty godown row. This repair
does not introduce a soft-archive workflow for historically used materials.

## Verification

- 34 new in-memory transactional tests: zero rows/no allocations, unaffected
  unrelated products/locations, all 15 relationship guards, mismatched/invalid
  balances, rollback at each write step, duplicate/invalid requests, category
  aliases, draft metadata/expiry and safe empty-location restore.
- Combined regression suites: 220 tests passed.
- Targeted ESLint and production build passed.
- TypeScript reports the same 7 pre-existing unrelated errors in financials,
  Prisma config and tests missing vitest; no new errors in the changed files.
- Fixtures do not import lib/db or connect to a real database. Real PostgreSQL
  concurrency and live customer deletion/restore were not exercised.

## Rollout

No new migration, data backfill, SQL cleanup or stock reset is required for this
repair. Deploy the app normally, retaining the usual backup/rollback procedure
and any separately pending migrations. Have an authorised user verify a known
unused, zero-stock material moves to Drafts, disappears from both views, and can
be restored. If a history guard appears, review that link; do not purge ledger,
BOM, purchase or production records to force deletion.

No live data was removed or modified, and no VPS deployment was performed.
