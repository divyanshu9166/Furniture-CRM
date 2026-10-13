# Godowns audit — 13 October 2026

## Implemented fixes

- **Inconsistent inventory values:** Stock View used selling price for raw materials and consumables, whereas summary used cost. Both now use the same category-aware valuation. Explicit zero costs stay zero. Finished-goods selling-price valuation is unchanged; this is not an accounting valuation policy change.
- **Metadata edits:** Separate update schemas preserve omitted type, default and HQ flags. Clearing branch/capacity explicitly stores `null`. Missing references and empty/unknown-field edits fail without modifying records.
- **Configuration concurrency:** Godown/default and branch/HQ changes use transaction-scoped advisory locks inside existing Serializable transactions. Choosing another default remains explicit; editing cannot silently unset the current default.
- **Fractional transfers:** Quantities support base-UOM decimals such as KG/MTR. Requests reject duplicate products, same source/destination, empty/incomplete rows, invalid quantities and more than 200 lines. Product names/SKUs and requester identity come from database/authentication, not client text.
- **Transfer lifecycle:** Source availability is checked when requesting and again at completion. Pending requests do not reserve stock (existing workflow). Completion keeps paired ledger entries, product totals, restock age and product-level batch balances. Cancellation is available for pending requests, is idempotent, and never reverses a completed movement. Completed/history records are not deleted.
- **Safe godown deletion:** An otherwise unused godown with only zero-quantity associations can now be deleted atomically. Nonzero/invalid stock, total mismatches, business/ledger/transfer history, and recoverable product-draft ledger references block deletion. A failure after association cleanup rolls back all cleanup. Product deletion and its existing recovery workflow are unchanged.
- **Receiving versus relocating:** The existing `assignStockToGodown` action remains ADD for compatibility, but its UI clearly says **Receive/Add Stock**. Existing stock must use Transfers (or Manufacturing's existing bulk godown reassignment), avoiding accidental double counting. Quantities are base units, not packs.
- **Capacity display:** Mixed KG/MTR/PCS totals are labelled as mixed quantities and do not show a misleading utilization percentage. Stored capacity/quantities are unchanged.
- **UI/state handling:** Source-specific available products and UOMs, bounded lines, signed-in requester, protected in-flight modal closes, transfer action guards, role-aware controls, refresh errors/retry and generation-protected ledger pagination/refresh. Late responses cannot replace newer results. Loading more entries deduplicates IDs.
- **Sync Stock:** Existing explicit admin-only legacy allocation operation remains available. It uses deterministic product lock ordering, only fills stock with no godown associations, and does not silently repair/reassign existing allocations. No sync was run during this audit.

## Data and workflow boundaries

No live database mutations, stock cleanup, transfer completion, data resets, deployment, commits or pushes were performed. Tests use isolated copy-on-commit fixtures, not `lib/db` or a configured database. No original IDs, quantities, ledger dates, invoices, production orders or credentials are migrated/recalculated by the application edits.

Existing role rules remain: authenticated users can read; ADMIN/MANAGER can manage godowns, receive stock and request/complete/cancel transfers; branch management, godown deletion and legacy sync remain ADMIN-only. Backend guards are authoritative; hiding controls is only UI assistance.

## Required schema migration before release

`prisma/migrations/20261013110000_godown_fractional_transfers/migration.sql` widens only `GodownTransferItem.quantity` from PostgreSQL integer to double precision. All existing integer values are exactly representable. It does not delete rows or recalculate stock/history. The migration was saved and reviewed, **not executed against any database**.

Before production deployment: take a restorable database backup, verify the migration on a restored staging database, and allow a short maintenance window for the column rewrite/lock. Apply the repository's normal `prisma migrate deploy` workflow before starting the rebuilt application. Docker Compose already provides a `migrate` service and makes `app` depend on successful migration; rebuild that service with the updated source too, not only the app image. Review all pending migrations before running it. Do not use `db:reset`, `db push --force-reset`, or seed commands.

On application rollback, retain the widened column. Do not narrow it back to integer after fractional transfers exist, as that would lose information.

## Verification

- 268 regression tests passed: auth, inventory, manufacturing, commerce/follow-ups, billing, walk-ins, email and WhatsApp inbox state.
- Tests cover metadata preservation/null clearing, default/HQ switching, rollback, deletion guards, saved draft history, forged metadata, source availability, decimal completion, batch preservation, cancellation and migration shape. These are isolated tests, **not proof of PostgreSQL concurrency under production load**.
- Targeted ESLint: clean. Prisma client generation and schema validation: successful. Production build: successful (106 routes).
- Full TypeScript check still reports seven pre-existing unrelated errors: `app/actions/financials.ts:234`, `prisma.config.ts:12`, and missing `vitest` imports in five automation/WhatsApp tests. No errors were reported in the changed Godowns files. The existing Next.js config skips type errors during build; build success is not full type-check success.
- `git diff --check`: clean. No ngrok, authentication/session, secrets or unrelated settings changes.

## Remaining release checks

Production data consistency, real concurrent PostgreSQL behavior, SQL migration execution and authenticated browser/mobile interaction have not been verified here. In staging, check ADMIN/MANAGER/STAFF controls, edit/clear a branch and capacity, receive stock once, create/complete/cancel a fractional transfer, reject over-issues, page/refresh ledger, and exercise empty/linked godown deletion plus existing Drafts restoration. Use test records in staging, not customer records.

The audit fixes the confirmed issues above; it does not justify a blanket claim that the entire CRM is bug-free.
