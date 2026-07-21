-- Manufacturing per-feature permission grants for STAFF logins (singleton, id = 1).
--
-- ADMIN and MANAGER always have full manufacturing access in code; these flags
-- ONLY widen access for STAFF and all default to false, so existing behaviour is
-- unchanged until an admin enables a feature in Settings → Permissions.
--
-- New table only — no existing rows/columns touched. Written idempotently so it
-- applies cleanly on databases previously bootstrapped with `prisma db push`.

CREATE TABLE IF NOT EXISTS "ManufacturingPermissions" (
  "id"                         INTEGER NOT NULL DEFAULT 1,
  "staffCreateBom"             BOOLEAN NOT NULL DEFAULT false,
  "staffCreateProductionOrder" BOOLEAN NOT NULL DEFAULT false,
  "staffCreateWorkCenter"      BOOLEAN NOT NULL DEFAULT false,
  "staffMrpPlanner"            BOOLEAN NOT NULL DEFAULT false,
  "staffCustomInventory"       BOOLEAN NOT NULL DEFAULT false,
  "staffJobCosting"            BOOLEAN NOT NULL DEFAULT false,
  "updatedAt"                  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ManufacturingPermissions_pkey" PRIMARY KEY ("id")
);
