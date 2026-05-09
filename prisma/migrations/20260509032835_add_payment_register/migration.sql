-- Add payment register enhancements

ALTER TABLE "DailyPayment"
  ADD COLUMN IF NOT EXISTS "gstAmount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'Pending',
  ADD COLUMN IF NOT EXISTS "receivedByStaffId" INTEGER,
  ADD COLUMN IF NOT EXISTS "chequeNumber" TEXT,
  ADD COLUMN IF NOT EXISTS "chequeDate" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "chequeBounced" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "bounceReason" TEXT,
  ADD COLUMN IF NOT EXISTS "customerName" TEXT,
  ADD COLUMN IF NOT EXISTS "reconciled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "reconciledDate" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "reconciledBy" TEXT,
  ADD COLUMN IF NOT EXISTS "bankRefNumber" TEXT,
  ADD COLUMN IF NOT EXISTS "reversalId" INTEGER,
  ADD COLUMN IF NOT EXISTS "isReversal" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "reversalReason" TEXT,
  ADD COLUMN IF NOT EXISTS "referenceHash" TEXT,
  ADD COLUMN IF NOT EXISTS "notes" TEXT,
  ADD COLUMN IF NOT EXISTS "attachment" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'DailyPayment_receivedByStaffId_fkey'
  ) THEN
    ALTER TABLE "DailyPayment"
      ADD CONSTRAINT "DailyPayment_receivedByStaffId_fkey"
      FOREIGN KEY ("receivedByStaffId") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "DailyPayment_method_reference_key" ON "DailyPayment"("method", "reference");
CREATE INDEX IF NOT EXISTS "DailyPayment_date_idx" ON "DailyPayment"("date");
CREATE INDEX IF NOT EXISTS "DailyPayment_method_idx" ON "DailyPayment"("method");
CREATE INDEX IF NOT EXISTS "DailyPayment_contactId_idx" ON "DailyPayment"("contactId");
CREATE INDEX IF NOT EXISTS "DailyPayment_type_idx" ON "DailyPayment"("type");
CREATE INDEX IF NOT EXISTS "DailyPayment_status_idx" ON "DailyPayment"("status");
CREATE INDEX IF NOT EXISTS "DailyPayment_reconciled_idx" ON "DailyPayment"("reconciled");
CREATE INDEX IF NOT EXISTS "DailyPayment_chequeBounced_idx" ON "DailyPayment"("chequeBounced");
CREATE INDEX IF NOT EXISTS "DailyPayment_referenceHash_idx" ON "DailyPayment"("referenceHash");