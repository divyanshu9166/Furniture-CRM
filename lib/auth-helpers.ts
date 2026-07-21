import { getSession as getCustomSession } from './session'
import type { UserRole } from '@prisma/client'

export async function getSession() {
  const session = await getCustomSession()
  if (!session) return null
  
  return {
    user: {
      id: session.id,
      email: session.email,
      name: session.name,
      role: session.role as UserRole,
      staffId: session.staffId,
    }
  }
}

export async function requireAuth() {
  const session = await getSession()
  if (!session?.user) {
    throw new Error('Unauthorized')
  }
  return session
}

export async function requireRole(...roles: UserRole[]) {
  const session = await requireAuth()
  if (!roles.includes(session.user.role)) {
    throw new Error('Forbidden')
  }
  return session
}

// Configurable manufacturing permissions for STAFF.
// ADMIN and MANAGER always have full access. STAFF only gains a feature when
// the admin has toggled it on in Settings → Permissions. These keys map 1:1 to
// the boolean columns on the ManufacturingPermissions singleton (id = 1).
export type ManufacturingPermissionKey =
  | 'staffCreateBom'
  | 'staffCreateProductionOrder'
  | 'staffCreateWorkCenter'
  | 'staffMrpPlanner'
  | 'staffCustomInventory'
  | 'staffJobCosting'

/**
 * Throws 'Unauthorized' if not logged in, or 'Forbidden' if the caller is a
 * STAFF member without the given manufacturing permission enabled.
 * ADMIN / MANAGER always pass.
 */
export async function requireManufacturingPermission(feature: ManufacturingPermissionKey) {
  const session = await requireAuth()
  if (session.user.role === 'ADMIN' || session.user.role === 'MANAGER') {
    return session
  }
  // STAFF (or any other role) — consult the configurable permission store.
  const { getManufacturingPermissionFlags } = await import('./manufacturing-permissions')
  const flags = await getManufacturingPermissionFlags()
  if (!flags[feature]) {
    throw new Error('Forbidden')
  }
  return session
}
