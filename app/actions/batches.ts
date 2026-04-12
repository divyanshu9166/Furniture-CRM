'use server'

import { prisma } from '@/lib/db'
import { revalidatePath } from 'next/cache'
import { requireRole } from '@/lib/auth-helpers'
import { z } from 'zod'

const createBatchSchema = z.object({
  productId: z.number(),
  batchNumber: z.string().min(1, 'Batch number is required'),
  purchaseDate: z.string().optional(),
  expiryDate: z.string().optional(),
  quantity: z.number().min(1),
  remainingQty: z.number().min(0),
  costPrice: z.number().min(0).default(0),
  supplierId: z.number().optional(),
  poId: z.number().optional(),
})

export async function getBatches(productId?: number) {
  const batches = await prisma.productBatch.findMany({
    where: productId ? { productId } : undefined,
    include: {
      product: { select: { name: true, sku: true } },
    },
    orderBy: { purchaseDate: 'desc' },
  })
  return { success: true, data: batches }
}

export async function createBatch(data: unknown) {
  try { await requireRole('ADMIN', 'MANAGER') } catch { return { success: false, error: 'Access denied' } }
  const parsed = createBatchSchema.safeParse(data)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }

  const { purchaseDate, expiryDate, ...rest } = parsed.data
  const batch = await prisma.productBatch.create({
    data: {
      ...rest,
      purchaseDate: purchaseDate ? new Date(purchaseDate) : new Date(),
      expiryDate: expiryDate ? new Date(expiryDate) : undefined,
    },
  })
  revalidatePath('/inventory')
  return { success: true, data: batch }
}

export async function getAgingAnalysis() {
  const batches = await prisma.productBatch.findMany({
    where: { remainingQty: { gt: 0 } },
    include: { product: { select: { name: true, sku: true, category: { select: { name: true } } } } },
    orderBy: { purchaseDate: 'asc' },
  })

  const now = new Date()
  const aging = batches.map(b => {
    const days = Math.floor((now.getTime() - new Date(b.purchaseDate).getTime()) / (1000 * 60 * 60 * 24))
    let bracket = '0-30 days'
    if (days > 180) bracket = '180+ days'
    else if (days > 90) bracket = '91-180 days'
    else if (days > 60) bracket = '61-90 days'
    else if (days > 30) bracket = '31-60 days'

    return {
      ...b,
      ageDays: days,
      bracket,
      value: b.remainingQty * b.costPrice,
    }
  })

  return { success: true, data: aging }
}
