'use server'

import { prisma } from '@/lib/db'
import { revalidatePath } from 'next/cache'
import { requireAuth, requireRole } from '@/lib/auth-helpers'
import { createBranchSchema, updateBranchSchema, createGodownSchema, updateGodownSchema, createTransferSchema } from '@/lib/validations/godown'
import { completeStockTransfer, defaultGodown, inventoryError, inventoryTransaction, lockProducts, moveStock, prepareStock } from '@/lib/inventory/stock'
import { assertId } from '@/lib/commerce/documents'
import { z } from 'zod'
import { godownTotals } from '@/lib/inventory/godown-values'
import { saveBranch, removeBranch, saveGodown, removeGodown, chooseDefaultGodown, requestStockTransfer, cancelPendingTransfer } from '@/lib/inventory/godown-management'

function refreshGodownConsumers() {
  revalidatePath('/godowns'); revalidatePath('/inventory'); revalidatePath('/manufacturing')
}

// ─── CORE SYNC ENGINE ────────────────────────────────────
// All physical stock changes use lib/inventory/stock within the document transaction.
// This ensures Product.stock always equals SUM(GodownStock.quantity)

/**
 * Adjusts godown stock, creates a StockLedger entry, and syncs Product.stock.
 * Server action wrapper for the shared transactional engine.
 */
export async function adjustGodownStock(
  productId: number,
  godownId: number,
  quantity: number, // positive = add, negative = deduct
  entryType: string,
  options?: {
    referenceType?: string
    referenceId?: number
    notes?: string
    createdBy?: string
  }
) {
  try {
  const session = await requireRole('ADMIN', 'MANAGER')
  assertId(productId); assertId(godownId)
  if (!['IN', 'OUT', 'ADJUSTMENT'].includes(entryType) || !Number.isFinite(quantity) || quantity === 0) throw new Error('Invalid manual stock adjustment')
  if ((entryType === 'IN' && quantity < 0) || (entryType === 'OUT' && quantity > 0)) throw new Error('Adjustment direction does not match quantity')
  if (typeof options?.notes !== 'string' || !options.notes.trim()) throw new Error('An adjustment reason is required')
  const data = await inventoryTransaction(prisma, tx => moveStock(tx, productId, godownId, quantity, entryType, { referenceType: 'Manual', notes: options.notes, createdBy: session.user.name }))
  refreshGodownConsumers()
  return { success: true, data }
  } catch (error) { return { success: false, error: inventoryError(error) } }
}

/**
 * Gets the default godown, creating one if none exists.
 */
export async function getOrCreateDefaultGodown() {
  try {
  await requireRole('ADMIN', 'MANAGER')
  return inventoryTransaction(prisma, defaultGodown)
  } catch (error) { return { success: false, error: inventoryError(error) } }
}

// ─── STOCK LEDGER ────────────────────────────────────────

export async function getStockLedger(filters?: { productId?: number; godownId?: number; limit?: number; cursor?: number }) {
  await requireAuth()
  const parsed = z.object({ productId: z.number().int().positive().optional(), godownId: z.number().int().positive().optional(), cursor: z.number().int().positive().optional(), limit: z.number().int().positive().max(1000).optional() }).safeParse(filters || {})
  if (!parsed.success) return { success: false, error: 'Invalid ledger filters', data: [], nextCursor: null }
  const limit = Math.min(1000, Math.max(1, Math.floor(filters?.limit || 100)))
  const entries = await prisma.stockLedger.findMany({
    where: {
      ...(filters?.productId ? { productId: filters.productId } : {}),
      ...(filters?.godownId ? { godownId: filters.godownId } : {}),
    },
    include: {
      product: { select: { name: true, sku: true } },
      godown: { select: { name: true } },
      batchMovements: { include: { batch: { select: { batchNumber: true } } }, orderBy: { id: 'asc' } },
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
    ...(filters?.cursor ? { cursor: { id: filters.cursor }, skip: 1 } : {}),
  })
  const data = entries.slice(0, limit)
  return { success: true, data, nextCursor: entries.length > limit ? data.at(-1)?.id ?? null : null }
}

// ─── GODOWN STOCK SUMMARY ────────────────────────────────

export async function getGodownStockSummary() {
  await requireAuth()
  const godowns = await prisma.godown.findMany({
    include: {
      branch: { select: { name: true } },
      stocks: {
        include: { product: { select: { name: true, sku: true, price: true, costPrice: true, unitOfMeasure: true, category: { select: { name: true } } } } },
      },
      _count: { select: { stocks: true, ledgerEntries: true } },
    },
    orderBy: { name: 'asc' },
  })

  return {
    success: true,
    data: godowns.map(g => {
      return {
        ...g,
        ...godownTotals(g.stocks, g.capacity),
      }
    }),
  }
}

// ─── BRANCHES ────────────────────────────────────────

export async function getBranches() {
  await requireAuth()
  const branches = await prisma.branch.findMany({
    orderBy: { name: 'asc' },
    include: {
      godowns: { select: { id: true, name: true, type: true, isDefault: true } },
      _count: { select: { godowns: true } },
    },
  })
  return { success: true, data: branches }
}

export async function createBranch(data: unknown) {
  try {
  try { await requireRole('ADMIN') } catch { return { success: false, error: 'Admin access required' } }
  const parsed = createBranchSchema.safeParse(data)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }

  const branch = await inventoryTransaction(prisma, tx => saveBranch(tx, parsed.data))
  revalidatePath('/godowns')
  return { success: true, data: branch }
  } catch (error) { return { success: false, error: inventoryError(error) } }
}

export async function updateBranch(id: number, data: unknown) {
  try {
  try { await requireRole('ADMIN') } catch { return { success: false, error: 'Admin access required' } }
  const parsed = updateBranchSchema.safeParse(data)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }

  assertId(id)
  const branch = await inventoryTransaction(prisma, tx => saveBranch(tx, parsed.data, id))
  revalidatePath('/godowns')
  return { success: true, data: branch }
  } catch (error) { return { success: false, error: inventoryError(error) } }
}

export async function deleteBranch(id: number) {
  try {
  try { await requireRole('ADMIN') } catch { return { success: false, error: 'Admin access required' } }
  assertId(id)
  await inventoryTransaction(prisma, tx => removeBranch(tx, id))
  revalidatePath('/godowns')
  return { success: true }
  } catch (error) { return { success: false, error: inventoryError(error) } }
}

// ─── GODOWNS ─────────────────────────────────────────

export async function getGodowns() {
  await requireAuth()
  const godowns = await prisma.godown.findMany({
    orderBy: { name: 'asc' },
    include: {
      branch: { select: { name: true } },
      _count: { select: { stocks: true } },
    },
  })
  return { success: true, data: godowns }
}

export async function createGodown(data: unknown) {
  try { await requireRole('ADMIN', 'MANAGER') } catch { return { success: false, error: 'Access denied' } }
  const parsed = createGodownSchema.safeParse(data)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }

  try {
  const godown = await inventoryTransaction(prisma, tx => saveGodown(tx, parsed.data))
  refreshGodownConsumers()
  return { success: true, data: godown }
  } catch (error) { return { success: false, error: inventoryError(error) } }
}

export async function updateGodown(id: number, data: unknown) {
  try { await requireRole('ADMIN', 'MANAGER') } catch { return { success: false, error: 'Access denied' } }
  const parsed = updateGodownSchema.safeParse(data)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }

  try {
  const godown = await inventoryTransaction(prisma, tx => saveGodown(tx, parsed.data, id))
  refreshGodownConsumers()
  return { success: true, data: godown }
  } catch (error) { return { success: false, error: inventoryError(error) } }
}

export async function deleteGodown(id: number) {
  try { await requireRole('ADMIN') } catch { return { success: false, error: 'Admin access required' } }
  try {
  await inventoryTransaction(prisma, tx => removeGodown(tx, id))
  refreshGodownConsumers()
  return { success: true }
  } catch (error) { return { success: false, error: inventoryError(error) } }
}

export async function setDefaultGodown(id: number) {
  try { await requireRole('ADMIN', 'MANAGER') } catch { return { success: false, error: 'Access denied' } }
  try {
  await inventoryTransaction(prisma, tx => chooseDefaultGodown(tx, id))
  refreshGodownConsumers()
  return { success: true }
  } catch (error) { return { success: false, error: inventoryError(error) } }
}

// ─── GODOWN STOCK ─────────────────────────────────────

export async function getGodownStock(godownId?: number) {
  await requireAuth()
  if (godownId !== undefined && !z.number().int().positive().safeParse(godownId).success) return { success: false, error: 'Invalid godown filter', data: [] }
  const stocks = await prisma.godownStock.findMany({
    where: godownId !== undefined ? { godownId } : undefined,
    include: {
      product: { select: { name: true, sku: true, price: true, costPrice: true, unitOfMeasure: true, category: { select: { name: true } } } },
      godown: { select: { name: true, type: true } },
    },
    orderBy: { product: { name: 'asc' } },
  })
  return { success: true, data: stocks }
}

export async function updateGodownStock(productId: number, godownId: number, quantity: number) {
  try { await requireRole('ADMIN', 'MANAGER') } catch { return { success: false, error: 'Access denied' } }
  const { updateStock } = await import('./products')
  return updateStock({ id: productId, godownId, stock: quantity, mode: 'SET' })
}

/**
 * Receives new stock into a godown. Retain this action name for existing callers;
 * it is ADD, not a relocation. Existing stock moves through transfer actions.
 */
export async function assignStockToGodown(productId: number, godownId: number, quantity: number, notes?: string) {
  try { await requireRole('ADMIN', 'MANAGER') } catch { return { success: false, error: 'Access denied' } }
  const { updateStock } = await import('./products')
  return updateStock({ id: productId, godownId, stock: quantity, mode: 'ADD', notes: notes || 'New stock received into godown' })
}

// ─── INTER-GODOWN TRANSFERS ──────────────────────────

export async function getTransfers() {
  await requireAuth()
  const transfers = await prisma.godownTransfer.findMany({
    orderBy: [{ date: 'desc' }, { id: 'desc' }],
    include: {
      fromGodown: { select: { name: true } },
      toGodown: { select: { name: true } },
      items: { include: { product: { select: { name: true, sku: true } } } },
    },
  })
  return { success: true, data: transfers }
}

export async function createTransfer(data: unknown) {
  let requestedBy: string
  try { requestedBy = (await requireRole('ADMIN', 'MANAGER')).user.name } catch { return { success: false, error: 'Access denied' } }
  const parsed = createTransferSchema.safeParse(data)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }

  try {
  const transfer = await inventoryTransaction(prisma, tx => requestStockTransfer(tx, parsed.data, requestedBy))
  refreshGodownConsumers()
  return { success: true, data: transfer }
  } catch (error) { return { success: false, error: inventoryError(error) } }
}

export async function completeTransfer(id: number, _approvedBy?: string) {
  let actor: string
  try { actor = (await requireRole('ADMIN', 'MANAGER')).user.name } catch { return { success: false, error: 'Access denied' } }

  try {
  await inventoryTransaction(prisma, tx => completeStockTransfer(tx, id, actor))

  refreshGodownConsumers()
  return { success: true }
  } catch (error) { return { success: false, error: inventoryError(error) } }
}

export async function cancelTransfer(id: number) {
  try {
    await requireRole('ADMIN', 'MANAGER')
    await inventoryTransaction(prisma, tx => cancelPendingTransfer(tx, id))
    refreshGodownConsumers()
    return { success: true }
  } catch (error) { return { success: false, error: inventoryError(error) } }
}

// ─── MIGRATION HELPER ────────────────────────────────

/**
 * One-time migration: Creates GodownStock entries from existing Product.stock values.
 * Ensures all products have their stock allocated in the default godown.
 */
export async function migrateExistingStockToGodowns() {
  try { await requireRole('ADMIN') } catch { return { success: false, error: 'Admin access required' } }

  try {
  const result = await inventoryTransaction(prisma, async tx => {
  const products = await tx.product.findMany({
    where: { stock: { gt: 0 } },
    select: { id: true, stock: true, name: true },
    orderBy: { id: 'asc' },
  })
  // Same ordered locks as transfers/receipts; never replace allocated balances.
  await lockProducts(tx, products.map(product => product.id))
  const location = await defaultGodown(tx)

  let migrated = 0
  for (const product of products) {
    const existingGodownStock = await tx.godownStock.findFirst({
      where: { productId: product.id },
    })

    if (!existingGodownStock) {
      await prepareStock(tx, product.id)
      migrated++
    }
  }
  return { migrated, defaultGodownId: location.id, defaultGodownName: location.name }
  })

  refreshGodownConsumers()
  return { success: true, ...result }
  } catch (error) { return { success: false, error: inventoryError(error) } }
}
