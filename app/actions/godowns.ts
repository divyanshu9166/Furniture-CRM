'use server'

import { prisma } from '@/lib/db'
import { revalidatePath } from 'next/cache'
import { requireRole } from '@/lib/auth-helpers'
import { createBranchSchema, createGodownSchema, createTransferSchema } from '@/lib/validations/godown'

// ─── CORE SYNC ENGINE ────────────────────────────────────
// All stock changes MUST go through adjustGodownStock → syncProductStockFromGodowns
// This ensures Product.stock always equals SUM(GodownStock.quantity)

/**
 * Recalculates Product.stock as SUM(GodownStock.quantity) for a given product.
 * Called after every godown stock change to keep the single source of truth.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function syncProductStockFromGodowns(productId: number, tx?: any) {
  const db = tx || prisma
  const result = await db.godownStock.aggregate({
    where: { productId },
    _sum: { quantity: true },
  })
  const totalStock = result._sum.quantity || 0
  await db.product.update({
    where: { id: productId },
    data: { stock: totalStock },
  })
  return totalStock
}

/**
 * Adjusts godown stock, creates a StockLedger entry, and syncs Product.stock.
 * This is the ONLY function that should modify godown stock quantities.
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
  return await prisma.$transaction(async (tx) => {
    // Upsert the godown stock
    const existing = await tx.godownStock.findUnique({
      where: { productId_godownId: { productId, godownId } },
    })

    const currentQty = existing?.quantity || 0
    const newQty = Math.max(0, currentQty + quantity) // never go below 0

    await tx.godownStock.upsert({
      where: { productId_godownId: { productId, godownId } },
      create: { productId, godownId, quantity: newQty },
      update: { quantity: newQty },
    })

    // Create ledger entry
    await tx.stockLedger.create({
      data: {
        productId,
        godownId,
        entryType,
        quantity,
        balanceAfter: newQty,
        referenceType: options?.referenceType,
        referenceId: options?.referenceId,
        notes: options?.notes,
        createdBy: options?.createdBy,
      },
    })

    // Sync product total stock
    const totalStock = await syncProductStockFromGodowns(productId, tx)

    return { godownBalance: newQty, totalStock }
  })
}

/**
 * Gets the default godown, creating one if none exists.
 */
export async function getOrCreateDefaultGodown() {
  let defaultGodown = await prisma.godown.findFirst({ where: { isDefault: true } })
  if (!defaultGodown) {
    // Try to find any godown and mark it as default
    defaultGodown = await prisma.godown.findFirst({ orderBy: { id: 'asc' } })
    if (defaultGodown) {
      defaultGodown = await prisma.godown.update({
        where: { id: defaultGodown.id },
        data: { isDefault: true },
      })
    } else {
      // Create a default godown
      defaultGodown = await prisma.godown.create({
        data: {
          name: 'Main Showroom',
          type: 'Showroom',
          isDefault: true,
        },
      })
    }
  }
  return defaultGodown
}

// ─── STOCK LEDGER ────────────────────────────────────────

export async function getStockLedger(filters?: { productId?: number; godownId?: number; limit?: number }) {
  const entries = await prisma.stockLedger.findMany({
    where: {
      ...(filters?.productId ? { productId: filters.productId } : {}),
      ...(filters?.godownId ? { godownId: filters.godownId } : {}),
    },
    include: {
      product: { select: { name: true, sku: true } },
      godown: { select: { name: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: filters?.limit || 100,
  })
  return { success: true, data: entries }
}

// ─── GODOWN STOCK SUMMARY ────────────────────────────────

export async function getGodownStockSummary() {
  const godowns = await prisma.godown.findMany({
    include: {
      branch: { select: { name: true } },
      stocks: {
        include: { product: { select: { name: true, sku: true, price: true, costPrice: true } } },
      },
      _count: { select: { stocks: true, ledgerEntries: true } },
    },
    orderBy: { name: 'asc' },
  })

  return {
    success: true,
    data: godowns.map(g => {
      const totalItems = g.stocks.reduce((s, st) => s + st.quantity, 0)
      const totalValue = g.stocks.reduce((s, st) => s + (st.quantity * (st.product?.price || 0)), 0)
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
  try { await requireRole('ADMIN') } catch { return { success: false, error: 'Admin access required' } }
  const parsed = createBranchSchema.safeParse(data)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }

  const branch = await prisma.branch.create({ data: parsed.data })
  revalidatePath('/godowns')
  return { success: true, data: branch }
}

export async function updateBranch(id: number, data: unknown) {
  try { await requireRole('ADMIN') } catch { return { success: false, error: 'Admin access required' } }
  const parsed = createBranchSchema.safeParse(data)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }

  const branch = await prisma.branch.update({ where: { id }, data: parsed.data })
  revalidatePath('/godowns')
  return { success: true, data: branch }
}

export async function deleteBranch(id: number) {
  try { await requireRole('ADMIN') } catch { return { success: false, error: 'Admin access required' } }
  const godownCount = await prisma.godown.count({ where: { branchId: id } })
  if (godownCount > 0) return { success: false, error: 'Cannot delete branch with godowns. Remove godowns first.' }
  await prisma.branch.delete({ where: { id } })
  revalidatePath('/godowns')
  return { success: true }
}

// ─── GODOWNS ─────────────────────────────────────────

export async function getGodowns() {
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

  // If this is the first godown, make it default
  const existingCount = await prisma.godown.count()
  const isDefault = parsed.data.isDefault || existingCount === 0

  // If marking as default, unset others
  if (isDefault) {
    await prisma.godown.updateMany({ data: { isDefault: false } })
  }

  const godown = await prisma.godown.create({
    data: { ...parsed.data, isDefault },
  })
  revalidatePath('/godowns')
  revalidatePath('/inventory')
  return { success: true, data: godown }
}

export async function updateGodown(id: number, data: unknown) {
  try { await requireRole('ADMIN', 'MANAGER') } catch { return { success: false, error: 'Access denied' } }
  const parsed = createGodownSchema.safeParse(data)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }

  if (parsed.data.isDefault) {
    await prisma.godown.updateMany({ data: { isDefault: false } })
  }

  const godown = await prisma.godown.update({ where: { id }, data: parsed.data })
  revalidatePath('/godowns')
  return { success: true, data: godown }
}

export async function deleteGodown(id: number) {
  try { await requireRole('ADMIN') } catch { return { success: false, error: 'Admin access required' } }
  const stockCount = await prisma.godownStock.count({ where: { godownId: id } })
  if (stockCount > 0) return { success: false, error: 'Cannot delete godown with stock. Transfer stock first.' }
  await prisma.godown.delete({ where: { id } })
  revalidatePath('/godowns')
  return { success: true }
}

export async function setDefaultGodown(id: number) {
  try { await requireRole('ADMIN', 'MANAGER') } catch { return { success: false, error: 'Access denied' } }
  await prisma.godown.updateMany({ data: { isDefault: false } })
  await prisma.godown.update({ where: { id }, data: { isDefault: true } })
  revalidatePath('/godowns')
  return { success: true }
}

// ─── GODOWN STOCK ─────────────────────────────────────

export async function getGodownStock(godownId?: number) {
  const stocks = await prisma.godownStock.findMany({
    where: godownId ? { godownId } : undefined,
    include: {
      product: { select: { name: true, sku: true, price: true, costPrice: true, category: { select: { name: true } } } },
      godown: { select: { name: true, type: true } },
    },
    orderBy: { product: { name: 'asc' } },
  })
  return { success: true, data: stocks }
}

export async function updateGodownStock(productId: number, godownId: number, quantity: number) {
  try { await requireRole('ADMIN', 'MANAGER') } catch { return { success: false, error: 'Access denied' } }

  const existing = await prisma.godownStock.findUnique({
    where: { productId_godownId: { productId, godownId } },
  })
  const currentQty = existing?.quantity || 0
  const diff = quantity - currentQty

  const result = await adjustGodownStock(productId, godownId, diff, 'ADJUSTMENT', {
    notes: `Stock set to ${quantity} (was ${currentQty})`,
    createdBy: 'Admin',
  })

  revalidatePath('/godowns')
  revalidatePath('/inventory')
  return { success: true, data: result }
}

/**
 * Assigns stock to a godown (adds to existing). Used from Inventory page.
 */
export async function assignStockToGodown(productId: number, godownId: number, quantity: number, notes?: string) {
  try { await requireRole('ADMIN', 'MANAGER') } catch { return { success: false, error: 'Access denied' } }
  if (quantity <= 0) return { success: false, error: 'Quantity must be positive' }

  const result = await adjustGodownStock(productId, godownId, quantity, 'IN', {
    referenceType: 'Manual',
    notes: notes || 'Stock assigned to godown',
    createdBy: 'Admin',
  })

  revalidatePath('/godowns')
  revalidatePath('/inventory')
  return { success: true, data: result }
}

// ─── INTER-GODOWN TRANSFERS ──────────────────────────

export async function getTransfers() {
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

  const { fromGodownId, toGodownId, notes, requestedBy, items } = parsed.data
  if (fromGodownId === toGodownId) return { success: false, error: 'Source and destination godown cannot be the same' }

  // Validate source stock
  for (const item of items) {
    const sourceStock = await prisma.godownStock.findUnique({
      where: { productId_godownId: { productId: item.productId, godownId: fromGodownId } },
    })
    if (!sourceStock || sourceStock.quantity < item.quantity) {
      return { success: false, error: `Insufficient stock for ${item.name} in source godown (available: ${sourceStock?.quantity || 0}, requested: ${item.quantity})` }
    }
  }

  const count = await prisma.godownTransfer.count()
  const displayId = `TRF-${String(count + 1).padStart(4, '0')}`

  const transfer = await prisma.godownTransfer.create({
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
  revalidatePath('/godowns')
  return { success: true, data: transfer }
}

export async function completeTransfer(id: number, approvedBy?: string) {
  try { await requireRole('ADMIN', 'MANAGER') } catch { return { success: false, error: 'Access denied' } }

  const transfer = await prisma.godownTransfer.findUnique({
    where: { id },
    include: { items: true },
  })
  if (!transfer) return { success: false, error: 'Transfer not found' }
  if (transfer.status === 'Completed') return { success: false, error: 'Already completed' }

  // Use the sync engine for each item
  for (const item of transfer.items) {
    // Deduct from source godown
    await adjustGodownStock(item.productId, transfer.fromGodownId, -item.quantity, 'TRANSFER_OUT', {
      referenceType: 'Transfer',
      referenceId: transfer.id,
      notes: `Transfer ${transfer.displayId}`,
      createdBy: approvedBy || 'Admin',
    })
    // Add to destination godown
    await adjustGodownStock(item.productId, transfer.toGodownId, item.quantity, 'TRANSFER_IN', {
      referenceType: 'Transfer',
      referenceId: transfer.id,
      notes: `Transfer ${transfer.displayId}`,
      createdBy: approvedBy || 'Admin',
    })
  }

  await prisma.godownTransfer.update({
    where: { id },
    data: { status: 'Completed', approvedBy },
  })

  revalidatePath('/godowns')
  revalidatePath('/inventory')
  return { success: true }
}

// ─── MIGRATION HELPER ────────────────────────────────

/**
 * One-time migration: Creates GodownStock entries from existing Product.stock values.
 * Ensures all products have their stock allocated in the default godown.
 */
export async function migrateExistingStockToGodowns() {
  try { await requireRole('ADMIN') } catch { return { success: false, error: 'Admin access required' } }

  const defaultGodown = await getOrCreateDefaultGodown()

  const products = await prisma.product.findMany({
    where: { stock: { gt: 0 } },
    select: { id: true, stock: true, name: true },
  })

  let migrated = 0
  for (const product of products) {
    const existingGodownStock = await prisma.godownStock.findFirst({
      where: { productId: product.id },
    })

    if (!existingGodownStock) {
      await adjustGodownStock(product.id, defaultGodown.id, product.stock, 'IN', {
        referenceType: 'Manual',
        notes: 'Migration: existing stock allocated to default godown',
        createdBy: 'System',
      })
      migrated++
    }
  }

  revalidatePath('/godowns')
  revalidatePath('/inventory')
  return { success: true, migrated, defaultGodownId: defaultGodown.id, defaultGodownName: defaultGodown.name }
}
