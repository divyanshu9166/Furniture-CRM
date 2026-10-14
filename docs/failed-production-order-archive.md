# Failed production order removal

## Cause and scope

The screenshot's `PRD-0001` has lifecycle status `COMPLETED` and quality `FAILED`. It is not a failed-to-create or untouched planned order. Previously, both desktop/mobile exposed Delete only for `PLANNED`, and the server rejected hard deletion of operational jobs. Failed QC does not mean materials were never consumed or no costs were incurred.

The safe implemented option is **Archive failed order**, not permanent deletion or cancellation. It removes a completed/FAILED job from the default current-order list, with a reversible Archived view. It does not release BOM/raw-material/business references or undo consumption. The existing hard Delete for untouched planned jobs is unchanged.

## Implemented behavior

- ADMIN/MANAGER can archive a completed job with `FAILED` QC from either desktop or mobile actions. Other lifecycle/quality combinations are rejected, even if the UI or request is stale.
- Confirmation requires the exact order display number and a nonblank bounded reason. Archive actor comes from the authenticated session. Repeated requests preserve the first archive timestamp/actor/reason.
- Archive metadata is stored on the original ProductionOrder. The job, dates, QC/status, costs, BOM, assigned staff, consumptions, production steps, product/godown stock, batches, ledger, scrap and custom inventory links remain intact. There is no 30-day expiry or Draft purge for this archive.
- Default Production Orders view hides archived jobs. Users can choose Current, Archived or Current + archived and restore a job. Restore clears only visibility metadata, never restarts production, changes QC or receives stock again. Last archive actor/reason remain recorded.
- Archived jobs are read-only to lifecycle, progress, step-note and QC writes. Restore before making changes. The staff portal hides archived jobs from its assigned-job list; admin history remains accessible.
- Analytics, job costing and header historical totals retain archived jobs so historical expenditure/failure figures do not silently disappear. Product/BOM/work-centre deletion guards continue to see their production history. Archiving does **not** fix or bypass the six remaining raw-material BOM links discussed earlier.
- Refresh generations discard background requests from before archive/restore so an old poll does not put a freshly archived job back into the current list.

## Required deployment migration

`prisma/migrations/20261013153000_production_order_archive/migration.sql` adds nullable `archivedAt`, `archivedBy`, `archiveReason` columns and an archive-date index. It does not delete or update existing rows or rewrite stock/history. Existing jobs start unarchived.

The migration is prepared, **not executed**. Before production deployment, take a restorable database backup, validate the migration on a staging copy, review other pending migrations, and run the repository's normal migration deployment workflow before starting the rebuilt app. Docker Compose already has a `migrate` service on which `app` depends; rebuild that service from the updated source as well. Do not run reset, force-reset or seed commands. Leave the additive columns in place on application rollback.

## Verification

- 304 regression tests passed across auth, inventory, manufacturing, commerce, billing, walk-ins, email and WhatsApp inbox state. Archive-specific tests use an isolated copy-on-commit fixture, never `lib/db` or a live DATABASE_URL.
- Tests cover split operational/history preservation, eligible/ineligible status and quality combinations, explicit confirmation/reason, forged metadata rejection, duplicate operations, metadata failure rollback, staff/read-only guards, visibility filters and additive migration/source wiring checks.
- Prisma generation and schema validation succeeded. Production build succeeded (106 routes). Targeted ESLint has no errors; Manufacturing retains six pre-existing image/unused-suppression warnings.
- Full TypeScript check still reports seven pre-existing unrelated errors in financials, Prisma config and missing Vitest test imports. No new errors were reported in changed archive/manufacturing code. The existing Next.js configuration skips type errors during build.
- No live order was archived, restored or deleted. No stock was reset/returned, and no BOM, ledger, invoice, production consumption or customer data was cleaned up. No deployment, commit or push was performed during implementation.

Real PostgreSQL concurrency and authenticated mobile/desktop interaction remain staging verification tasks. Verify the actual failed order's stock/history before any request for a permanent test-data cleanup; that would be a separate, explicitly scoped operation.
