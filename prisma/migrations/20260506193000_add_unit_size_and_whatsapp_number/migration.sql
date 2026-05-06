-- Add missing columns referenced by current app code.
-- These were present in schema.prisma but missing from migration history.

ALTER TABLE "Product"
ADD COLUMN IF NOT EXISTS "unitSize" DOUBLE PRECISION NOT NULL DEFAULT 1;

ALTER TABLE "StoreSettings"
ADD COLUMN IF NOT EXISTS "whatsappNumber" TEXT;
