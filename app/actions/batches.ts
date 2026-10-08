'use server'

import { prisma } from '@/lib/db'
import { revalidatePath } from 'next/cache'
import { requireAuth, requireRole } from '@/lib/auth-helpers'
import { assertBatchCoverage, batchSchema } from '@/lib/validations/batch'
import { inventoryError, inventoryTransaction, lockProducts } from '@/lib/inventory/stock'
import { ageInDays, agingBracket } from '@/lib/inventory/aging'
import { indiaDate } from '@/lib/inventory/batches'

export async function getBatches(productId?: number) {
  await requireAuth()
  const batches = await prisma.productBatch.findMany({
    where: productId ? { productId } : undefined,
    include: {
      product: { select: { name: true, sku: true } },
      _count: { select: { movements: true } },
    },
    orderBy: [{ purchaseDate: 'desc' }, { id: 'desc' }],
  })
  return { success: true, data: batches }
}

async function saveBatch(data: unknown, id?: number) {
  try { await requireRole('ADMIN', 'MANAGER') } catch { return { success: false, error: 'Access denied' } }
  const parsed = batchSchema.safeParse(data)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }

  try {
    const batch = await inventoryTransaction(prisma, async tx => {
      const { productId, purchaseDate, expiryDate, ...rest } = parsed.data
      await lockProducts(tx, [productId])
      const product = await tx.product.findUnique({ where: { id: productId } })
      if (!product) throw new Error('Product not found')
      let previousRemaining: number | undefined
      let previousPurchaseDate: Date | undefined
      if (id !== undefined) {
        const existing = await tx.productBatch.findUnique({ where: { id } })
        if (!existing || existing.productId !== productId) throw new Error('Batch not found or its product was changed')
        const history = await tx.batchMovement.count({ where: { batchId: id } })
        if (history > 0 && (rest.quantity !== existing.quantity || rest.remainingQty !== existing.remainingQty)) throw new Error('This lot has automatic movement history. Change physical stock through Update Stock; only lot metadata can be edited here.')
        previousRemaining = existing.remainingQty
        previousPurchaseDate = existing.purchaseDate
      }
      const allocated = await tx.productBatch.aggregate({ where: { productId, ...(id ? { id: { not: id } } : {}) }, _sum: { remainingQty: true } })
      assertBatchCoverage(product.stock, allocated._sum.remainingQty ?? 0, rest.remainingQty, previousRemaining)
      const receivedDate = !purchaseDate || purchaseDate === previousPurchaseDate?.toISOString().slice(0, 10)
        ? previousPurchaseDate ?? new Date(`${indiaDate()}T00:00:00.000Z`)
        : new Date(`${purchaseDate}T00:00:00.000Z`)
      const record = { productId, ...rest, purchaseDate: receivedDate, expiryDate: expiryDate ? new Date(`${expiryDate}T00:00:00.000Z`) : null }
      return id ? tx.productBatch.update({ where: { id }, data: record }) : tx.productBatch.create({ data: record })
    })
    revalidatePath('/inventory')
    return { success: true, data: batch }
  } catch (error) { return { success: false, error: inventoryError(error) } }
}

export async function createBatch(data: unknown) { return saveBatch(data) }

export async function updateBatch(id: number, data: unknown) {
  if (!Number.isSafeInteger(id) || id <= 0) return { success: false, error: 'Invalid batch' }
  return saveBatch(data, id)
}

export async function getAgingAnalysis() {
  await requireAuth()
  return inventoryTransaction(prisma, async tx => {
    const products = await tx.product.findMany({
      where: { stock: { gt: 0 } }, include: { category: true, batches: { where: { remainingQty: { gt: 0 } }, orderBy: [{ purchaseDate: 'asc' }, { id: 'asc' }] } },
    })
    const now = new Date()
    const data = products.flatMap(p => {
      // Batch records are manual annotations. Cap reported aging to physical stock
      // without rewriting legacy batches that may no longer match stock.
      let untracked = p.stock
      const product = { name: p.name, sku: p.sku, category: { name: p.category.name } }
      const rows = p.batches.map(b => {
        const remainingQty = Math.min(b.remainingQty, untracked)
        untracked -= remainingQty
        const ageDays = ageInDays(b.purchaseDate, now)
        return { ...b, product, remainingQty, ageDays, bracket: agingBracket(ageDays), value: remainingQty * b.costPrice,
          estimated: false, balanceWarning: b.remainingQty !== remainingQty }
      }).filter(row => row.remainingQty > 0)
      if (untracked > 0) {
        const purchaseDate = p.lastRestocked ?? p.createdAt
        const ageDays = ageInDays(purchaseDate, now)
        rows.push({ id: -p.id, productId: p.id, batchNumber: 'Untracked stock (estimate)', purchaseDate, expiryDate: null,
          quantity: untracked, remainingQty: untracked, costPrice: p.costPrice, supplierId: null, poId: null, createdAt: p.createdAt,
          product, ageDays, bracket: agingBracket(ageDays), value: untracked * p.costPrice, estimated: true, balanceWarning: false })
      }
      return rows
    }).sort((a, b) => b.ageDays - a.ageDays)
    return { success: true, data }
  })
}
