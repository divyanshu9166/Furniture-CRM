-- Additive only. Existing invoices/payments/items are neither updated nor deleted.
ALTER TABLE "Invoice" ADD COLUMN "documentSnapshot" JSONB;
