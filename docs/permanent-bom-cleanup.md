# Permanent BOM and archived failed-production cleanup

The owner explicitly requested permanent deletion after discovering that archive intentionally retains production/BOM references. This follow-up adds a separate irreversible cleanup flow. Archive/Restore behavior and normal deletion guards remain unchanged.

## Use after deployment

1. Sign in as ADMIN. Take and verify a restorable database backup.
2. Manufacturing → Bill of Materials → click the selected BOM's trash icon. For a BOM with production history, this opens a **Permanent BOM & Archived Failed Orders** preview instead of blindly calling ordinary Delete.
3. Inspect the exact BOM name, listed PRD orders, counts, cost-report effects and any blockers. All linked jobs must be archived, `COMPLETED`, and quality `FAILED`.
4. Enter a cleanup reason, type the exact `DELETE BOM <id>` phrase shown in the preview, acknowledge permanent removal/no stock return, then choose **Permanently Delete Listed Records**.
5. Review the success receipt and refreshed lists. If the request/connection is interrupted, refresh the list/preview before retrying; do not assume nothing committed.

No Draft or restorable document snapshot is created. Recovery requires an external database backup. Only a minimal audit receipt with former IDs/numbers, counts, actor, reason and deletion date remains.

## What changes

| Record | Permanent cleanup effect |
| --- | --- |
| Selected BOM | Removed, including its material lines and routing steps |
| Listed eligible archived failed jobs | Removed, including their production steps and consumption records |
| Their non-live scrap history | Removed only if not live/invalid/cross-order; live scrap prevents cleanup |
| Their Production/ProductionQC/Scrap ledger records | Kept with original quantity, balance, date, entry type and original worker; only deleted-document reference/notes become `ProductionCleanup` with a null reference ID and the original identity in the note |
| Product/godown/batch quantities and batch movements | Unchanged; consumed stock is not automatically returned and produced stock is not reversed |
| Other BOMs, jobs, products, invoices, customer records and their links | Unchanged |

Deleted job costs/counts disappear from production-document analytics, as explicitly disclosed in the preview. This is document/history cleanup, not a physical stock correction. The retained stock/batch ledger is not erased merely to remove references. Raw-material deletion may then proceed through its existing workflow if no other BOM/business/scrap/history protection remains; raw products are not deleted automatically.

## Safety and concurrency

- Execution and preview are ADMIN-only. MANAGER/STAFF cannot invoke the cleanup API.
- Active, planned, cancelled, passed/partial, unarchived jobs, custom/customer-order or custom-inventory links block the whole operation. Unknown/invalid/live scrap, cross-order references and unexpected ledger products also block it. No partial job purge is performed.
- A SHA-256 revision of the selected recipe and its full relevant job/ledger/scrap data binds confirmation to the reviewed preview. If history changes, refresh and reconfirm; stale previews perform no writes.
- Numbering → BOM → sorted production/scrap row locks match production creation's lock order. All audit, reference updates and deletions execute in the existing Serializable transaction with bounded conflict retry. A later failure rolls back the earlier audit/reference changes/deletes.
- Scope is explicit IDs belonging to the selected BOM. There is no table-wide cleanup, stock reset, sequence reset or ledger/batch deletion.
- Up to 200 jobs, 1,000 relevant ledger entries and 1,000 scrap rows are allowed per BOM cleanup. Larger histories are blocked for a separately reviewed procedure rather than running an unbounded purge.
- `ProductionCleanupAudit.maxOrderNumber` preserves removed numeric PRD suffixes. Production creation uses the maximum of live jobs and audit receipts, so deleted job numbers are not reissued. Database integer sequences are never reset.

## Required migration before release

`prisma/migrations/20261014100000_production_cleanup_audit/migration.sql` only creates the small cleanup-audit table/index. It does not execute the cleanup or modify existing operational data. It was prepared and validated, **not run against a live database**. Apply the repository's normal migration deployment workflow on a staging copy first, then on the backed-up VPS before starting the rebuilt app. Review other pending migrations too. Docker Compose's migrate service must be rebuilt from the new source. Do not use reset, force-reset or seed commands.

The production-creation query now uses the audit table for number retention, so this migration is required even before creating new jobs. Leave the additive audit table in place on an application rollback.

## Verification and limitations

### Preview failure fixed after release

The initial preview used `SELECT pg_advisory_xact_lock(742013)` through
`$queryRaw`. PostgreSQL returns `void` (OID 2278), which the installed
`@prisma/adapter-pg` rejects during result decoding. The shared numbering-lock
helper now selects `pg_advisory_xact_lock(742013)::text`; the lock key,
transaction lifetime and lock order are unchanged. Production creation uses
the same corrected helper. A regression test exercises the real installed
adapter and PrismaClient with simulated PostgreSQL field metadata (no database
connection), reproducing the old `P2010` rejection and checking the corrected query.

Cleanup-specific database failures now report missing migrations separately
from raw-query errors, with a server-side `[manufacturing:bom-cleanup:preview]`
or `[manufacturing:bom-cleanup:delete]` code diagnostic. No query, credentials
or customer data are logged by that diagnostic. VPS logs are still required
to rule out other deployment/database problems.

References: [PostgreSQL advisory lock return types](https://www.postgresql.org/docs/16/functions-admin.html)
and [Prisma v6 unsupported raw-query result types](https://www.prisma.io/docs/orm/v6/prisma-client/using-raw-sql/raw-queries).

This fix needs a rebuilt application, not an additional migration. The earlier
cleanup-audit migration remains mandatory. Rebuild both Compose images before
running the migration service; an old `migrate` image cannot apply newer files.
Back up the database and review pending migrations before deploying. If the
preview still fails after deployment, collect `docker compose logs --since=10m app`
immediately after clicking **Refresh preview**, redacting credentials before
sharing. Do not use reset, force-reset, or seed commands.

- 339 regression tests passed across auth, inventory, manufacturing, commerce, billing, walk-ins, email and WhatsApp state. Cleanup tests use isolated copy-on-commit fixtures with no live database connection.
- After the preview fix, 343 regression tests (including 60 manufacturing tests)
  passed and the production build succeeded again. The added tests cover
  adapter/PrismaClient decoding and safe, actionable database-error reporting.
- Tests cover exact scope, unrelated shared-material records, customer/live-scrap protection, explicit confirmation, stale recipe/job/ledger previews, acknowledgement/forged-input validation, full rollback at every write/deletion stage, duplicate requests, numbering retention and bounded histories.
- Prisma generation/schema validation and production build (106 routes) succeeded. Targeted ESLint has no errors; Manufacturing retains six existing image/unused-suppression warnings.
- Full TypeScript check retains seven pre-existing unrelated errors in financials, Prisma config and missing Vitest imports. No new errors were reported in these changes. Next.js already skips type errors during build.
- `git diff --check` passes. No ngrok, credentials or unrelated configuration changes.

No live BOM/order was permanently deleted during this implementation. No stock was reset/returned, and no deployment, migration execution, commit or push was performed. PostgreSQL concurrency, real production records, authenticated desktop/mobile interaction and backup restoration remain staging verification tasks before irreversible use.
