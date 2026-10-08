# Mobile UI pass — 8 October 2026

## Scope and safety

This pass changes presentation only: responsive classes, mobile CSS, spacing,
typography, touch targets, scrolling, and accessible labels. Existing submit,
send, delete, stock, payment, payroll and other action handlers are retained.
No APIs, server actions, schemas, business rules, permissions or calculations
were changed in this pass. No database commands, migrations, seeds, production
writes, commits or deployments were performed. Earlier pending functional
changes/migrations in the working tree remain separate from this UI work.

Desktop presentation is retained; the main overrides apply below 768px.
Inbox negative margins now consistently follow the layout's `md` breakpoint
instead of switching prematurely at `sm`.

## Changes

- Shared shell: real device safe areas, constrained content width, mobile sans
  typography, fixed-footer clearance, and larger sidebar/top-bar touch targets.
- Page headers/actions/filters: wrap or stack instead of overlapping; long
  labels remain readable. Explicit opt-in markers avoid collapsing calendar,
  chart or unrelated grid layouts.
- Tabs: horizontal scrolling, nonshrinking labels and visible scroll affordance.
  Inventory's Consumable Items tab no longer relies on a clipped fixed-width row.
- Forms: marked multi-column forms and editable item rows stack on phones.
  Inputs use 16px text to avoid iOS focus zoom without disabling pinch zoom.
- Tables: contained horizontal scrolling instead of widening the whole page.
  Data remains in tables; no columns or actions were removed.
- Summary cards: compact, readable grids; extra-narrow phones use one column.
- Modals/sheets/popovers: viewport bounds, scrollable content, safer title/close
  spacing, mobile portal stacking above the footer and larger option targets.
- Billing/POS: product details, rate, amount and full-width quantity controls are
  rearranged without changing handlers or totals. Remove stays beside the item.
- WhatsApp/social inboxes: viewport/footer-aware sizing. WhatsApp's composer
  has dedicated template/message/send columns, not a wrapping action toolbar.
  AI/assignment labels are visible on phones. Compact short-viewport headers
  preserve composer space in landscape and keyboard-sized windows.
- Notifications/toasts: constrained mobile popovers and footer-safe positioning.

The section-specific markers cover Dashboard, Inventory, Manufacturing,
Purchases, Godowns, Custom Orders, Billing/POS, Orders, Quotations, Drafts,
Follow-ups, Walk-ins, Leads/IndiaMART, Staff/Staff Portal, Payroll, Appointments,
Calls, Payments, Expenses, Financials, GST, Settings, Email/WhatsApp Marketing,
and broadcast/automation/contact/pipeline/knowledge/template components.

## Verification and limits

- `npm run build`: passed. Existing configuration skips TypeScript checking.
- Inventory: 27 tests passed; manufacturing: 7; operations: 31; walk-ins: 14.
  These 79 regression tests do not substitute for mobile workflow E2E tests.
- Focused ESLint checks passed on shared components, Inventory, Billing, Staff,
  Payroll, Walk-ins, message composer/thread and the local preview helper.
- `git diff --check`: passed (Git reports existing CRLF conversion warnings).
- Standalone TypeScript checking still reports existing issues in
  `app/actions/financials.ts`, `prisma.config.ts`, and five tests importing the
  unavailable `vitest` dependency. Broad lint also reports pre-existing hook
  and escaped-text issues. These were not silently changed in a UI-only pass.

Local browser QA used presentation fixtures at 320x740, 390x844, 430x932,
768x1024 and 1280x900 for inventory, POS, a modal form, payroll-style tables
and an inbox: 25 cases with no document-level horizontal overflow. Additional
modal/inbox checks at 740x360 and 390x500 verified scrollable modal bodies and
composer visibility above the footer after a landscape-specific adjustment.
Keyboard focus scrolled Consumable Items fully into its tab strip. Light/dark
visual previews were inspected; 320px POS quantity controls remain on one row.

The fixtures compile the application's CSS and reuse representative source
class names, but use sample data and do not execute authenticated workflows.
They are NOT evidence that every production page/tab, long real-world record,
mobile browser, safe-area combination or native keyboard was tested.
An authenticated real-device acceptance pass remains necessary before claiming
all sections are fully verified on the VPS.

## Reproduce local presentation QA

Run `node scripts/mobile-ui-preview.mjs` from the project root, then open
`http://127.0.0.1:4318`. Views: `?view=inventory`, `pos`, `form`, `table`,
`inbox`; add `&theme=dark` for a dark preview. The server binds loopback only
and does not connect to auth, APIs or the database. Stop it with Ctrl+C.

## Real-device acceptance checklist

1. Check 320–430px portrait and landscape, light/dark mode, long names/amounts.
2. Swipe both inventory tab strips; open forms, sheets, dropdowns and alerts.
3. Confirm every table's last column/actions can be reached by scrolling.
4. Open the keyboard in forms and inboxes; ensure fields, submit/send controls,
   reply previews and expired-session template actions remain reachable.
5. Verify ordinary add/edit/filter/export/navigation workflows against approved
   test records; do not use destructive operations on production customer data.

This UI pass itself needs no database migration. Any migrations from earlier
feature work must be reviewed and deployed independently.
