# Email campaign recipients and provider-rejection audit

## Root causes and completed changes

The supplied `554 5.7.1 Outbound sending is disabled for this account` response is
an SMTP provider/account restriction, not a recipient-picker or SSL-port error.
The application cannot unblock a Hostinger mailbox. SMTP connection verification
can succeed while a later mail submission is rejected.

The former campaign form supported only all/leads/customers segments. It had no
individual contact selection, manual-email entry or recipient-file import, and
the stored `audienceFilter` JSON was not used when resolving delivery recipients.

Implemented:

- Searchable, paginated CRM contact selection, page selection and individual
  removal. Selections survive searches/pages. Invalid/unsubscribed contacts are
  shown but cannot be selected.
- Manual email/name entry; CSV, XLSX and legacy XLS import with explicit preview,
  confirmation, row errors, duplicate reporting and a downloadable CSV template.
- Combined selected/imported audiences persisted through draft, edit, duplicate,
  scheduled and A/B delivery, using existing campaign JSON storage.
- Address-level normalization/deduplication and suppression from unsubscribed CRM
  contacts AND historical email-only campaign recipients. Rechecked when the
  audience is resolved and before every SMTP batch. Imports never restore consent.
- Consent confirmation required server-side for manual/imported lists. Preview is
  read-only and does not grant delivery permission.
- Clear provider-block instructions; remaining batches stop after an account-level
  block. Recipient-specific failures do not stop unrelated recipients. Zero SMTP
  acceptance is a failure, not a successful campaign. Blocked automations pause.
- Existing send-history protection retained: no replay, deletion or replacement
  of recipient history to retry a failed/uncertain delivery.
- Mobile-friendly, wrapping controls and independently scrollable recipient lists.

## Client workflow

1. Email Marketing → Create Campaign → Choose recipients.
2. Select existing contacts, add email/name pairs, or import a recipient file.
3. For imports, inspect row errors and click **Add valid emails to list**. Parsing
   a file alone does not add its rows. Fix excluded invalid rows and reimport if
   needed; duplicate addresses are not sent twice.
4. Confirm marketing permission for manual/imported emails.
5. Click **Review eligible recipients**. Inspect eligible and excluded counts.
6. Choose the sender alias, complete the subject/body and save or schedule.
7. After provider sending is enabled, send one test email before a campaign.

Example file:

```csv
Email,Name
client@example.com,Sample Customer
second@example.com,Another Customer
```

The first sheet is used; headers must be in the first row. `Email` is required,
`Name` is optional. Reordered columns and recognized Email Address/Full Name
headers work. Formula cells are rejected even if cached values look valid.

Limits: 5 MB uploaded file, 2,000 data rows, 51 columns, 20 MB expanded XLSX data,
1,000 ZIP entries, 10-second disposable parser-worker timeout, and 2,000 combined
selected contact/email entries per campaign. Oversized audiences/files are
rejected explicitly rather than silently truncated. These are application bounds,
not a guarantee of the email provider's sending allowance. CRM-trigger automations
still use CRM segments; explicit lists support regular and scheduled campaigns.

## Hostinger action required

In hPanel: Emails → domain/email plan → Mailboxes → `info@kosmicfurniture.com` →
mailbox menu → Settings → inspect **Suspend sending**. If a provider/security
suspension or sending quota is responsible, resolve it with Hostinger support or
wait for the applicable quota reset. Do not switch ports repeatedly or bypass TLS.
Once resolved, use Settings → Email Setup → Send Test for every intended alias.
Connection testing alone does not prove outbound delivery or alias authorization.

Official guidance:
https://www.hostinger.com/support/4456436-how-to-manage-mail-services-for-hostinger-emails/

A campaign with failed/uncertain recipient history cannot be sent again directly.
Review the recipient statuses first. After resolving the provider error, duplicate
the campaign for a new attempt without erasing old history. If some recipients were
accepted earlier, remove those addresses from a new selected list before retrying
to avoid duplicate emails. SMTP acceptance is not guaranteed inbox delivery.

## Data and deployment safety

No database schema change or migration is required. Explicit lists live in the
existing `EmailCampaign.audienceFilter` JSON; email-only recipients use the
existing nullable `EmailRecipient.contactId`. Imported addresses remain campaign
data, not fabricated CRM contacts. No contacts, purchases, subscriptions or prior
campaign history were altered during verification. No production email was sent.
SMTP credentials, alias authentication and ngrok configuration were not changed.

After the code is committed/pushed by an authorized deployment workflow, rebuild
the application with its updated lockfile. Do not run database reset, seed or
force-push commands for this change. In the existing VPS Docker workflow:

```sh
cd /opt/furniturecrm
git pull --ff-only
docker compose build app
docker compose up -d --no-deps app
docker compose logs --tail=100 app
```

This turn did not commit, push, deploy or alter provider settings. Preserve your
existing backup/deployment procedures. For larger immediate sends, the existing
SMTP runner can take several minutes; scheduled campaigns avoid depending on an
interactive request staying open. Actual VPS proxy timeouts and provider quotas
have not been verified here.

The existing XLSX dependency was upgraded from the old npm 0.18.5 release to the
official pinned SheetJS 0.20.3 distribution, with lockfile integrity. The official
installation guidance directs users to its CDN distribution; the parser advisory
documents fixes absent in the old release:

- https://docs.sheetjs.com/docs/getting-started/installation/nodejs/
- https://cdn.sheetjs.com/advisories/CVE-2023-30533

Server Action bodies are capped at 4 MB for bounded HTML plus validated recipients.
Raw file bytes are parsed in the browser worker and never uploaded to the server
action. Every persisted field is independently validated and access-controlled.

## Verification and limits

- 158 tests passed across email, inventory, manufacturing, commerce, walk-ins and
  WhatsApp inbox regression suites; 69 are email tests.
- Focused ESLint passed for changed application, parser, test and QA files.
- `npm run build` passed and generated all 106 pages.
- Sample-only browser verification used the actual campaign form and import
  worker, fixture actions, example.com addresses, and no database/SMTP access.
  Verified CSV error/duplicate preview, explicit confirmation, contact pagination,
  search selection retention, consent, eligible-count suppression, draft save/edit
  persistence, and no dialog overflow at 320px and 390px widths.
- Mixed browser sample: 2 selected contacts + 4 explicit email entries resolved to
  4 eligible unique recipients, excluding 1 unsubscribed and 1 duplicate address.
- Production artifacts contain the compiled parser worker and Turbopack bootstrap
  (not a raw TypeScript runtime entry). Native confirmation stalled the browser
  verification connection, so the compiled-worker browser smoke and final
  provider-banner interaction were not completed. Those delivery/error branches
  are covered by isolated tests; live Hostinger sending remains unverified.
- `npx tsc --noEmit` still reports the seven pre-existing unrelated failures:
  `app/actions/financials.ts:234`, `prisma.config.ts:12`, and missing `vitest` imports
  in five existing test files. No added recipient-feature TypeScript errors were
  reported. The repository's build already skips TypeScript error enforcement.
- Dependency installation still reports unrelated repository vulnerabilities;
  this feature is not a whole-repository security audit or a bug-free guarantee.

Reproduce sample-only browser QA locally:

```sh
npm run test:email
node scripts/email-recipient-preview.mjs
```

Open http://127.0.0.1:4322/ locally. After a successful production build, the optional
`node scripts/email-recipient-preview.mjs --production-worker` mode serves the
actual compiled Next worker assets while still mocking database and mail actions.
