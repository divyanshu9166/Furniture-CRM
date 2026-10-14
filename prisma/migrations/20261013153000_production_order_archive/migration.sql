-- Additive only: existing jobs and all stock/consumption/cost history stay intact.
ALTER TABLE "ProductionOrder"
  ADD COLUMN "archivedAt" TIMESTAMP(3),
  ADD COLUMN "archivedBy" TEXT,
  ADD COLUMN "archiveReason" TEXT;
CREATE INDEX "ProductionOrder_archivedAt_idx" ON "ProductionOrder"("archivedAt");
