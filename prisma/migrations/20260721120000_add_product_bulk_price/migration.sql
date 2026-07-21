-- Add an optional bulk-quantity price to Product.
--
-- This is a NULLABLE column with no default, so existing rows are untouched
-- (they get NULL, i.e. "no bulk price set"). The normal `price` column and all
-- BOM / price-calculator / quotation / order / invoice logic are unchanged —
-- nothing reads `bulkPrice`; it is a display/reference field only.
--
-- Written idempotently (IF NOT EXISTS) so it applies cleanly on databases that
-- were previously bootstrapped with `prisma db push`.

ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "bulkPrice" INTEGER;
