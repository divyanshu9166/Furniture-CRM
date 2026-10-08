BEGIN;
-- Existing integer balances convert exactly; no UPDATE, DELETE or backfill.
ALTER TABLE "ProductBatch"
  ALTER COLUMN "quantity" TYPE DOUBLE PRECISION USING "quantity"::DOUBLE PRECISION,
  ALTER COLUMN "remainingQty" TYPE DOUBLE PRECISION USING "remainingQty"::DOUBLE PRECISION;
ALTER TABLE "MaterialConsumption" ALTER COLUMN "unitCost" TYPE DOUBLE PRECISION USING "unitCost"::DOUBLE PRECISION;
CREATE INDEX "ProductBatch_productId_expiryDate_purchaseDate_idx" ON "ProductBatch"("productId", "expiryDate", "purchaseDate");
CREATE TABLE "BatchMovement" (
  "id" SERIAL NOT NULL,
  "batchId" INTEGER,
  "stockLedgerId" INTEGER NOT NULL,
  "quantity" DOUBLE PRECISION NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BatchMovement_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "BatchMovement_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "ProductBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "BatchMovement_stockLedgerId_fkey" FOREIGN KEY ("stockLedgerId") REFERENCES "StockLedger"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "BatchMovement_stockLedgerId_idx" ON "BatchMovement"("stockLedgerId");
CREATE INDEX "BatchMovement_batchId_idx" ON "BatchMovement"("batchId");
COMMIT;
