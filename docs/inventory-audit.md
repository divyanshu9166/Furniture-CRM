# Inventory audit and implementation plan

**Follow-up, 8 October 2026:** The historical verification below describes the 7 October changes. Automatic FEFO/FIFO lot allocation and manufacturing fixes now supersede its manual-batch/no-migration statements. Read [the current batches/manufacturing report](manufacturing-audit.md) before deployment: a value-preserving schema migration is now required. Earlier test counts are historical, not the latest results.

Scope: Inventory Products (finished goods, raw materials, manual consumables), locations, alerts, ledger, groups, batches, aging, imports, and the stock writers that feed these views.

## Data protection

- Do not run seeds, resets, database push, destructive migrations, or automatic repairs against existing data.
- Keep the current schema and product IDs. Existing stock, batches, sales/purchase references and ledger history remain intact.
- Make requested stock movements transactional, validate availability, and reject ambiguous differences between product and location totals. Legacy stock without any location rows may be allocated with an explicit opening-balance ledger entry during a requested operation.
- Preserve existing explicit SKUs on import; report duplicates and invalid rows instead of renaming duplicates or coercing negative values to zero.
- Verify with isolated fixtures; do not create test products in the client's database.

## Findings and work order

| Priority | Finding | Implementation and verification |
| --- | --- | --- |
| P1 | Stock deduction silently clamps to zero; ledger records the larger deduction. Concurrent read/write adjustments can lose stock. | Shared transactional stock engine, product locks, finite quantities, strict availability checks and transaction retry. Test stock/ledger conservation and rollback. |
| P1 | Transfer issues and receipts commit separately; replay can move stock twice; duplicate lines bypass initial checks. | Complete entire transfer in one transaction, recheck status and source stock, reject duplicate product lines. Verify failure leaves both locations and transfer untouched. |
| P1 | Product creation commits before opening stock allocation. | Category/product/location/ledger creation in one transaction; invalid location or allocation failure rolls everything back. |
| P1 | Metadata update accepts arbitrary stock changes and lacks validation/auth; raw-material deletion removes BOM and ledger history. | Authenticated, schema-validated updates; stock changes only through stock action; refuse unsafe unit conversion; use protected draft flow for deletion. |
| P1 | Purchase receipts/returns write only Product.stock, leaving location stock and ledger inconsistent. | Route linked stock movements through the same engine in the document transaction. |
| P2 | Stock UI uses unloaded/stale location quantities, silently clamps removal, ignores action errors, discards reason/notes and has no save guard. | Load locations initially, send ADD/REMOVE intent to the server, preserve reason/notes, check results and keep failed form open. Refresh dependent panels. |
| P2 | Imports silently drop invalid rows, rename explicit duplicate SKUs and clamp invalid values. | Validate each row, explicit per-row failures, unique generated SKUs only for blank SKU. Show complete import results. |
| P2 | Batch quantities/dates accept invalid database values; errors are unhandled; no correction workflow. | Shared validation, duplicate handling, transactional stock coverage check, batch metadata editing. Clearly distinguish batch metadata from physical stock receipts. |
| P2 | Group counts/names stale after product changes; no browsing/filter by group. | Refresh related views and add group filtering/product browsing. Transactional hierarchy validation. |
| P2 | Empty/error loaders can leave infinite spinners; batches/aging failures appear as empty success. | Independent errors and refresh/retry controls; always finish loaders. |
| P2 | Aging uses missing createdAt, counts unknown dates as fresh stock, and hides unbatched products if any batch exists. | Return createdAt; include unbatched residual stock alongside batches; mark estimates explicitly. |
| P2 | Raw-material add button hidden; duplicated group input in add form edits unrelated edit state; alerts only reflect last selected product type. | Restore manual add, one group field, alerts across inventory, responsive filters/tabs and accurate location counts. |
| P2 | Draft snapshot/restore loses brand, unit size and bulk price; check/delete race can erase new stock history. | Preserve all inventory metadata; atomic protected draft movement/restore. |

## Acceptance checks

1. Opening stock creates one product and matching location/ledger entries, or creates none on failure.
2. ADD/REMOVE are based on committed stock; excessive removal and stale SET fail without writes.
3. Transfer completion conserves total stock, writes matching paired ledger entries, and refuses replay.
4. Manual consumable usage records reason/notes; consumables stay out of sellable/manufacturing lists.
5. Import rejects duplicates/invalid rows without changing existing products; every row is accounted for.
6. Group assignment/filter/edit and batch create/correction show clear errors and current counts.
7. Aging includes tracked batches and untracked residual stock with honest date/value labels.
8. Product draft operations preserve metadata and reject products with business or stock history.
9. Build, focused lint, relevant TypeScript checks and isolated regression tests pass. Live VPS/Meta/customer data are outside local verification.

## Implementation outcome — 7 October 2026

The findings above have been addressed in the local code. No customer database mutation was performed during this audit. This is a code/fixture verification report, not a claim that every production workflow has been exercised on the VPS.

### Completed plan

1. **Protect and validate writes:** Introduced one internal stock engine with serializable transactions, product locks, bounded conflict retries, strict availability checks and atomic balance/ledger writes. Opening-stock creation is atomic. Metadata cannot bypass the stock action. Unit/pack-size changes are refused once stock, ledger or batch history exists.
2. **Keep connected workflows consistent:** Routed order deductions, purchase receipts/returns, staff adjustments, manufacturing consumption/output, scrap reuse and stock-related draft reversals/restoration through the same engine. Document/transfer state is rechecked inside the transaction to prevent duplicate processing. Manufacturing backflush deducts actual consumption plus scrap, not unused issued annotations.
3. **Complete inventory controls:** Restored raw-material creation; fixed group assignment/filtering/browsing, loaders and action-error handling; added safe batch editing and combined-balance warnings; included untracked stock in aging; added product/location ledger filters and older-entry pagination. Manual consumables support daily-use reasons/notes and are rejected as sales items or new BOM materials.
4. **Prevent silent data changes:** Imports report each invalid/duplicate row, retain explicit existing SKUs and do not overwrite products. Linked products cannot be deleted with their history. Draft snapshots preserve unit size, brand, bulk price and original dates. Managers can explicitly approve a reviewed stock reconciliation; the action checks that displayed totals have not changed and appends audit entries.
5. **Verify:** Added isolated stock-engine/validation regression tests, ran focused lint, a full-project TypeScript diagnostic check and the production build. See results below.

### Important stock and batch semantics

- On item creation, the entered number of packs is multiplied by unit size to obtain physical stock in the item's base unit. Subsequent stock adjustments operate in base units; location cards now show the unit.
- ADD/REMOVE send a quantity intent, not a stale precomputed balance. SET in the inventory form includes the displayed expected balance and fails if it changed concurrently.
- Raw-material/consumable valuation uses cost price. Finished-goods inventory/location valuation retains its existing selling-price basis; cost value is also available in the location summary. Existing prices are not rewritten.
- Batches are **manual annotations of existing physical stock**, not additional receipts. Receive stock through Update Stock/purchases before adding a batch; manually reduce its remaining quantity after usage. Automatic FIFO/FEFO allocation is **not implemented**; misleading UI claims were removed. Batch quantity/cost fields retain the existing database's integer constraints.
- New batch allocations cannot exceed physical stock. Legacy over-allocation can be reduced incrementally even when correcting one record does not yet remove the whole discrepancy. No old batch is automatically rewritten.
- Aging combines tracked batches and untracked residual stock, caps reported batch amounts at available stock, and labels untracked dates as estimates. It does not reconstruct historical receipt dates that were never stored.
- An existing product/location mismatch blocks normal movements rather than guessing which total is correct. A manager must verify physical balances and explicitly choose the reconciliation basis. Negative location rows require individual review; they are not silently clamped or bulk repaired.
- Products with positive stock but **no location rows at all** retain that stock; a requested stock operation allocates the legacy opening balance with an audit entry inside the same transaction. If the requested operation fails, that allocation also rolls back.

## Verification results

| Check | Result | Scope / limitation |
| --- | --- | --- |
| `npm run test:inventory` | **21 passed, 0 failed** | Isolated transactional fixtures exercising the real stock engine and validation helpers. No database/environment import. |
| Focused ESLint over every changed action, inventory UI and helper/validation file | **Passed** | No lint diagnostics. |
| `npm run build` | **Passed** | Optimized production compilation and 107/107 static pages. Existing Next configuration skips build-time type checking, so the separate check below matters. |
| `npx tsc --noEmit --pretty false` | **Not globally clean** | No errors reported in changed inventory/linked action files. Existing unrelated errors remain in `app/actions/financials.ts:234`, `prisma.config.ts:12`, and five tests importing unavailable `vitest` types. |
| `git diff --check` | **Passed** | Windows line-ending notices only; no whitespace errors. |
| Live PostgreSQL concurrency / browser / VPS smoke tests | **Not run** | Fixtures do not prove actual database lock scheduling. Mobile layout was code-reviewed and compiled, not visually exercised on devices. |

Tests cover pack-based opening stock, full rollback on ledger failure, duplicate/missing references, daily consumption notes, excessive removal, preserved legacy mismatches, opening allocation rollback, multi-location deductions, transfer conservation/replay/partial-failure rollback, finite quantities, reviewed reconciliation and stale approval, bounded transaction retries, negative legacy product correction, product/transfer/batch validation, aging boundaries and incremental legacy batch correction.

Existing build warnings about custom cache headers, middleware convention and missing local `REDIS_URL` are separate from these inventory fixes. They were not suppressed or changed.

## Files changed

All paths below are relative to the project root.

| File | Purpose |
| --- | --- |
| `app/(dashboard)/inventory/page.js` | Inventory controls, responsive tabs/filters, errors, groups, stock adjustments/review, imports, batches, aging and ledger pagination. |
| `app/actions/products.ts` | Validated atomic creation/import/update/stock actions and reviewed reconciliation. |
| `app/actions/godowns.ts` | Location/default protection, atomic transfers, stock actions, valuation and ledger pagination. |
| `app/actions/stock-groups.ts` | Transactional group hierarchy validation and protected deletion. |
| `app/actions/batches.ts` | Validated manual batch creation/correction and complete aging coverage. |
| `app/actions/drafts.ts` | Protected product deletion, complete metadata snapshots, transactional stock reversal/restore. |
| `app/actions/orders.ts` | Atomic sale deductions and sales-item eligibility. |
| `app/actions/purchases.ts` | Atomic receipt/return location and ledger synchronization. |
| `app/actions/manufacturing.ts` | Shared stock movements, backflush correction, replay guards and material eligibility. |
| `app/actions/staff.ts` | Staff stock log and location/ledger changes in one transaction. |
| `app/actions/invoices.ts` | Reject manual inventory items in linked invoice lines. |
| `app/actions/quotations.ts` | Reject manual inventory items in linked quotation lines; unlinked custom lines remain supported. |
| `lib/inventory/stock.ts` (new) | Shared internal transactional stock/reconciliation/transfer engine. |
| `lib/inventory/products.ts` (new) | Atomic item creation and sellable-item validation helpers. |
| `lib/inventory/category.ts` (new) | Canonical reserved inventory category classification. |
| `lib/inventory/aging.ts` (new) | Shared aging date/bracket calculations. |
| `lib/inventory/stock.test.ts` (new) | Isolated inventory regression suite and rollback fixtures. |
| `lib/validations/product.ts` | Product metadata, units and stock intent validation. |
| `lib/validations/godown.ts` | Location/default and distinct transfer-line validation. |
| `lib/validations/batch.ts` (new) | Batch date/count validation and physical-stock coverage rules. |
| `package.json` | `test:inventory` command; no new dependency added. |
| `docs/inventory-audit.md` (new) | Findings, full fix plan, implementation and verification report. |

No Prisma schema/migration, secrets, ngrok configuration, session implementation, chatbot or email-marketing code was changed. Changes outside the inventory screen are restricted to the actions that feed inventory balances or item eligibility. No commit, push or deployment was performed.

## Safe release / acceptance sequence

1. Take and verify a restorable database backup plus product-upload backup before deployment. Keep the previous application image/code available for rollback. Do not run reset, seed or destructive database push; these changes require no schema migration.
2. Run the 21 regression tests, lint and build in the deployment environment. Resolve the unrelated global TypeScript issues separately before claiming the entire repository has a clean type check.
3. On a restored staging database, sign in as manager/staff and check each inventory tab, mobile horizontal scrolling, group assignment/filtering, image-upload failure handling and import per-row feedback. Confirm staff restrictions produce understandable errors.
4. With disposable staging items, test opening stock, daily consumption, fractional base-unit adjustment, insufficient stock, stale SET, multi-location transfer/replay, purchase receipt/replay, return and staff update. Verify product total equals location sum and each movement has a matching ledger entry. Exercise simultaneous adjustments against real PostgreSQL.
5. Test ordinary and custom-order manufacturing separately; verify consumed-plus-scrap backflush and repeated completion/cancellation/reuse rejection. Test order/purchase draft reversal and restore, including preserved product metadata and dates.
6. Review existing discrepancies against a physical count. Do not press reconciliation or Sync Stock across production inventory without reviewing the affected records. Use manager-approved reconciliation only for verified non-negative locations; manually investigate invalid negative location records.
7. Test batches/aging with mixed tracked and untracked stock and over-allocated legacy batches. Check corrections only change annotations, not physical balances. Verify ledger pagination reaches older records.
8. After staging acceptance, deploy application code and perform read-only checks on production inventory totals, groups and ledger. Any production reconciliation/adjustment must be an intentional client-approved stock operation, not a test write.
