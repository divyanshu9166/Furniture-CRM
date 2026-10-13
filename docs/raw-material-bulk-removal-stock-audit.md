# Raw-material bulk removal and stock summary follow-up

## Confirmed causes

The failed deletion screenshot shows every selected item being rejected by the zero-stock policy. The bulk action used the same guarded removal engine as individual deletion; it was not an Inventory-versus-Manufacturing duplicate-table conflict. Nonzero product OR godown stock blocked removal even for otherwise unused raw materials.

The Godowns header summed all base quantities across locations and UOMs. `160328.8` was **not a count of distinct materials**. Combining screws measured in PCS, fractional KG and MTR into one number is not a meaningful inventory count. Raw-material entry quantities can also differ from base quantities by `unitSize`. Matching recorded totals cannot prove the actual physical count is correct.

No production database was accessed, so whether the client's underlying records have additional inflated/incorrect quantities remains unverified. Do not infer a correct balance from the screenshot or set all records to zero.

## Changes

1. Manufacturing bulk deletion now has an explicit, unchecked-by-default **Also move stocked materials to Drafts** option. It permits otherwise unused raw materials with valid, consistent nonzero stock to be archived. Without that option, the existing zero-stock policy remains.
2. Stocked archive stores exact product stock, each godown quantity, unit factor, full ledger, batch balances and allocations in the existing 30-day Draft. Active product/history rows are removed atomically only after the snapshot succeeds. It is not a stock correction, sale or consumption. After 30 days the existing draft expiry/purge policy applies; the confirmation explains this.
3. Restoring these drafts recreates original location quantities and batch balances without multiplying unit size again or adding fake receipt ledger/batches. Missing godowns, invalid snapshots or restoration failures preserve the draft and roll back reconstructed stock/history.
4. Business-document/BOM/production/transfer links, invalid balances, product/location mismatches and overallocated batches still block archive. This option does not bypass FK/history protection. Inventory/consumables retain their prior deletion policy; stocked archive is restricted to the explicit raw-material route and existing ADMIN/MANAGER role guard.
5. Requests are split into 25-item chunks with progress. Each item has its own transaction; successful removals are not undone by a protected item. Blocked or unconfirmed IDs remain selected. Interrupted requests are not automatically retried because some removals may already have committed.
6. Full deletion results appear in a scrollable dialog instead of a giant toast containing only five failures. Results separate moved items from blocked/unconfirmed ones.
   A single stocked-material delete opens the same opt-in archive dialog. Draft details/confirmations show saved base stock and clarify exact restoration versus permanent loss of the recovery snapshot.
7. Godowns shows **Stocked Products (unique)**, deduplicated across locations, excluding zero-quantity assignments. Quantities are displayed separately per base UOM. Godown cards distinguish stocked from assigned products.
8. **Check stock balances** is a read-only ADMIN/MANAGER report comparing product/godown/batch balances and showing entry quantity × unit factor. It highlights invalid balances, mismatches, unallocated legacy stock and batch over-allocation. High balances are visible for review; matching totals are explicitly labelled physically unverified. Nothing is automatically reconciled or reset.
9. Godown deletion now also protects godowns referenced by recoverable stock snapshots, even when no saved ledger exists.

## Use after deployment

- Manufacturing → Raw Materials → select materials → Delete selected → enable **Also move stocked materials to Drafts** only if you intentionally want those quantities removed from active inventory → **Move Including Stock**. Check the result dialog. Restore accidentally archived materials from Drafts within 30 days.
- Godowns → **Check stock balances** → inspect the largest records and any review flags. Compare entry quantity and base-unit factor with the original import and physical count. To correct a mismatch, use the existing Inventory location reconciliation flow with verified values. If recorded product/godown totals agree but are physically wrong, use the appropriate explicit stock adjustment with a reason; do not archive merely to hide the error.
- Linked materials are deliberately kept. Resolve the listed business references safely rather than deleting unrelated invoices, BOMs or production orders.

These code changes were not deployed or run on live customer records. No reset, seed, bulk deletion, reconciliation, ledger cleanup, commit or push was performed. This follow-up introduces no new database schema migration; stock snapshots use the existing Draft JSON field. Earlier migration requirements remain unchanged.

## Verification scope

290 regression tests passed across auth, inventory, manufacturing, commerce, billing, walk-ins, email and WhatsApp inbox state. Targeted lint has no errors, and the production build passes (106 routes).

Isolated tests cover nonzero split-stock archive/restore, preserved pack factors, legacy unallocated stock, missing godowns, guarded business links, batch validation, failures at each snapshot/deletion/restoration stage, 253-item chunking, network uncertainty, unique product counts, separated UOM totals and read-only diagnostics. No test loads `lib/db` or modifies customer records.

Real PostgreSQL concurrency, production balances and authenticated browser/mobile interaction still need staging/live read-only verification. The global TypeScript check retains seven unrelated existing errors; Next.js's existing build setting skips type errors. Manufacturing ESLint reports six pre-existing warnings (images/unused suppression), with no lint errors.
