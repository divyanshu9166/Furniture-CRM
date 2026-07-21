-- Add a dedicated machineCost column to ProductionOrder.
--
-- Previously machine cost was folded into overheadCost at completion, so the
-- Job Costing UI (which reads a separate machineCost) always showed ₹0 for
-- Machine Cost and an inflated Other Expenses. This separates the two cost
-- categories. totalCost is unaffected (it always summed both).
--
-- NOT NULL with a default of 0 so every existing row keeps a valid value and
-- historical totals are unchanged. Idempotent (IF NOT EXISTS) so it applies
-- cleanly on databases previously bootstrapped with `prisma db push`.

ALTER TABLE "ProductionOrder" ADD COLUMN IF NOT EXISTS "machineCost" INTEGER NOT NULL DEFAULT 0;
