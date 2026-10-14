-- Additive audit/number-retention metadata only. No existing records are deleted.
CREATE TABLE "ProductionCleanupAudit" (
  "id" SERIAL NOT NULL,
  "bomId" INTEGER NOT NULL,
  "bomName" TEXT NOT NULL,
  "orderIds" JSONB NOT NULL,
  "orderNumbers" JSONB NOT NULL,
  "maxOrderNumber" BIGINT NOT NULL DEFAULT 0,
  "counts" JSONB NOT NULL,
  "reason" TEXT NOT NULL,
  "deletedBy" TEXT NOT NULL,
  "deletedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProductionCleanupAudit_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ProductionCleanupAudit_bomId_idx" ON "ProductionCleanupAudit"("bomId");
