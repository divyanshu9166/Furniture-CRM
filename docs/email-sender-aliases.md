# Multiple email sender aliases

## Client setup

After deploying the code and applying its migration:

1. Sign in as an administrator and open **Settings → Email Setup**.
2. Keep **SMTP Login / Main Mailbox** as `info@kosmicfurniture.com`. The password belongs to this mailbox, not to an alias. A blank password field keeps the saved credential only when the SMTP host and login mailbox are unchanged.
3. Choose the appropriate provider preset. Hostinger Email uses `smtp.hostinger.com`, port **465**, SSL checked. A Titan mailbox bought through Hostinger instead uses `smtp.titan.email`, port **465**, SSL checked. Both support port **587** with SSL unchecked (STARTTLS). Confirm the provider in the client's email panel. See [Hostinger settings](https://www.hostinger.com/support/1575756-how-to-get-email-account-configuration-details-for-hostinger-email/) and [Titan settings](https://www.hostinger.com/support/5966022-how-to-get-email-account-configuration-details-for-titan-email-at-hostinger/).
4. Under **Sender aliases**, add the full addresses:
   - `contact@kosmicfurniture.com` — Kosmic Furniture Contact
   - `sales@kosmicfurniture.com` — Kosmic Furniture Sales
   - `support@kosmicfurniture.com` — Kosmic Furniture Support
5. These addresses must already be created/authorized with the email provider. Adding them in the CRM does **not** create mailboxes or provider aliases. [Hostinger alias instructions](https://www.hostinger.com/support/5240877-how-to-set-up-an-email-alias-with-hostinger-email/).
6. Choose a **Default sender**, then use **Test email sender** to test every address against an inbox you control. Check inbox/spam and inspect the received **From** and **Reply-To** headers. Some providers reject or rewrite unauthorized senders; a successful connection test cannot prove alias authorization or inbox delivery.
7. **Save Settings**. Open **Email Marketing → Create/Edit Campaign → Send From / Alias** and select the sender for that campaign. Reload Email Marketing if it was already open while settings were changed.

Only administrators manage aliases and test unsaved SMTP settings. Administrators/managers can select configured senders in campaigns. Up to 20 aliases are supported, each with an optional display name; a blank name inherits the main mailbox display name.

## Delivery behavior

- SMTP authentication always uses the main mailbox. The chosen identity supplies structured `From` and `Reply-To` headers; [Nodemailer address objects](https://nodemailer.com/message/addresses) handle quoting and Unicode names.
- Each new campaign stores its selected address and display name. Immediate, scheduled, A/B and trigger-based automated deliveries use that saved identity, not whichever default happens to be selected later.
- Existing campaigns without sender fields keep the login mailbox. Editing their content without selecting another sender does not adopt the new global default.
- Transactional emails use the configured global default. There is no separate alias selector added to every transactional screen and no incoming-email inbox integration in this change.
- An automation with delivery history cannot switch sender address; duplicate/create a new automation for a different sender. Copies retain the original identity but do not silently activate another automation.
- Unknown, invalid, duplicate or removed senders fail validation. No silent fallback to another sender. Removing an address referenced by a scheduled/sending campaign is blocked; pause/edit the campaign first. Enabling an automation checks its configured sender.
- SMTP port 465 requires SSL; port 587 uses mandatory STARTTLS. Existing throttling, campaign audience, tracking, unsubscribe, templates and recipient reporting remain in place. Provider limits still apply; follow [Hostinger's consent-based mailing policy](https://www.hostinger.com/support/1583510-is-mass-mailing-supported-at-hostinger/).
- Saved SMTP credentials are reused only server-side and are redacted from settings responses. This change does not redesign existing database credential encryption or implement alias ownership verification; real provider-side tests remain required.

## Data safety and deployment

Migration: `prisma/migrations/20261008150000_email_sender_aliases/migration.sql`.

It only adds `StoreSettings.smtpFromEmail`, `StoreSettings.smtpAliases`, `EmailCampaign.fromEmail`, and `EmailCampaign.fromName`. There are no table drops, existing-row rewrites, credential resets, recipient deletions or seeds. The application deliberately supports legacy null sender fields.

No live database migration, SMTP send, VPS deployment, commit or push was performed for this feature. After committing/pushing and updating the VPS checkout, back up the database and apply migrations **before** starting the new app. `migrate deploy` applies all pending repository migrations, so review any earlier pending migrations too.

For the current Compose setup, run each step separately and stop if any command fails:

```bash
cd /opt/furniturecrm

# Review checkout/local changes before pulling the feature's committed revision.
git status --short
git pull --ff-only

# Keep the database/Redis services available, without touching their volumes.
docker compose up -d db redis
```

Create a backup and confirm both pg_dump success and a non-empty file before continuing:

```bash
backup_file="/opt/furniturecrm-before-email-aliases-$(date +%Y%m%d-%H%M%S).sql"
docker compose exec -T db sh -c 'exec pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB"' > "$backup_file"
test -s "$backup_file"
```

Build **both** images: the migration service uses the builder target, separately from the app image.

```bash
docker compose build app migrate
docker compose run --rm migrate
docker compose up -d --no-deps app
docker compose logs --tail=80 app
```

Do not use database reset, `db push --force-reset`, reseeding or `docker compose down -v`. Do not roll out the new application against a schema that is missing these columns. After deployment, hard-refresh the browser and run the four sender test emails before using real campaigns.

## Verification

- `npm run test:email`: sender validation, default/explicit selection, secret retention, permission guards, actual Nodemailer MIME/envelope generation without network, real delivery/action/runner source with mocked infrastructure, A/B, scheduled/automated sends, legacy compatibility, active-alias removal and history preservation.
- Combined inventory/manufacturing/commerce/walk-ins/email regression suite: **121 tests passed**, including **42 email tests** after the follow-up audit.
- Focused ESLint, Prisma schema validation and production build passed.
- Responsive interaction checks of the actual shared alias/settings components with sample data: 320, 390, 430, 768 and 1280px; add/edit/remove, default/test/campaign selection, unavailable sender display; no horizontal document overflow and mobile controls at least 44px tall. This was a standalone component preview, not a logged-in production test.
- Repository-wide `tsc --noEmit` still reports seven existing errors outside this feature: `app/actions/financials.ts`, `prisma.config.ts` and five tests importing missing `vitest`. Production build currently skips type checking; it is not evidence that those unrelated errors are fixed.
- Real provider acceptance, delivery/spam placement, reply routing and production migration remain to be verified with the client's actual mailbox after deployment.

To reproduce the safe component preview, run `node scripts/email-sender-preview.mjs`, open `http://127.0.0.1:4318`, and stop the helper when finished. It binds localhost only, uses sample addresses and never calls SMTP or the database.

See [the email/mobile follow-up audit](email-marketing-mobile-audit.md) for scheduling, history-preservation, tracking, unsubscribe, personalization and mobile fixes, plus the remaining production-verification limits.

## SMTP port/encryption fix (2026-10-08)

The reported error was caused by port **587** with **Use SSL** checked. Use **587 + unchecked** for STARTTLS, or **465 + checked** for implicit SSL/TLS. STARTTLS remains mandatory in the transport; unchecking this option does not allow plaintext delivery.

- Editing either setting now keeps standard ports/encryption paired automatically. Custom ports remain unchanged when toggling SSL.
- Blank, fractional and out-of-range ports are rejected rather than silently changed to 587. Existing mismatched saved configurations show an actionable inline error; no automatic database rewrite occurs.
- Invalid configuration blocks save/test buttons. Server validation remains enforced independently; Zod issues are returned as plain messages rather than JSON arrays.
- Editing the SMTP draft clears stale connection/test-email results. Saved credentials, sender aliases and selected default are preserved by port/encryption changes.
- **49 email tests passed**, focused ESLint and production build passed. Server-action tests verify invalid pairing cannot write settings or attempt SMTP. The seven unrelated repository-wide type-check errors described above remain.
- Actual form JSX and sender component were checked in a sample-only browser preview, including standard/custom/blank ports and mobile layout. No live SMTP connection, email send, production settings change, migration or deployment was performed.

Safe preview: `node scripts/smtp-settings-preview.mjs`, then open `http://127.0.0.1:4321`. It starts with the reported mismatch using sample addresses, binds localhost only and never calls SMTP or the database. Stop it after testing.
