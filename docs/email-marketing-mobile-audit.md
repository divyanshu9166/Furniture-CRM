# Email Marketing and mobile follow-up audit — 8 October 2026

## Scope and data safety

Reviewed the existing campaigns, templates, audiences, scheduling, A/B reporting,
trigger automations, sender aliases, tracking and unsubscribe paths. Also fixed
the two reported mobile shell/inventory defects. Existing sender-alias work was
preserved. No live database writes, resets, migrations, customer emails, Git
pushes or VPS deployments were performed. Local previews use sample data and
mock all server actions; tests do not connect to SMTP or PostgreSQL.

## Findings and implemented fixes

- **Inventory tab background cut:** mobile `.ui-tabs` is a flex scroller. Its
  nested background track was shrinking while its buttons remained wider.
  Both inventory tracks now have `shrink-0`, keeping their background/border
  aligned with all tabs as the strip scrolls. No stock logic changed.
- **Hamburger white bottom strip:** an empty 36px fixed footer at z-index 80
  covered the drawer at z-index 60. The empty footer now occupies only the
  actual device safe area, at z-index 30, with the application background.
  Shell clearance uses the same safe-area height. The drawer has an independent
  scrollable menu, a safe-area-aware profile footer, body scroll locking, Escape
  dismissal and desktop-resize cleanup.
- **Email load/action failures:** independent loaders settle safely and expose
  retryable errors instead of permanent loading. Save/send/template/analytics/
  automation actions release their busy state after errors. Editors reset on
  cancellation/new-template use; automation setup starts with a fresh form.
- **Automation drafts:** Save as Draft retains its trigger and delay instead
  of silently converting the automation into an ordinary campaign. Cards show
  the actual stored delay. Activation checks sender, tracking, content and
  duplicate active triggers; transaction/advisory locks serialize these checks.
- **Duplicate deliveries/history loss:** regular sends retain recipient/event
  history, refuse automatic replay, and pause after ambiguous partial outcomes.
  Concurrent automation workers claim recipients under a campaign row lock;
  SMTP runs outside that transaction. Edit/delete restrictions preserve old
  unsubscribe links and analytics. Failed campaigns expose View Analytics.
- **Automation eligibility:** subscribed contacts and the selected audience are
  rechecked at claim time. Post-visit appointment emails require Completed
  status; post-purchase requires delivered orders. Previously processed contacts
  are excluded before bounded candidate queries so old backlog can progress.
  The current behavior remains once per contact per automation, not once per
  repeat visit/order. Failed/uncertain claims are not silently replayed.
- **Incorrect success/counters:** zero SMTP acceptance is a failure. Scheduler
  success counts reflect actual accepted deliveries. Delivery completion does
  not reset live engagement counters or regress recipient tracking statuses.
- **Incomplete A/B/timeline reporting:** A/B totals count all accepted recipients,
  not the 200-row preview, and use accepted sends as the denominator. Daily
  events aggregate all records rather than a sampled 500-event window.
- **Tracking races/security:** recipient/event/campaign counters and unsubscribe
  suppression commit atomically under a recipient lock. Unique counters are
  idempotent and clicked/terminal statuses do not regress. The public endpoint
  requires strict recipient IDs and signed links; generic raw POSTs cannot
  unsubscribe customers. Unsubscribe GET displays confirmation; signed form
  POST applies it to all contacts sharing the address.
- **Tracking persistence lifecycle:** open/click persistence uses Next.js
  [`after()`](https://nextjs.org/docs/app/api-reference/functions/after), rather
  than an untracked promise after the response. Redirects only accept HTTP(S).
- **Template personalization:** HTML values are escaped, replacement `$` tokens
  remain literal, subjects remain plain text. Templates/drafts can retain custom
  editable placeholders, but send/schedule/automation activation refuses
  unresolved collection/offer variables. Automatically filled fields are
  `customerName`, `storeName`, `storePhone`, `storeEmail`, `storeAddress`, `storeUrl`.
  Enter actual collection/offer details in both subject and HTML before sending.
- **Email responsive overflow:** email tabs scroll within available width even
  at tablet breakpoints. Tracking and recipient tables have contained scrollers.
  Metrics have an explicit Refresh action; misleading real-time/guaranteed
  delivery language and unsupported engagement claims were removed.

## Verification

- Combined inventory/manufacturing/commerce/walk-ins/email: **121 tests passed**,
  including **42 email tests**. Email tests execute real implementation source
  with mocked infrastructure and use Nodemailer stream transport for headers.
- Focused ESLint and production build passed. Prisma schema validation passed
  during the sender-alias work; this audit adds no further schema changes.
- `git diff --check` passed; Git notes normal LF/CRLF conversion warnings.
- Standalone TypeScript checking has **seven pre-existing unrelated errors**:
  financials return typing, optional Prisma config URL, and five tests importing
  unavailable Vitest. No new email errors remain. The build skips type checking.
- Local browser checks used actual Email Marketing, Sidebar and BottomNav
  components, real application CSS and the inventory navigation extracted from
  source. At 320, 390, 430, 768 and 1280px, inventory/email tab and tracking-table
  views have no document-level horizontal overflow. Inspected mobile drawer
  bottom, last inventory tab, Escape/body lock cleanup, campaign/template
  editors, saved automation delay, loading-error retry and failure recovery.
  Browser native-dialog automation had a timeout during a mock template failure;
  the form remained usable afterward. This is not a live SMTP/E2E verification.

Reproduce: `node scripts/email-mobile-audit-preview.mjs`, then open
`http://127.0.0.1:4319/`. Email view: `?view=email`; forced loading failure:
`?view=email&failure=load`. Stop with Ctrl+C. Every mutation is mocked.

## Honest limits and deployment acceptance

- Exactly-once SMTP cannot be guaranteed across process crashes/uncertain server
  acknowledgement. The conservative history guard avoids automatic duplicate
  sends; inspect failures before intentionally creating a new campaign. A stuck
  SENDING campaign after a process crash requires operator review, not blind retry.
- Later bounce/delivery reporting requires provider feedback; this audit does not
  add a Hostinger IMAP/DSN ingestion service. Open/click metrics can be affected
  by privacy tools, scanners and blocked images. The recipient view is still a
  latest-200 preview; full aggregates are not limited to those rows. A/B compares
  two complete variants; there is no automatic winning-variant rollout added.
- Live provider authorization, SPF/DKIM/DMARC, spam placement, reply routing,
  multi-worker PostgreSQL behavior and native mobile keyboards/safe areas must
  be checked against approved test records after deployment. This is not a
  promise that every feature is bug-free in production.
- The earlier additive alias migration still needs deployment. Follow
  [sender setup and backup/deployment instructions](email-sender-aliases.md).
  Keep credentials out of Git. Do not reset, reseed or remove database volumes.

Acceptance: test all four authorized sender identities against an inbox you
control; create an ordinary draft and one approved scheduled/A-B campaign; verify
audience exclusion, automation draft/activate/pause, Completed visit eligibility,
tracking and unsubscribe confirmation; then check both inventory tab strips and
drawer bottom on the client's real Android/iOS browser. Do not run test campaigns
against the full production contact list.
