# Staff sign-in dropdown repair — 2026-10-10

## Root cause

`app/login/page.js` called the management `getStaff()` server action before sign-in.
That action requires an ADMIN/MANAGER session and returns an empty list on denied
access. The page ignored the failure, so the login dropdown appeared blank even
though an authenticated admin could see the same staff in Settings / Team.

## Changes and data safety

- `/api/auth/staff-options` is an explicitly public, read-only GET endpoint for
  the existing name-selection login flow. It queries active Staff with an active
  linked User, ordered by name and ID, selecting only ID, name and job role.
- Usernames/emails, password hashes, contact details, salary, bank information,
  attendance and other HR fields are neither selected nor returned. The response
  additionally whitelists the three allowed fields.
- Both server response and client request disable caching so newly enabled or
  disabled accounts appear on the next refresh.
- The login page now handles loading, empty directories, failed/malformed
  responses, retries, a 15-second timeout and cancellation on role changes.
  Failed/empty/loading directories cannot submit the staff login form.
- The existing management staff action, credential verification, session
  creation and database schema are unchanged. No data migration, backfill,
  password reset or staff/account edits are part of this repair.
- The logo component was moved outside render to avoid remounts and satisfy the
  existing React lint rule; its appearance and branding remain unchanged.

The endpoint intentionally makes enabled staff names/job roles visible on the
sign-in page, matching the existing name-selection design. It does not grant
access to the staff portal: the existing password and active-account checks
still run in `/api/auth/login`. This is not a general authentication audit.

## Verification

- `npx tsx --test lib/auth/*.test.ts`: 10 tests pass using in-memory fixtures only.
  Covers exact read-only query, active/disabled/unassigned filtering, whitelisted
  fields, no mutation, refresh, empty data, safe database failures, HTTP/malformed
  response handling, retry and abort signal propagation.
- Combined existing regression suites plus these tests: 186 pass.
- Targeted ESLint passes. TypeScript reports the same 7 existing errors in
  financials, Prisma config and unrelated tests with missing `vitest`; none in
  the new files.
- Production build succeeds; `/api/auth/staff-options` is a dynamic route.
- Computer-use browser verification of the actual login component in a
  synthetic loopback harness: names/selection, failed-load retry recovery,
  empty-account guidance, stalled-request timeout, cancellation during role
  changes and returning to the admin form. No live account sign-in performed.

## Rollout

Deploy/rebuild the app normally and reload the login page. This repair requires
no new migration (any pending migrations from other changes remain separate).
Confirm a staff member with an active, assigned login appears while logged out,
then have that member test their existing password. An inactive, disabled or
unassigned account is intentionally excluded; do not recreate or reset staff
records to repair the original empty-directory bug.

The live VPS and real staff sign-in have not been tested or changed by this work.
