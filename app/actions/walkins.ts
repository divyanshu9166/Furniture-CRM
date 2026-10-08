'use server'

import { prisma } from '@/lib/db'
import { revalidatePath } from 'next/cache'
import { createWalkinSchema } from '@/lib/validations/walkin'
import type { WalkinStatus } from '@prisma/client'
import { requireAuth } from '@/lib/auth-helpers'
import { assertWalkinRequirement, RequirementsChangedError } from '@/lib/walkins/requirements'

const statusMap: Record<string, WalkinStatus> = {
  'Browsing': 'BROWSING', 'Interested': 'INTERESTED',
  'Follow-up': 'FOLLOW_UP', 'Converted': 'CONVERTED', 'Left': 'LEFT',
}
const statusDisplay: Record<WalkinStatus, string> = {
  BROWSING: 'Browsing', INTERESTED: 'Interested',
  FOLLOW_UP: 'Follow-up', CONVERTED: 'Converted', LEFT: 'Left',
}

export async function getWalkins() {
  const walkins = await prisma.walkin.findMany({
    include: { contact: true, assignedTo: true },
    orderBy: { date: 'desc' },
  })

  return {
    success: true,
    data: walkins.map(w => ({
      id: w.id,
      name: w.contact.name,
      phone: w.contact.phone,
      email: w.contact.email,
      requirement: w.requirement,
      assignedTo: w.assignedTo?.name || null,
      date: w.date.toISOString().split('T')[0],
      time: w.time,
      status: statusDisplay[w.status],
      budget: w.budget,
      notes: w.notes,
      source: w.source,
      visitDuration: w.visitDuration,
    })),
  }
}

export async function createWalkin(data: unknown) {
  try { await requireAuth() } catch { return { success: false, error: 'Please sign in to register a walk-in' } }
  const parsed = createWalkinSchema.safeParse(data)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }

  const { name, phone, email, requirement, assignedToId, budget, notes } = parsed.data

  try {
    const walkin = await prisma.$transaction(async tx => {
      await assertWalkinRequirement(tx, requirement)
      const contact = await tx.contact.upsert({
        where: { phone }, update: {},
        create: { name, phone, email: email || null, source: 'Walk-in' },
      })
      const now = new Date()
      return tx.walkin.create({
        data: {
          contactId: contact.id, requirement, assignedToId, date: now,
          time: now.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: true }),
          budget, notes,
        },
      })
    })
    revalidatePath('/walkins')
    return { success: true, data: walkin }
  } catch (error) {
    return {
      success: false,
      error: error instanceof RequirementsChangedError ? error.message : 'Could not register the walk-in. Please try again.',
      requirementsChanged: error instanceof RequirementsChangedError,
    }
  }
}

export async function updateWalkinStatus(id: number, status: string) {
  const dbStatus = statusMap[status]
  if (!dbStatus) return { success: false, error: 'Invalid status' }

  const walkin = await prisma.walkin.update({
    where: { id },
    data: { status: dbStatus },
  })

  revalidatePath('/walkins')
  return { success: true, data: walkin }
}
