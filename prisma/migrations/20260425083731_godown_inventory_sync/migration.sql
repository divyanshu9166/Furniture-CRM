-- AlterTable
ALTER TABLE "Godown" ADD COLUMN     "capacity" INTEGER,
ADD COLUMN     "isDefault" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "type" TEXT NOT NULL DEFAULT 'Warehouse';

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "godownId" INTEGER;

-- CreateTable
CREATE TABLE "StockLedger" (
    "id" SERIAL NOT NULL,
    "productId" INTEGER NOT NULL,
    "godownId" INTEGER NOT NULL,
    "entryType" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "balanceAfter" INTEGER NOT NULL,
    "referenceType" TEXT,
    "referenceId" INTEGER,
    "notes" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockLedger_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StockLedger_productId_idx" ON "StockLedger"("productId");

-- CreateIndex
CREATE INDEX "StockLedger_godownId_idx" ON "StockLedger"("godownId");

-- CreateIndex
CREATE INDEX "StockLedger_createdAt_idx" ON "StockLedger"("createdAt");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_godownId_fkey" FOREIGN KEY ("godownId") REFERENCES "Godown"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockLedger" ADD CONSTRAINT "StockLedger_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockLedger" ADD CONSTRAINT "StockLedger_godownId_fkey" FOREIGN KEY ("godownId") REFERENCES "Godown"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
