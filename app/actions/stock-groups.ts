'use server'

import { prisma } from '@/lib/db'
import { revalidatePath } from 'next/cache'
import { requireAuth, requireRole } from '@/lib/auth-helpers'
import { inventoryError, inventoryTransaction } from '@/lib/inventory/stock'
import { z } from 'zod'

const createStockGroupSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(80, 'Name is too long'),
  parentId: z.number().int().positive().nullable().optional(),
})

export async function getStockGroups() {
  try {
    await requireAuth()
    const groups = await prisma.stockGroup.findMany({
      orderBy: { name: 'asc' },
      include: {
        parent: { select: { id: true, name: true } },
        _count: { select: { products: true, children: true } },
      },
    })
    return { success: true, data: groups }
  } catch (error) {
    console.error('Failed to load stock groups:', error)
    return { success: false, error: 'Unable to load stock groups right now' }
  }
}

export async function createStockGroup(data: unknown) {
  try { await requireRole('ADMIN', 'MANAGER') } catch { return { success: false, error: 'Access denied' } }
  try {
    const parsed = createStockGroupSchema.safeParse(data)
    if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }

    const group = await inventoryTransaction(prisma, async tx => {
    if (parsed.data.parentId) {
      const parent = await tx.stockGroup.findUnique({ where: { id: parsed.data.parentId }, select: { id: true } })
      if (!parent) throw new Error('Selected parent group was not found')
    }

    const existing = await tx.stockGroup.findFirst({
      where: { name: { equals: parsed.data.name, mode: 'insensitive' } },
      select: { id: true },
    })
    if (existing) throw new Error('Stock group with this name already exists')

    return tx.stockGroup.create({
      data: { name: parsed.data.name, parentId: parsed.data.parentId ?? null },
    })
    })
    revalidatePath('/inventory')
    return { success: true, data: group }
  } catch (error: any) {
    console.error('Failed to create stock group:', error)
    if (error?.code === 'P2002') return { success: false, error: 'Stock group with this name already exists' }
    return { success: false, error: inventoryError(error) }
  }
}

export async function updateStockGroup(id: number, data: unknown) {
  try { await requireRole('ADMIN', 'MANAGER') } catch { return { success: false, error: 'Access denied' } }
  try {
    if (!Number.isInteger(id) || id <= 0) return { success: false, error: 'Invalid stock group' }
    const parsed = createStockGroupSchema.safeParse(data)
    if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }

    const group = await inventoryTransaction(prisma, async tx => {
    const current = await tx.stockGroup.findUnique({ where: { id }, select: { id: true } })
    if (!current) throw new Error('Stock group not found')

    if (parsed.data.parentId === id) throw new Error('A group cannot be its own parent')

    if (parsed.data.parentId) {
      const parent = await tx.stockGroup.findUnique({ where: { id: parsed.data.parentId }, select: { id: true, parentId: true } })
      if (!parent) throw new Error('Selected parent group was not found')

      // Walk up the proposed parent chain to prevent circular hierarchies.
      const seen = new Set<number>()
      let ancestorId: number | null = parent.id
      while (ancestorId) {
        if (ancestorId === id) throw new Error('A group cannot be placed under one of its child groups')
        if (seen.has(ancestorId)) throw new Error('Invalid group hierarchy')
        seen.add(ancestorId)
        const ancestor = await tx.stockGroup.findUnique({ where: { id: ancestorId }, select: { parentId: true } })
        ancestorId = ancestor?.parentId ?? null
      }
    }

    const duplicate = await tx.stockGroup.findFirst({
      where: {
        id: { not: id },
        name: { equals: parsed.data.name, mode: 'insensitive' },
      },
      select: { id: true },
    })
    if (duplicate) throw new Error('Stock group with this name already exists')

    return tx.stockGroup.update({
      where: { id },
      data: { name: parsed.data.name, parentId: parsed.data.parentId ?? null },
    })
    })
    revalidatePath('/inventory')
    return { success: true, data: group }
  } catch (error: any) {
    console.error('Failed to update stock group:', error)
    if (error?.code === 'P2002') return { success: false, error: 'Stock group with this name already exists' }
    return { success: false, error: inventoryError(error) }
  }
}

export async function deleteStockGroup(id: number) {
  try { await requireRole('ADMIN', 'MANAGER') } catch { return { success: false, error: 'Access denied' } }
  try {
    if (!Number.isInteger(id) || id <= 0) return { success: false, error: 'Invalid stock group' }

    await inventoryTransaction(prisma, async tx => {
    const group = await tx.stockGroup.findUnique({
      where: { id },
      include: { _count: { select: { products: true, children: true } } },
    })
    if (!group) throw new Error('Stock group not found')
    if (group._count.products > 0) throw new Error('Move products out of this group before deleting it')
    if (group._count.children > 0) throw new Error('Move or delete child groups before deleting this group')

    await tx.stockGroup.delete({ where: { id } })
    })
    revalidatePath('/inventory')
    return { success: true }
  } catch (error) {
    console.error('Failed to delete stock group:', error)
    return { success: false, error: error instanceof Error ? error.message : 'Unable to delete stock group right now' }
  }
}
