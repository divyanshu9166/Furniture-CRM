import { prisma } from './db'

// ─── Manufacturing permission flags (STAFF access, admin-configurable) ───────
//
// Singleton row (id = 1). All flags default to false, so STAFF start with NO
// access to the gated manufacturing features; an admin turns them on one by one
// in Settings → Permissions. ADMIN / MANAGER bypass these flags entirely.

export interface ManufacturingPermissionFlags {
  staffCreateBom: boolean
  staffCreateProductionOrder: boolean
  staffCreateWorkCenter: boolean
  staffMrpPlanner: boolean
  staffCustomInventory: boolean
  staffJobCosting: boolean
}

export const DEFAULT_MANUFACTURING_PERMISSIONS: ManufacturingPermissionFlags = {
  staffCreateBom: false,
  staffCreateProductionOrder: false,
  staffCreateWorkCenter: false,
  staffMrpPlanner: false,
  staffCustomInventory: false,
  staffJobCosting: false,
}

/** Read the singleton, creating it with all-false defaults on first access. */
export async function getManufacturingPermissionFlags(): Promise<ManufacturingPermissionFlags> {
  try {
    const row = await prisma.manufacturingPermissions.upsert({
      where: { id: 1 },
      update: {},
      create: { id: 1 },
    })
    return {
      staffCreateBom: row.staffCreateBom,
      staffCreateProductionOrder: row.staffCreateProductionOrder,
      staffCreateWorkCenter: row.staffCreateWorkCenter,
      staffMrpPlanner: row.staffMrpPlanner,
      staffCustomInventory: row.staffCustomInventory,
      staffJobCosting: row.staffJobCosting,
    }
  } catch {
    // If the table/columns don't exist yet (migration not applied), fail closed:
    // STAFF get no extra access, ADMIN/MANAGER are unaffected (they never reach here).
    return { ...DEFAULT_MANUFACTURING_PERMISSIONS }
  }
}
