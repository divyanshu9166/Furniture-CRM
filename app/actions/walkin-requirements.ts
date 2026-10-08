'use server'

import { prisma } from '@/lib/db'
import { requireAuth, requireRole } from '@/lib/auth-helpers'
import { revalidatePath } from 'next/cache'
import { readWalkinRequirements, saveWalkinRequirements, saveRequirementsSchema, RequirementsChangedError } from '@/lib/walkins/requirements'

export async function getWalkinRequirements() {
  try { await requireAuth() } catch { return { success: false, error: 'Please sign in to view requirements' } }
  try {
    return { success: true, data: await readWalkinRequirements(prisma) }
  } catch {
    return { success: false, error: 'Could not load requirements. Ensure database migrations are applied, then try again.' }
  }
}

export async function updateWalkinRequirements(input: unknown) {
  try { await requireRole('ADMIN', 'MANAGER') } catch { return { success: false, error: 'Admin or manager access required' } }
  const parsed = saveRequirementsSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }
  try {
    const data = await saveWalkinRequirements(prisma, parsed.data)
    revalidatePath('/walkins')
    revalidatePath('/walkin-form')
    return { success: true, data }
  } catch (error) {
    return {
      success: false,
      error: error instanceof RequirementsChangedError ? error.message : 'Could not save requirements. Please try again.',
      conflict: error instanceof RequirementsChangedError,
    }
  }
}
