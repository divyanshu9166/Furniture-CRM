# Editable walk-in requirements

## How to use

Sign in as Admin or Manager. Open **Walk-ins → Manage Requirements** (beside QR Code/Register Walk-in). Edit labels, add rows, remove rows, or use up/down arrows to change their order. Click **Save Requirements**. Cancel discards local edits.

Reception and the public QR registration form now use the same database-backed list. Staff can register visitors but cannot modify this list. Existing Walkin.requirement strings and contact records are not rewritten when options are renamed or removed.

Before the first explicit save, the list is the union of the old reception and QR choices. This preserves all prior choices (including Bed, Bed & Mattress, Office Chair, Office Furniture and Home Decor). You can remove unwanted choices in the manager. At least one choice must remain; limits are 100 options and 100 characters per label. Duplicate labels are rejected ignoring case and extra whitespace.

## Deployment

This feature adds only the WalkinRequirementSettings configuration table through `prisma/migrations/20261008120000_walkin_requirements/migration.sql`. It does not alter or backfill walk-ins or contacts. Apply pending migrations before running the updated app, and generate the Prisma client during the build. Do not use db:reset, force-reset, or seed against production. Other pending migrations in this workspace belong to prior work; review them as part of your normal backup/staging/deployment process.

For the existing Docker deployment, the migration service must finish successfully before the new app starts. Deploy through the project's normal workflow; this task does not deploy or change the production database.

## Safeguards and verification

- Server-side Admin/Manager permission enforcement for saving; authenticated read for reception; public API returns only store name/logo and option labels.
- Revision compare-and-swap prevents stale browser edits overwriting another user's list. On conflict, reload explicitly (unsaved changes are discarded).
- Missing configuration uses defaults without writing. Database/schema errors show a load error and block submission, not a misleading fallback list.
- New registrations validate their requirement on the server. A stale removed/renamed choice returns an actionable error and refreshes choices without losing other typed visitor fields.
- Registration's contact lookup/create and walk-in insert now share a transaction. Existing contacts are reused without overwriting their profile.
- QR responses use no-store; the reception list reloads when registration opens.

Run `npm run test:walkins` for isolated validation/configuration-delegate regression tests (no database connection). These are not real PostgreSQL or authenticated browser end-to-end tests.

Local verification: 14 requirement tests passed; focused ESLint and Prisma schema validation passed; production build passed. The full-repository TypeScript check still reports pre-existing errors in financials, prisma.config.ts, and tests that import the absent Vitest dependency; it reports no errors in the new walk-in code. Next's current build configuration skips type checking, so the separate check was run as well. No database migrations were applied and no live browser/VPS end-to-end verification was performed.

Staging checklist after migrations: Admin/Manager can save; Staff cannot save even by direct action invocation; add/edit/reorder/remove appears in reception and QR forms; existing records retain old labels; two open manager windows produce a conflict; stale QR selection refreshes on submission; failed load/save shows errors and Retry works; mobile controls do not overflow.
