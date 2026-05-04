-- Manufacturing scrap, custom-order inventory, and labour variance tracking.

ALTER TABLE "Product"
  ALTER COLUMN "stock" TYPE DOUBLE PRECISION USING "stock"::double precision;

ALTER TABLE "GodownStock"
  ALTER COLUMN "quantity" TYPE DOUBLE PRECISION USING "quantity"::double precision;

ALTER TABLE "StockLedger"
  ALTER COLUMN "quantity" TYPE DOUBLE PRECISION USING "quantity"::double precision,
  ALTER COLUMN "balanceAfter" TYPE DOUBLE PRECISION USING "balanceAfter"::double precision;

ALTER TABLE "ProductionOrder"
  ADD COLUMN "customOrderId" INTEGER,
  ADD COLUMN "standardMins" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "actualMins" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "labourVarianceMins" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "labourVarianceCost" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "ProductionStep"
  ADD COLUMN "labourRatePerHour" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN "machineCostPerUnit" DOUBLE PRECISION NOT NULL DEFAULT 0;

ALTER TABLE "MaterialConsumption"
  ADD COLUMN "scrapQty" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN "returnedQty" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN "scrapReason" TEXT;

CREATE TABLE "ScrapInventory" (
  "id" SERIAL NOT NULL,
  "productionOrderId" INTEGER,
  "rawMaterialId" INTEGER NOT NULL,
  "materialConsumptionId" INTEGER,
  "quantity" DOUBLE PRECISION NOT NULL,
  "unitOfMeasure" TEXT NOT NULL DEFAULT 'PCS',
  "unitCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "estimatedValue" INTEGER NOT NULL DEFAULT 0,
  "reason" TEXT,
  "disposition" TEXT NOT NULL DEFAULT 'REUSABLE',
  "status" TEXT NOT NULL DEFAULT 'IN_STOCK',
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ScrapInventory_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CustomOrderInventory" (
  "id" SERIAL NOT NULL,
  "customOrderId" INTEGER NOT NULL,
  "productionOrderId" INTEGER,
  "productId" INTEGER NOT NULL,
  "quantity" INTEGER NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'READY',
  "unitCost" INTEGER NOT NULL DEFAULT 0,
  "totalCost" INTEGER NOT NULL DEFAULT 0,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "CustomOrderInventory_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ProductionOrder_customOrderId_idx" ON "ProductionOrder"("customOrderId");
CREATE INDEX "ScrapInventory_productionOrderId_idx" ON "ScrapInventory"("productionOrderId");
CREATE INDEX "ScrapInventory_rawMaterialId_idx" ON "ScrapInventory"("rawMaterialId");
CREATE INDEX "ScrapInventory_status_idx" ON "ScrapInventory"("status");
CREATE INDEX "CustomOrderInventory_customOrderId_idx" ON "CustomOrderInventory"("customOrderId");
CREATE INDEX "CustomOrderInventory_productionOrderId_idx" ON "CustomOrderInventory"("productionOrderId");
CREATE INDEX "CustomOrderInventory_productId_idx" ON "CustomOrderInventory"("productId");
CREATE INDEX "CustomOrderInventory_status_idx" ON "CustomOrderInventory"("status");

ALTER TABLE "ProductionOrder"
  ADD CONSTRAINT "ProductionOrder_customOrderId_fkey"
  FOREIGN KEY ("customOrderId") REFERENCES "CustomOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ScrapInventory"
  ADD CONSTRAINT "ScrapInventory_productionOrderId_fkey"
  FOREIGN KEY ("productionOrderId") REFERENCES "ProductionOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ScrapInventory"
  ADD CONSTRAINT "ScrapInventory_rawMaterialId_fkey"
  FOREIGN KEY ("rawMaterialId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CustomOrderInventory"
  ADD CONSTRAINT "CustomOrderInventory_customOrderId_fkey"
  FOREIGN KEY ("customOrderId") REFERENCES "CustomOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CustomOrderInventory"
  ADD CONSTRAINT "CustomOrderInventory_productionOrderId_fkey"
  FOREIGN KEY ("productionOrderId") REFERENCES "ProductionOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CustomOrderInventory"
  ADD CONSTRAINT "CustomOrderInventory_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
