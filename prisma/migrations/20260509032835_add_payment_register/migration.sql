-- Add payment register enhancements safely for environments that already have legacy Payment data.

CREATE TABLE IF NOT EXISTS "DailyPayment" (
  "id" SERIAL NOT NULL,
  "displayId" TEXT NOT NULL,
  "amount" INTEGER NOT NULL,
  "gstAmount" INTEGER NOT NULL DEFAULT 0,
  "type" TEXT NOT NULL DEFAULT 'IN',
  "method" TEXT NOT NULL,
  "reference" TEXT,
  "referenceHash" TEXT,
  "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "status" TEXT NOT NULL DEFAULT 'Pending',
  "receivedByStaffId" INTEGER,
  "chequeNumber" TEXT,
  "chequeDate" TIMESTAMP(3),
  "chequeBounced" BOOLEAN NOT NULL DEFAULT false,
  "bounceReason" TEXT,
  "customerName" TEXT,
  "contactId" INTEGER,
  "orderId" INTEGER,
  "invoiceId" INTEGER,
  "customOrderId" INTEGER,
  "reconciled" BOOLEAN NOT NULL DEFAULT false,
  "reconciledDate" TIMESTAMP(3),
  "reconciledBy" TEXT,
  "bankRefNumber" TEXT,
  "reversalId" INTEGER,
  "isReversal" BOOLEAN NOT NULL DEFAULT false,
  "reversalReason" TEXT,
  "notes" TEXT,
  "attachment" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "DailyPayment_pkey" PRIMARY KEY ("id")
);

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

-- Create unique index on displayId BEFORE insert (required for ON CONFLICT)
CREATE UNIQUE INDEX IF NOT EXISTS "DailyPayment_displayId_key" ON "DailyPayment" ("displayId");

INSERT INTO "DailyPayment" (
  "displayId",
  "amount",
  "gstAmount",
  "type",
  "method",
  "reference",
  "referenceHash",
  "date",
  "status",
  "chequeBounced",
  "customerName",
  "contactId",
  "orderId",
  "invoiceId",
  "customOrderId",
  "reconciled",
  "notes",
  "attachment",
  "createdAt",
  "updatedAt"
)
SELECT
  'LEGACY-' || p."id"::text,
  p."amount",
  0,
  'IN',
  p."method",
  p."reference",
  CASE
    WHEN p."reference" IS NULL OR lower(trim(p."method")) = 'cash' THEN NULL
    ELSE md5(lower(trim(p."method")) || ':' || lower(trim(p."reference")))
  END,
  p."date",
  'Pending',
  false,
  NULL,
  NULL,
  NULL,
  p."invoiceId",
  NULL,
  false,
  p."notes",
  NULL,
  p."date",
  p."date"
FROM "Payment" p
ON CONFLICT ("displayId") DO NOTHING;

CREATE INDEX IF NOT EXISTS "DailyPayment_date_idx" ON "DailyPayment" ("date");

CREATE INDEX IF NOT EXISTS "DailyPayment_method_idx" ON "DailyPayment" ("method");

CREATE INDEX IF NOT EXISTS "DailyPayment_contactId_idx" ON "DailyPayment" ("contactId");

CREATE INDEX IF NOT EXISTS "DailyPayment_type_idx" ON "DailyPayment" ("type");

CREATE INDEX IF NOT EXISTS "DailyPayment_status_idx" ON "DailyPayment" ("status");

CREATE INDEX IF NOT EXISTS "DailyPayment_reconciled_idx" ON "DailyPayment" ("reconciled");

CREATE INDEX IF NOT EXISTS "DailyPayment_chequeBounced_idx" ON "DailyPayment" ("chequeBounced");

CREATE INDEX IF NOT EXISTS "DailyPayment_referenceHash_idx" ON "DailyPayment" ("referenceHash");