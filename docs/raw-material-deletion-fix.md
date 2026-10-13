# Raw-material creation, godown assignment and deletion — 2026-10-13

## Root cause

Inventory and Manufacturing use the same Product table, not independent raw
material stores. Both removal paths call `moveProductToDraft`. The previous
guard counted every GodownStock row, even if its quantity was exactly zero.
Consequently empty location assignments blocked an otherwise unused item.

The subsequent screenshot showed ADJUSTER was then blocked by ledger history.
The user explicitly requested removal of that ledger along with the item, plus
one raw-material creation entry point and bulk physical godown assignment.
The live VPS/database was not accessed in this investigation.

## Unified creation and godowns

- Inventory retains the raw-material view but no raw-material Add option. Its
  header links directly to Manufacturing / Raw Materials. Typing a raw-material
  alias into the finished-product form or its bulk import is rejected too.
- Manufacturing single add and CSV/Excel import both require an explicitly
  selected receiving godown. Positive opening balances and zero assignments are
  persisted through the same stock engine. Conversion is applied exactly once.
- SIZE is descriptive; Unit Size is a separate positive numeric conversion
  factor. Single add and import expose consistent UOM/reorder/conversion fields;
  invalid rows are reported before import instead of silently filtered out.
- Selected raw materials can be assigned to a godown in batches of up to 200.
  Existing allocated stock transfers to the destination (paired TRANSFER_OUT/IN
  ledger entries), preserving total stock, restock age and global batch balances.
  Legacy unallocated balances are assigned directly with provenance. Zero items
  get an empty assignment. Repeating an unchanged assignment is idempotent.
- Bulk assignment is atomic. A missing item/godown, non-raw category, stock
  mismatch or failed ledger write rolls back the entire selection. ADMIN/MANAGER
  access is required. Existing data is not backfilled or reassigned automatically.

## Repair and safety

- Both entry points now use `lib/inventory/product-drafts.ts` inside a
  serializable transaction with a product row lock.
- Product stock and every location balance must be exactly zero. Nonzero,
  negative, nonfinite or conflicting balances are not erased or auto-reconciled.
  Tiny nonzero balances that round to zero in the UI are still protected.
- Existing BOM, production, order, quotation, invoice, purchase, return,
  consumption, scrap, custom-order inventory and transfer guards remain.
  A missing custom-order reference guard was added to prevent the optional
  referenceProductId FK being silently cleared during deletion.
- Only after every guard passes, a recoverable Product draft is created with
  all metadata, empty location IDs, full ledger, depleted batches and allocations.
  That product's allocations, depleted lots, ledger, zero balance rows and master
  item are then removed together. No other product, godown or business document
  is deleted. Nonzero batch balances and cross-product allocations are protected.
- A ledger row no longer blocks deletion solely because it exists. Live business
  document references are still checked (including lost item FKs); empty invoice
  or production tables do not block orphaned historical references. Unknown
  reference types remain protected rather than guessed.
- Snapshot creation, zero-row cleanup and deletion roll back together on a
  failure. Serializable conflicts retain the existing bounded retry policy.
  Repeated requests cannot create duplicate drafts for an already removed item.
- Restore recreates original ledger amounts/timestamps, depleted batches and
  allocations with remapped IDs, without creating new receipts or stock. A godown
  referenced by saved ledger must still exist; otherwise restore rolls back and
  retains the draft. Legacy snapshots without history remain compatible.
- Manufacturing removal checks the canonical raw-material category under the
  lock, matching Inventory category aliases. ADMIN/MANAGER permissions remain.
- Manufacturing and Inventory have single and bulk deletion through one engine,
  including consumables/finished items. Bulk removal uses one request and
  independent item transactions; successes and protected failures are explicit.
- Confirmation text describes ledger removal and the 30-day recovery window.
  The Draft detail displays saved history counts and warns that expiry/permanent
  purge also removes the history recovery snapshot. Reading/purging the Drafts
  list now requires the same ADMIN/MANAGER access as its management UI.
- Inventory, Manufacturing, Godowns and Drafts are revalidated after removal or
  product restoration so both views reflect the same state.

Standalone inventory history is removed as explicitly requested, with a
30-day recoverable snapshot. Active business documents/BOMs/production are not
force-deleted or detached. Empty business tables simply make these checks pass.

## Verification

- In-memory transactional tests cover ledger-only and all-category removal,
  full history restore/ID remapping, preserved unrelated products, write rollback,
  live/orphaned references, bulk partial failures, split/zero/unallocated godown
  assignment, repeated assignment, preserved batches and one-time conversion.
- Combined regression suites: 244 tests passed.
- Targeted ESLint and production build passed.
- TypeScript reports the same 7 pre-existing unrelated errors in financials,
  Prisma config and tests missing vitest; no new errors in the changed files.
- Fixtures do not import lib/db or connect to a real database. Real PostgreSQL
  concurrency and live customer deletion/restore were not exercised.
- Browser UI QA could not start: the computer-use helper reported a missing
  kernel-assets path even after reset/retry. The ignored synthetic harness is at
  `.local-dev/inventory-flow-qa.mjs`; visual/interactive verification is pending.

## Rollout

No new migration, data backfill, SQL cleanup or stock reset is required for this
repair. Deploy the app normally, retaining the usual backup/rollback procedure
and any separately pending migrations. Have an authorised user verify a known
zero-stock material with standalone ledger history moves to Drafts, disappears
from both views/the active ledger, and restores with its original history. Test
creation/import with the desired godown and bulk assignment without changing
total stock. If a live-document/BOM/production guard appears, review that link;
do not delete business documents to force item removal.

No live data was removed or modified, and no VPS deployment was performed.
