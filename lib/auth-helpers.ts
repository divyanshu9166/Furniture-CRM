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
