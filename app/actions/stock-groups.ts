'use server'

import { prisma } from '@/lib/db'
import { revalidatePath } from 'next/cache'
import { requireRole } from '@/lib/auth-helpers'
import { z } from 'zod'

const createStockGroupSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  parentId: z.number().optional(),
})

export async function getStockGroups() {
  const groups = await prisma.stockGroup.findMany({
    orderBy: { name: 'asc' },
    include: {
      parent: { select: { name: true } },
      _count: { select: { products: true, children: true } },
    },
  })
  return { success: true, data: groups }
}

export async function createStockGroup(data: unknown) {
  try { await requireRole('ADMIN', 'MANAGER') } catch { return { success: false, error: 'Access denied' } }
  const parsed = createStockGroupSchema.safeParse(data)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }

  const existing = await prisma.stockGroup.findUnique({ where: { name: parsed.data.name } })
  if (existing) return { success: false, error: 'Stock group with this name already exists' }

  const group = await prisma.stockGroup.create({ data: parsed.data })
  revalidatePath('/inventory')
  return { success: true, data: group }
}
