# Invoice export and GST audit - 9 October 2026

## Footer root cause and fix

The old PDF export rasterised a content-sized `.invoice-container` using a CDN
html2pdf bundle. The final `.footer` had no explicit line height or bottom
clearance. It sat at the capture boundary, where font-baseline rounding can clip
the lower part of the last line. The export inserted a full HTML document into
the dashboard DOM, allowing application styles to affect the capture. Images
and fonts were not explicitly awaited, and PDF failures were silently swallowed.
Print, download and WhatsApp sharing had three different copies of the template.

All three now use one escaped document in an isolated iframe. Each fixed A4 page
reserves a 20mm bottom content margin. The footer has an explicit 20px line height,
40px minimum box height and its own bottom inset. PDF capture uses installed
html2canvas/jsPDF dependencies, waits for layout/assets, and captures pages
individually. Item rows are kept intact, headers repeat on continuation pages,
page numbers are shown, and an exceptionally oversized field produces an error
instead of silently clipping it. Font shaping remains browser-native, including
Hindi and the rupee symbol. PDFs remain raster-based, like the previous export;
searchable/tagged PDF generation is not implemented.

## Completed invoice features and safeguards

- GST rate/HSN grouping uses saved taxable values and CGST/SGST/IGST/cess amounts,
  never a recalculation using today's settings. Zero-rate and fully discounted
  lines remain zero.
- Supplier/buyer GSTIN, place of supply with state code, quantity/unit, reverse
  charge status, amount in Indian-numbering words, signature space, payment and
  credit-note histories are printed. A payment QR is labelled separately from
  a government IRP QR. Broken QR images show a usable fallback message.
- The invoice action now returns saved per-item tax fields, cess and RCM status.
- New/revised invoices snapshot a whitelist of seller/buyer/bank/terms details,
  product units and an optional different delivery address. SMTP/API secrets
  are not copied. Item order is explicitly stable. Updating store/contact
  records later does not change the parties printed for these invoices.
- The migration adds one nullable JSONB column only. Existing invoices are not
  backfilled, renumbered or recalculated. Legacy records continue to load; missing
  historical particulars and non-reconciling line taxes are clearly flagged.
- New writes validate GSTIN format, HSN format and the 16-character invoice-number
  limit. Registered supplier state and place-of-supply mismatches are rejected
  transactionally, including finalisation of new held bills.
- Missing item HSN/rate can use the product/HSN master. Explicit zero GST remains
  zero. Existing stock, payment, cash-change and credit-note transactions remain
  in place.
- A specialised RCM/cess/export/exempt legacy invoice cannot be edited through
  regular POS and lose its tax history. HSNs configured with cess cannot silently
  be sold with missing cess through the unsupported standard POS workflow.
- GSTR-1 HSN summaries read saved tax amounts (including zero), not guessed tax;
  held bills are excluded. Buyer snapshots also protect B2B/credit-note
  classification against subsequent contact edits. This is not a certification of the entire GST returns
  module; legacy discrepancies still require reconciliation.
- WhatsApp export no longer uses a nonexistent/unloaded function, detached DOM,
  literal `${...}` filenames or falsely claims a text-only link attached a PDF.
  Native file sharing offers a second tap after PDF preparation to retain user
  activation on mobile. Manual download/attach remains available. Print preview
  no longer loses its iframe after only 500ms.

## GST limits - do not claim universal compliance

This implements the standard domestic invoice document and checks, not every
Indian GST scenario. The client/accountant must confirm registration regime,
appropriate HSN digit requirements/rates/UQC, place of supply and whether IRP
e-invoicing or other special documents apply. GSTIN checking is format validation,
not government registration/status or checksum verification.

The existing database stores money/tax in whole rupees. No currency-unit or
decimal migration was performed. Historical unequal CGST/SGST rounding is flagged;
paise-accurate accounting requires a separately coordinated money/ledger migration.
Freight is still a separately stored charge without a configured GST treatment;
such exports are marked for accountant review, not advertised as ready tax
invoices. Cess calculation, composition/bill-of-supply, reverse-charge creation,
exports/SEZ endorsements and IRP registration/signed QR generation require their
specific accounting workflows and client configuration. Existing specialised
records remain readable and their stored amounts are displayed.

No fake IRN, government QR, digital signature or compliance claim is generated.
Until registration/turnover/IRP requirements are confirmed, government e-invoice
integration remains unimplemented. The payment QR must not be used in its place.

Primary references checked:

- [CBIC Rule 46 - invoice particulars](https://taxinformation.cbic.gov.in/content-page/explore-rules/1000136/1000001)
- [CBIC invoice rules - field list](https://cbic-gst.gov.in/gst-invoice-rules.html)
- [GSTN-authorised IRP mandate and signed QR/IRN requirements](https://einvoice6.gst.gov.in/content/e-invoice-mandate-e-invoicing-changes-exemptions-documents-covered-transactions-and-more/)

## Deployment - backup and additive migration first

These steps have **not** been run on the VPS. Use them after the reviewed changes
are present in `/opt/furniturecrm`. Keep the backup outside Docker volumes. Do not
run `db:reset`, `--force-reset`, `docker compose down -v` or delete existing volumes.

```bash
cd /opt/furniturecrm
mkdir -p backups
docker compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "backups/before-invoice-snapshot-$(date +%Y%m%d-%H%M%S).dump"
# Check the backup command succeeded and the file is non-empty before continuing.
docker compose build migrate app
docker compose run --rm migrate
# Only restart the app after the migration succeeds.
docker compose up -d --no-deps app
docker compose logs --tail=80 app
```

Never start the new application against a database missing `documentSnapshot`.
The Compose migrate service uses the builder target and the project's actual
migration files. A failed migration must be investigated, not bypassed with reset.
For rollback, the old app can ignore the additional column; leave snapshots intact.

## Verification and reproducible local QA

Run `npm run test:billing` and `npm run test:operations`. The transaction fixtures
are in-memory and do not access the database, SMTP, Meta or actual customers.
Run `npm run qa:invoice` and open `http://127.0.0.1:4341/` to generate synthetic
single-page, 70-item mixed-rate interstate, incomplete legacy, and Hindi/long-note
PDFs. The harness imports the same exporter as Billing, checks content/footer
clearance, and saves PDFs beneath `.local-dev/invoice-qa/tmp/pdfs/`. Render them
with Poppler and inspect page boundaries and the final footer.

Verification completed: 176 combined regression tests passed, targeted invoice
lint passed, Prisma schema validation passed, and all four actual PDF fixtures
were exported and visually checked (1, 9, 2 and 2 A4 pages respectively).

The production build succeeds; the project's build configuration skips type
validation. Standalone type checking retains the pre-existing financial-report
inference error, Prisma config optional-env error, and five unrelated missing
Vitest imports. These were not hidden or changed as part of this invoice work.
APK-specific download/native-share/print behaviour requires a check in the actual
client's wrapper; the conversion tool and native configuration were not supplied.
