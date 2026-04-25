-- Add staff relation for production order assignment while keeping legacy text assignment
ALTER TABLE "ProductionOrder"
ADD COLUMN "assignedStaffId" INTEGER;

-- Backfill relation using legacy assignee names (case-insensitive name match)
UPDATE "ProductionOrder" po
SET "assignedStaffId" = mapped.staff_id
FROM (
  SELECT po_inner."id" AS order_id, MIN(s."id") AS staff_id
  FROM "ProductionOrder" po_inner
  JOIN "Staff" s
    ON LOWER(TRIM(po_inner."assignedTo")) = LOWER(TRIM(s."name"))
  WHERE po_inner."assignedTo" IS NOT NULL
    AND TRIM(po_inner."assignedTo") <> ''
  GROUP BY po_inner."id"
) mapped
WHERE po."id" = mapped.order_id
  AND po."assignedStaffId" IS NULL;

CREATE INDEX "ProductionOrder_assignedStaffId_idx"
ON "ProductionOrder"("assignedStaffId");

ALTER TABLE "ProductionOrder"
ADD CONSTRAINT "ProductionOrder_assignedStaffId_fkey"
FOREIGN KEY ("assignedStaffId") REFERENCES "Staff"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
