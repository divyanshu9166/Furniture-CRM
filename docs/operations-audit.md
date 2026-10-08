# Operations audit — 8 October 2026

Scope: Follow-ups, Purchases, Godowns, Custom Orders, Billing/POS and linked stock/payment transitions.

## Plan and data safety

1. Trace server actions, validators, UI calls, reminders and shared inventory engine.
2. Correct confirmed authorization, calendar, financial and lifecycle defects.
3. Make connected writes atomic; lock current records before checking state/balance.
4. Add isolated regression tests; run existing stock/manufacturing tests, lint and production build.
5. Record verified coverage and live dependencies separately. No guarantee of zero bugs.

Existing changes are preserved. No reset, seed, SQL data correction, database migration, production messages, deployment or Git push is run. Existing invoices have no reliable historical stock provenance: only recorded Invoice ledger movements may be reversed. Historical stock must not be guessed or retroactively deducted.

## Confirmed findings (fixed in code)

- Missing authorization on billing reads/payments/cancellation/credit/finalization, purchase reads, and custom-order management actions.
- Payment checks outside transactions permit concurrent overpayment/lost totals; create invoice capped amountPaid but persisted uncapped split payments.
- Held bills submit a zero payment rejected by the validator; invoices did not issue stock; held bills polluted active revenue totals.
- Count/newest-row numbering races and collisions after deletion/restoration.
- Rounded discount shares can overshoot the remaining discount; percentage discounts were unbounded.
- Credit notes exceeded invoice totals and did not reduce outstanding balances; cancelled paid invoices hid payment history from reporting.
- PO editing/payment/cancellation raced approval/receipt; returns did not validate supplier/PO or received-minus-returned limits.
- Custom-order creation/visit/timeline were separate commits; arbitrary backward/delivery transitions and READY inventory left behind after delivery.
- Reminder due dates/counts depended on VPS timezone; stale selection could send a rescheduled entry; reopen could duplicate active follow-ups.

## Implemented corrections

### Follow-ups

- Shared contact locks for manual creation, lead conversion, chatbot auto-creation and reopening prevent concurrent duplicate active entries. Chatbot follow-ups do not overwrite existing customer names. Closed leads cannot silently become active follow-ups.
- India calendar-day counts, intent parsing and reminder cutoff are independent of VPS timezone; month additions clamp to the last valid day.
- Only an actual date change re-arms REMINDED/CONTACTED entries. Saving unchanged details does not send another reminder.
- Reminder selection uses a current-row/version compare-and-set lease. Edits/deletes are refused while a send lease is active. Concurrent cron/manual sweeps use the same claim.
- Sweeps paginate in immutable ID order, so skipped/unconfigured oldest entries do not starve later entries. Summary exposes skipped reasons; provider acceptance followed by a database error does not immediately release the lease.
- Approved template compatibility is checked for a single positional {{1}} customer-name value; named/extra/header/media/dynamic-button/OTP requirements are excluded. Existing template synchronization and language selection remain.
- Automated social reminders use the normal session window and do not attach a human-agent tag. Out-of-window entries remain pending and the run explains why they were skipped. No live Meta messages were sent during verification. Meta's policy reference: https://developers.facebook.com/docs/messenger-platform/send-messages/message-tags/ (official page retrieval was unavailable during this audit).

### Purchases

- Authenticated reads and manager-only writes; database errors become actionable results instead of stranding forms.
- Numbering uses an advisory lock and maximum numeric suffix, not count/latest row ID. Selected product/supplier identities and duplicate line validation are checked.
- Shared line-level discount/tax rounding on server and preview. Whole-rupee/integer database constraints, valid calendar dates and GST range are validated.
- Draft edits, approvals, receipts, payments, cancellations and linked returns check fresh locked PO state in serializable transactions. Payment references cannot replay on the same PO; overbalance payments and cancellation with advances/receipts are refused.
- Linked returns check supplier, original unit cost, received-minus-prior-return quantity and available original receipt lots when provenance exists. Physical stock and return document commit together. Standalone returns remain supported; they do not invent a supplier refund/payment adjustment.
- Notification failure after approval is reported as a warning, not a failed approval. Messaging calls have a bounded timeout. Provider delivery still needs live testing.

### Godowns

- Added working Branch/Godown edit controls and protected save-modal closure, preserving existing roles/default safeguards.
- Ledger has refresh and cursor-based older-entry loading; filter IDs/limits are validated. Failed loads show retry instead of empty-success screens.
- Shared engine continues to enforce stock/location/batch equality, shortage checks, atomic transfers and one-time transfer completion. Manual adjustment actions cannot forge a business document reference; audit actor comes from the authenticated session.
- Head-office designation changes are atomic. Capacity/utilization remains an advisory aggregate count, not a validated physical-space reservation, particularly for mixed UOM inventory. Transfers retain the existing whole-unit database contract; fractional transfer quantities are explicitly rejected, not truncated.

### Custom orders

- Management actions require manager/admin; staff measurements, photos and field-visit updates enforce current ownership. Active assignments, positive IDs, images, valid dates/time slots and advance-vs-quote amounts are checked.
- Order/contact/optional scheduled visit/assignment/timeline are atomic. Both existing 12-hour slot labels and HH:MM values remain supported.
- Statuses progress one stage at a time. Delivery requires no unfinished linked production/field visits and usable QC-passed/partial output where production is linked. READY custom inventory becomes DELIVERED in the same transaction. It is not deducted from generic product stock, because manufacturing keeps it separate.
- Visit completion merges recorded measurements/photos into the order atomically; terminal visits cannot reopen or complete repeatedly. Notifications are after commit and cannot roll back a saved visit.
- Reference-photo writes check returned action results; network failures and failed loads are visible. Notification email content is escaped and phone normalization preserves international numbers.

### Billing / POS

- Authenticated reads and role-checked payments/voids/credits/finalization/edits. Shared transactional services validate active staff, sellable products and server-authoritative product name/SKU.
- New issued invoices deduct physical stock using the shared ledger/batch engine inside invoice creation. Held bills collect no payments/stock; finalization checks live availability and issues once. Unpaid/credit sales are supported.
- All payment mutations lock the current invoice and derive debt from persisted payments plus credits. Non-cash overpayment/duplicate references are rejected. Cash tender/change is supported with applied receipts and explicit change notes, not uncapped stored payments.
- Line discounts reconcile exactly without negative taxable rows. UI and server calculate totals identically. Editing a percent-discount invoice restores the saved rupee amount as a flat discount, preserving its total.
- Invoice edits preserve and disable editing of existing payments; Record Payment remains the way to collect more. Clear/New Bill exits edit mode, preventing accidental overwrite of a previous invoice.
- Edits/voids reverse only recorded net invoice stock. Legacy invoice stock is not guessed or retroactively corrected. Paid/credited invoices cannot be cancelled to hide financial history.
- Credit notes reduce debt and cannot cumulatively exceed the bill. Credits do not imply physical returns or an executed bank refund. Excess collections are displayed for refund reconciliation. The legacy REFUNDED enum is displayed as Fully credited in filters.
- Held bills are excluded from billing stats; India day/month boundaries are explicit; today's collections use actual payment dates and overdue count requires an elapsed due date.
- Invoice/payment/custom timeline dates display the India calendar day. Returning-customer invoice value subtracts credits, excludes held bills/cancelled orders and uses exact normalized phone variants instead of loose suffix matching.

### Linked draft safety

- Paid invoices, invoices with credits/e-way bills/daily-payment links or recorded stock cannot be trashed; operators receive the void/credit guidance instead of deleting audit history.
- Custom orders with advances, noninitial status or visit/production/inventory/payment dependencies cannot be deleted/unlinked into drafts.
- Custom-order snapshots preserve photos, IDs, original dates and timelines. Custom/invoice restores lock the draft and allocate numbering inside the same transaction, preventing double restoration. Historical snapshots with missing fields cannot magically reconstruct lost old relationships.
- Purchase drafts refuse payment/return dependencies. Earlier stock/batch reversal guards remain intact.

## Verification

- `npm run test:operations`: 31 isolated regression tests pass.
- `npm run test:inventory`: 27 tests pass.
- `npm run test:manufacturing`: 7 tests pass. Total: 65.
- Focused ESLint on all changed scope pages/actions/helpers/validators passes (0 errors/warnings).
- Production build passes: Next.js 16.2.6, 107/107 routes. Build configuration skips type checking, so the separate TypeScript command was also run.
- Separate TypeScript check has no errors in changed scope code. It still fails on pre-existing `app/actions/financials.ts:234`, `prisma.config.ts:12`, and missing Vitest imports in unrelated automation/dashboard/WhatsApp tests. These were not silently fixed or hidden.
- Transaction tests use isolated fixtures and real service/stock-engine functions, not a live PostgreSQL database. Reminder tests inject senders, verify shared claims/pagination/failure recovery, and never contact a provider. These do not prove real multi-process database locking or provider delivery.

## Deployment/staging requirements and remaining boundaries

No live data was migrated, reset, deleted or seeded. No app was pushed/deployed, and no credentials changed.

The previously added `20261008090000_batch_allocations` migration is still required before deploying the combined stock/batch changes. Back up PostgreSQL first; apply committed migrations via `prisma migrate deploy` / the existing Docker migration service. Do not use `db push`, reset, or seed on production. This audit adds no new schema migration.

Before calling these sections production-verified:

1. On a backed-up staging copy, race two payments/receipts/transfers/finalizations/restores from different sessions and verify one valid outcome, conserved stock and matching payments/credits.
2. Exercise admin/manager/staff access through the actual UI. Check desktop/mobile saves, offline/reconnect errors, held/edit/clear/new POS flow, cash change, credit/refund notice, warehouse edit/ledger pagination, field visit uploads and delivered custom stock.
3. Configure Redis, the reminder worker/schedule and an approved compatible template; test an actual due WhatsApp contact inside/outside the session window, invalid provider credentials, duplicate cron/manual runs, social window skips, SMTP and supplier/progress notification failures. Build logs locally state REDIS_URL is absent; live scheduled delivery was not verified.
4. Reconcile any legacy mismatched stock, uncapped split receipts, already-cancelled paid invoices or duplicate/poorly formatted contact identities manually. No automatic data rewrite attempts were made.
5. General Payments/Daily Cash Register and bank/cheque/refund settlement are separate existing ledgers; this audit does not redesign or auto-merge them with invoice payment history. A credit note is not a payment reversal or goods-return workflow. Linked sales-order-to-invoice provenance is not modeled; avoid billing a stock-deducted sales order as another unlinked POS sale without reconciliation.
6. Cash/create requests without a unique external reference still lack persisted request-key idempotency. After an ambiguous network failure, refresh and verify the saved document/payment before retrying. Reminder leases prevent normal concurrent duplicates, but a provider accepting a send followed by a persistence failure remains an external exactly-once ambiguity; inspect provider/message history rather than promising zero duplicates.

No claim is made that all possible production failures are eliminated. Confirmed audited defects are fixed; live integration and the separate financial-ledger boundaries above remain explicit.
