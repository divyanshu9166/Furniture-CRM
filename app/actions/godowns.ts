'use server'

import { prisma } from '@/lib/db'
import { revalidatePath } from 'next/cache'
import { requireAuth, requireRole } from '@/lib/auth-helpers'
import { createBranchSchema, createGodownSchema, createTransferSchema } from '@/lib/validations/godown'
import { completeStockTransfer, defaultGodown, inventoryError, inventoryTransaction, lockProducts, moveStock, prepareStock } from '@/lib/inventory/stock'
import { assertId } from '@/lib/commerce/documents'
import { z } from 'zod'
import { isManualCategory } from '@/lib/inventory/category'

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
  revalidatePath('/godowns'); revalidatePath('/inventory')
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
        include: { product: { select: { name: true, sku: true, price: true, costPrice: true, category: { select: { name: true } } } } },
      },
      _count: { select: { stocks: true, ledgerEntries: true } },
    },
    orderBy: { name: 'asc' },
  })

  return {
    success: true,
    data: godowns.map(g => {
      const totalItems = g.stocks.reduce((s, st) => s + st.quantity, 0)
      const totalValue = g.stocks.reduce((s, st) => s + st.quantity * (isManualCategory(st.product.category.name) ? st.product.costPrice : st.product.price), 0)
      const totalCostValue = g.stocks.reduce((s, st) => s + (st.quantity * (st.product?.costPrice || 0)), 0)
      return {
        ...g,
        totalItems,
        totalValue,
        totalCostValue,
        utilization: g.capacity ? Math.round((totalItems / g.capacity) * 100) : null,
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

  const branch = await inventoryTransaction(prisma, async tx => {
    if (parsed.data.isHeadOffice) await tx.branch.updateMany({ data: { isHeadOffice: false } })
    return tx.branch.create({ data: parsed.data })
  })
  revalidatePath('/godowns')
  return { success: true, data: branch }
  } catch (error) { return { success: false, error: inventoryError(error) } }
}

export async function updateBranch(id: number, data: unknown) {
  try {
  try { await requireRole('ADMIN') } catch { return { success: false, error: 'Admin access required' } }
  const parsed = createBranchSchema.safeParse(data)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }

  assertId(id)
  const branch = await inventoryTransaction(prisma, async tx => {
    if (parsed.data.isHeadOffice) await tx.branch.updateMany({ data: { isHeadOffice: false } })
    return tx.branch.update({ where: { id }, data: parsed.data })
  })
  revalidatePath('/godowns')
  return { success: true, data: branch }
  } catch (error) { return { success: false, error: inventoryError(error) } }
}

export async function deleteBranch(id: number) {
  try {
  try { await requireRole('ADMIN') } catch { return { success: false, error: 'Admin access required' } }
  assertId(id)
  await inventoryTransaction(prisma, async tx => {
    await tx.$queryRaw`SELECT id FROM "Branch" WHERE id = ${id} FOR UPDATE`
    if (await tx.godown.count({ where: { branchId: id } })) throw new Error('Cannot delete branch with godowns. Remove godowns first.')
    await tx.branch.delete({ where: { id } })
  })
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
  const godown = await inventoryTransaction(prisma, async tx => {
    const isDefault = parsed.data.isDefault || await tx.godown.count() === 0
    if (isDefault) await tx.godown.updateMany({ data: { isDefault: false } })
    return tx.godown.create({ data: { ...parsed.data, isDefault } })
  })
  revalidatePath('/godowns')
  revalidatePath('/inventory')
  return { success: true, data: godown }
  } catch (error) { return { success: false, error: inventoryError(error) } }
}

export async function updateGodown(id: number, data: unknown) {
  try { await requireRole('ADMIN', 'MANAGER') } catch { return { success: false, error: 'Access denied' } }
  const parsed = createGodownSchema.safeParse(data)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }

  try {
  const godown = await inventoryTransaction(prisma, async tx => {
    const existing = await tx.godown.findUnique({ where: { id } })
    if (!existing) throw new Error('Location not found')
    if (existing.isDefault && !parsed.data.isDefault) throw new Error('Select another default location before unsetting this default')
    if (parsed.data.isDefault) await tx.godown.updateMany({ data: { isDefault: false } })
    return tx.godown.update({ where: { id }, data: parsed.data })
  })
  revalidatePath('/godowns')
  revalidatePath('/inventory')
  return { success: true, data: godown }
  } catch (error) { return { success: false, error: inventoryError(error) } }
}

export async function deleteGodown(id: number) {
  try { await requireRole('ADMIN') } catch { return { success: false, error: 'Admin access required' } }
  try {
  await inventoryTransaction(prisma, async tx => {
    const location = await tx.godown.findUnique({ where: { id }, include: { _count: { select: { stocks: true, ledgerEntries: true, transfersFrom: true, transfersTo: true, orders: true } } } })
    if (!location) throw new Error('Location not found')
    if (Object.values(location._count).some(count => count > 0)) throw new Error('Cannot delete a location with stock, ledger, transfer or order history')
    if (location.isDefault && await tx.godown.count() > 1) throw new Error('Select another default location before deleting this one')
    await tx.godown.delete({ where: { id } })
  })
  revalidatePath('/godowns')
  revalidatePath('/inventory')
  return { success: true }
  } catch (error) { return { success: false, error: inventoryError(error) } }
}

export async function setDefaultGodown(id: number) {
  try { await requireRole('ADMIN', 'MANAGER') } catch { return { success: false, error: 'Access denied' } }
  try {
  await inventoryTransaction(prisma, async tx => {
    if (!await tx.godown.findUnique({ where: { id } })) throw new Error('Location not found')
    await tx.godown.updateMany({ data: { isDefault: false } })
    await tx.godown.update({ where: { id }, data: { isDefault: true } })
  })
  revalidatePath('/godowns')
  revalidatePath('/inventory')
  return { success: true }
  } catch (error) { return { success: false, error: inventoryError(error) } }
}

// ─── GODOWN STOCK ─────────────────────────────────────

export async function getGodownStock(godownId?: number) {
  await requireAuth()
  const stocks = await prisma.godownStock.findMany({
    where: godownId ? { godownId } : undefined,
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
 * Assigns stock to a godown (adds to existing). Used from Inventory page.
 */
export async function assignStockToGodown(productId: number, godownId: number, quantity: number, notes?: string) {
  try { await requireRole('ADMIN', 'MANAGER') } catch { return { success: false, error: 'Access denied' } }
  const { updateStock } = await import('./products')
  return updateStock({ id: productId, godownId, stock: quantity, mode: 'ADD', notes: notes || 'Stock assigned to godown' })
}

// ─── INTER-GODOWN TRANSFERS ──────────────────────────

export async function getTransfers() {
  await requireAuth()
  const transfers = await prisma.godownTransfer.findMany({
    orderBy: { date: 'desc' },
    include: {
      fromGodown: { select: { name: true } },
      toGodown: { select: { name: true } },
      items: { include: { product: { select: { name: true, sku: true } } } },
    },
  })
  return { success: true, data: transfers }
}

export async function createTransfer(data: unknown) {
  try { await requireRole('ADMIN', 'MANAGER') } catch { return { success: false, error: 'Access denied' } }
  const parsed = createTransferSchema.safeParse(data)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }

  const { fromGodownId, toGodownId, notes, items } = parsed.data
  const requestedBy = (await requireRole('ADMIN', 'MANAGER')).user.name
  if (fromGodownId === toGodownId) return { success: false, error: 'Source and destination godown cannot be the same' }

  try {
  const transfer = await inventoryTransaction(prisma, async tx => {
  await lockProducts(tx, items.map(item => item.productId))
  if (await tx.godown.count({ where: { id: { in: [fromGodownId, toGodownId] } } }) !== 2) throw new Error('Source or destination location not found')
  // Validate source stock inside the same transaction as the request.
  for (const item of items) {
    await prepareStock(tx, item.productId)
    const sourceStock = await tx.godownStock.findUnique({
      where: { productId_godownId: { productId: item.productId, godownId: fromGodownId } },
    })
    if (!sourceStock || sourceStock.quantity < item.quantity) {
      throw new Error(`Insufficient stock for ${item.name} in source godown (available: ${sourceStock?.quantity || 0}, requested: ${item.quantity})`)
    }
  }

  const displayId = `TRF-${crypto.randomUUID()}`
  return tx.godownTransfer.create({
    data: {
      displayId,
      fromGodownId,
      toGodownId,
      notes,
      requestedBy,
      items: {
        create: items.map(i => ({
          productId: i.productId,
          name: i.name,
          sku: i.sku,
          quantity: i.quantity,
        })),
      },
    },
  })
  })
  revalidatePath('/godowns')
  return { success: true, data: transfer }
  } catch (error) { return { success: false, error: inventoryError(error) } }
}

export async function completeTransfer(id: number, _approvedBy?: string) {
  let actor: string
  try { actor = (await requireRole('ADMIN', 'MANAGER')).user.name } catch { return { success: false, error: 'Access denied' } }

  try {
  await inventoryTransaction(prisma, tx => completeStockTransfer(tx, id, actor))

  revalidatePath('/godowns')
  revalidatePath('/inventory')
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
  const location = await defaultGodown(tx)
  const products = await tx.product.findMany({
    where: { stock: { gt: 0 } },
    select: { id: true, stock: true, name: true },
  })

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

  revalidatePath('/godowns')
  revalidatePath('/inventory')
  return { success: true, ...result }
  } catch (error) { return { success: false, error: inventoryError(error) } }
}
