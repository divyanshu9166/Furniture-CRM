import type { Prisma, PrismaClient } from '@prisma/client'
import { recordBatchMovement } from './batches'

type Tx = Prisma.TransactionClient
export type MovementOptions = {
  referenceType?: string
  referenceId?: number
  notes?: string
  createdBy?: string
  reverseBatches?: boolean
  batchCostPrice?: number
  onlyBatchIds?: number[]
}

export function assertQuantity(value: number, allowNegative = false) {
  if (!Number.isFinite(value) || (!allowNegative && value < 0)) {
    throw new Error('Quantity must be a finite, non-negative number')
  }
}

// PostgreSQL serializable transactions also protect against writers outside this engine.
// Retry only database conflicts; validation failures are returned to the caller unchanged.
export async function inventoryTransaction<T>(db: PrismaClient, operation: (tx: Tx) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await db.$transaction(operation, { isolationLevel: 'Serializable', maxWait: 10000, timeout: 20000 })
    } catch (error) {
      if ((error as { code?: string }).code !== 'P2034' || attempt >= 2) throw error
    }
  }
}

export async function lockProducts(tx: Tx, ids: number[]) {
  for (const id of [...new Set(ids)].sort((a, b) => a - b)) {
    if (!Number.isSafeInteger(id) || id <= 0) throw new Error('Invalid product')
    await tx.$queryRaw`SELECT id FROM "Product" WHERE id = ${id} FOR UPDATE`
  }
}

export async function defaultGodown(tx: Tx) {
  // Choose deterministically; merely reading stock must not change the default setting.
  return await tx.godown.findFirst({ orderBy: [{ isDefault: 'desc' }, { id: 'asc' }] })
    ?? await tx.godown.create({ data: { name: 'Main Showroom', type: 'Showroom', isDefault: true } })
}

export async function syncStock(tx: Tx, productId: number) {
  const total = await tx.godownStock.aggregate({ where: { productId }, _sum: { quantity: true } })
  const stock = total._sum.quantity ?? 0
  assertQuantity(stock)
  await tx.product.update({ where: { id: productId }, data: { stock } })
  return stock
}

export async function prepareStock(tx: Tx, productId: number) {
  await lockProducts(tx, [productId])
  const product = await tx.product.findUnique({ where: { id: productId } })
  if (!product) throw new Error('Product not found')
  assertQuantity(product.stock)
  const locations = await tx.godownStock.findMany({ where: { productId } })
  if (locations.some(row => !Number.isFinite(row.quantity) || row.quantity < 0)) {
    throw new Error(`Invalid location stock for ${product.name}; review stock records before adjusting`)
  }
  if (!locations.length && product.stock > 0) {
    // Preserve a legacy opening balance instead of replacing it with a newly received quantity.
    const location = await defaultGodown(tx)
    await tx.godownStock.create({ data: { productId, godownId: location.id, quantity: product.stock } })
    await tx.stockLedger.create({ data: {
      productId, godownId: location.id, entryType: 'IN', quantity: product.stock,
      balanceAfter: product.stock, referenceType: 'Manual',
      notes: 'Opening balance: previously unallocated stock', createdBy: 'System',
    } })
  } else if (locations.length) {
    const total = locations.reduce((sum, row) => sum + row.quantity, 0)
    if (Math.abs(total - product.stock) > 0.000001) {
      throw new Error(`Stock mismatch for ${product.name}: product ${product.stock}, locations ${total}. Review and reconcile before adjusting; existing balances were preserved.`)
    }
  }
  return product
}

export async function moveStock(tx: Tx, productId: number, godownId: number, delta: number, entryType: string, options: MovementOptions = {}) {
  assertQuantity(delta, true)
  if (!Number.isSafeInteger(godownId) || godownId <= 0) throw new Error('Invalid location')
  const product = await prepareStock(tx, productId)
  const location = await tx.godown.findUnique({ where: { id: godownId } })
  if (!location) throw new Error('Selected location was not found')
  const key = { productId_godownId: { productId, godownId } }
  const existing = await tx.godownStock.findUnique({ where: key })
  const current = existing?.quantity ?? 0
  const next = current + delta
  assertQuantity(next, true)
  if (next < -0.000001) throw new Error(`Insufficient stock in ${location.name}: available ${current}, requested ${Math.abs(delta)}`)
  if (delta === 0) return { godownBalance: current, totalStock: await syncStock(tx, productId) }
  const balance = Math.max(0, next) // floating-point rounding only; never suppress an excessive deduction
  await tx.godownStock.upsert({ where: key, create: { productId, godownId, quantity: balance }, update: { quantity: balance } })
  const { reverseBatches, batchCostPrice, onlyBatchIds, ...ledgerOptions } = options
  const ledger = await tx.stockLedger.create({ data: { productId, godownId, entryType, quantity: delta, balanceAfter: balance, ...ledgerOptions } })
  await recordBatchMovement(tx, ledger, product.stock, batchCostPrice ?? product.costPrice ?? 0, reverseBatches, onlyBatchIds)
  const totalStock = await syncStock(tx, productId)
  if (delta > 0 && ['IN', 'RETURN', 'PRODUCTION'].includes(entryType)) {
    await tx.product.update({ where: { id: productId }, data: { lastRestocked: new Date() } })
  }
  return { godownBalance: balance, totalStock }
}

// Global changes (e.g. manufacturing/purchase return) use all locations for a deduction.
// Location-specific changes (inventory adjustment/sale/transfer) never take from another location.
export async function moveTotalStock(tx: Tx, productId: number, delta: number, entryType: string, options: MovementOptions = {}) {
  assertQuantity(delta, true)
  const product = await prepareStock(tx, productId)
  if (delta < 0 && product.stock + delta < -0.000001) throw new Error(`Insufficient stock for ${product.name}`)
  if (delta >= 0) {
    const location = await defaultGodown(tx)
    return moveStock(tx, productId, location.id, delta, entryType, options)
  }
  const rows = await tx.godownStock.findMany({ where: { productId, quantity: { gt: 0 } }, orderBy: { godownId: 'asc' } })
  let remaining = -delta
  for (const row of rows) {
    if (remaining <= 0.000001) break
    const issued = Math.min(row.quantity, remaining)
    await moveStock(tx, productId, row.godownId, -issued, entryType, options)
    remaining -= issued
  }
  if (remaining > 0.000001) throw new Error('Insufficient location stock')
  return { totalStock: await syncStock(tx, productId) }
}

export function inventoryError(error: unknown) {
  const code = (error as { code?: string })?.code
  if (code === 'P2034') return 'Stock changed concurrently. Please refresh and try again.'
  if (code === 'P2002') return 'This identifier already exists. Please use a unique value.'
  if (code === 'P2003') return 'This record is linked to other records or the selected reference no longer exists.'
  if (code === 'P2025') return 'Record not found. Refresh and try again.'
  return error instanceof Error && !code ? error.message : 'Unable to save inventory changes. Please try again.'
}

export async function reconcileStock(tx: Tx, productId: number, basis: 'PRODUCT' | 'LOCATIONS', expectedProduct: number, expectedLocations: number, actor: string) {
  assertQuantity(expectedProduct, true)
  assertQuantity(expectedLocations)
  await lockProducts(tx, [productId])
  const product = await tx.product.findUnique({ where: { id: productId } })
  if (!product) throw new Error('Product not found')
  if (basis === 'PRODUCT' && product.stock < 0) throw new Error('A negative product balance cannot be used; verify the location balances instead')
  const rows = await tx.godownStock.findMany({ where: { productId } })
  if (rows.some(row => row.quantity < 0 || !Number.isFinite(row.quantity))) throw new Error('Invalid location balances require individual review')
  const total = rows.reduce((sum, row) => sum + row.quantity, 0)
  if (Math.abs(product.stock - expectedProduct) > 0.000001 || Math.abs(total - expectedLocations) > 0.000001) {
    throw new Error('Balances changed. Refresh before reconciling.')
  }
  const location = await defaultGodown(tx)
  const locationQty = rows.find(row => row.godownId === location.id)?.quantity ?? 0
  const recordedStock = product.stock
  const notes = `Approved reconciliation (${basis}): product balance ${product.stock}, location total ${total}`
  await tx.stockLedger.create({ data: { productId, godownId: location.id, entryType: 'ADJUSTMENT', quantity: 0,
    balanceAfter: locationQty, referenceType: 'Manual', notes, createdBy: actor } })
  await tx.product.update({ where: { id: productId }, data: { stock: total } })
  if (basis === 'PRODUCT') await moveTotalStock(tx, productId, recordedStock - total, 'ADJUSTMENT', { referenceType: 'Manual', notes, createdBy: actor })
  return tx.product.findUniqueOrThrow({ where: { id: productId } })
}

export async function completeStockTransfer(tx: Tx, id: number, actor: string) {
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error('Invalid transfer')
  await tx.$queryRaw`SELECT id FROM "GodownTransfer" WHERE id = ${id} FOR UPDATE`
  const transfer = await tx.godownTransfer.findUnique({ where: { id }, include: { items: true } })
  if (!transfer) throw new Error('Transfer not found')
  if (transfer.status !== 'Pending') throw new Error('Only a pending transfer can be completed')
  if (transfer.fromGodownId === transfer.toGodownId || !transfer.items.length) throw new Error('Invalid transfer locations or items')
  await lockProducts(tx, transfer.items.map(item => item.productId))
  for (const item of transfer.items) {
    if (!Number.isInteger(item.quantity) || item.quantity <= 0) throw new Error('Invalid transfer quantity')
    const options = { referenceType: 'Transfer', referenceId: transfer.id, notes: `Transfer ${transfer.displayId}`, createdBy: actor }
    await moveStock(tx, item.productId, transfer.fromGodownId, -item.quantity, 'TRANSFER_OUT', options)
    await moveStock(tx, item.productId, transfer.toGodownId, item.quantity, 'TRANSFER_IN', options)
  }
  return tx.godownTransfer.update({ where: { id }, data: { status: 'Completed', approvedBy: actor } })
}
