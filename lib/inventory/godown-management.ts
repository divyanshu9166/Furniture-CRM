import type { Prisma } from '@prisma/client'
import { createBranchSchema, updateBranchSchema, createGodownSchema, updateGodownSchema, createTransferSchema } from '../validations/godown'
import { assertId } from '../commerce/documents'
import { lockProducts, prepareStock } from './stock'

type Tx = Prisma.TransactionClient
async function lockConfiguration(tx: Tx, kind: 'godowns' | 'branches') {
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`inventory-config:${kind}`}))`
}

export async function saveBranch(tx: Tx, input: unknown, id?: number) {
  if (id !== undefined) assertId(id)
  const data = id === undefined ? createBranchSchema.parse(input) : updateBranchSchema.parse(input)
  await lockConfiguration(tx, 'branches')
  if (id !== undefined && !await tx.branch.findUnique({ where: { id } })) throw new Error('Branch not found')
  if (data.isHeadOffice === true) await tx.branch.updateMany({ data: { isHeadOffice: false } })
  return id === undefined ? tx.branch.create({ data: data as Prisma.BranchCreateInput }) : tx.branch.update({ where: { id }, data })
}

export async function removeBranch(tx: Tx, id: number) {
  assertId(id); await lockConfiguration(tx, 'branches')
  await tx.$queryRaw`SELECT id FROM "Branch" WHERE id = ${id} FOR UPDATE`
  if (!await tx.branch.findUnique({ where: { id } })) throw new Error('Branch not found')
  if (await tx.godown.count({ where: { branchId: id } })) throw new Error('Cannot delete branch with godowns. Reassign or remove its godowns first.')
  await tx.branch.delete({ where: { id } })
}

export async function saveGodown(tx: Tx, input: unknown, id?: number) {
  if (id !== undefined) assertId(id)
  const data = id === undefined ? createGodownSchema.parse(input) : updateGodownSchema.parse(input)
  await lockConfiguration(tx, 'godowns')
  if (data.branchId && !await tx.branch.findUnique({ where: { id: data.branchId } })) throw new Error('Selected branch no longer exists. Refresh and retry.')
  if (id === undefined) {
    const isDefault = data.isDefault === true || await tx.godown.count() === 0
    if (isDefault) await tx.godown.updateMany({ data: { isDefault: false } })
    return tx.godown.create({ data: { ...data, isDefault } as Prisma.GodownUncheckedCreateInput })
  }
  const existing = await tx.godown.findUnique({ where: { id } })
  if (!existing) throw new Error('Location not found')
  if (existing.isDefault && data.isDefault === false) throw new Error('Select another default location before unsetting this default')
  if (data.isDefault === true && !existing.isDefault) await tx.godown.updateMany({ data: { isDefault: false } })
  return tx.godown.update({ where: { id }, data })
}

export async function chooseDefaultGodown(tx: Tx, id: number) {
  assertId(id); await lockConfiguration(tx, 'godowns')
  if (!await tx.godown.findUnique({ where: { id } })) throw new Error('Location not found')
  await tx.godown.updateMany({ data: { isDefault: false } })
  return tx.godown.update({ where: { id }, data: { isDefault: true } })
}

export function draftNeedsGodown(data: unknown, godownId: number) {
  const history = (data as { inventoryHistory?: { ledger?: { godownId: number }[] } } | null)?.inventoryHistory
  return Array.isArray(history?.ledger) && history.ledger.some(row => row?.godownId === godownId)
}

export async function removeGodown(tx: Tx, id: number, now = new Date()) {
  assertId(id); await lockConfiguration(tx, 'godowns')
  await tx.$queryRaw`SELECT id FROM "Godown" WHERE id = ${id} FOR UPDATE`
  const location = await tx.godown.findUnique({ where: { id }, include: { _count: { select: { ledgerEntries: true, transfersFrom: true, transfersTo: true, orders: true } } } })
  if (!location) throw new Error('Location not found')
  if (Object.values(location._count).some(count => count > 0)) throw new Error('Cannot delete a location with ledger, transfer or order history')
  if (location.isDefault && await tx.godown.count() > 1) throw new Error('Select another default location before deleting this one')
  const drafts = await tx.draft.findMany({ where: { sourceType: 'Product', expiresAt: { gte: now } }, select: { data: true } })
  if (drafts.some(draft => draftNeedsGodown(draft.data, id))) throw new Error('This godown is needed to restore product ledger history in Drafts. Restore or explicitly purge those drafts first.')
  const rows = await tx.godownStock.findMany({ where: { godownId: id }, include: { product: { select: { stock: true, name: true } } } })
  if (rows.some(row => !Number.isFinite(row.quantity) || row.quantity !== 0)) throw new Error('Cannot delete a godown with nonzero or invalid stock. Transfer/reconcile stock first.')
  await lockProducts(tx, rows.map(row => row.productId))
  for (const row of rows) {
    const total = await tx.godownStock.aggregate({ where: { productId: row.productId }, _sum: { quantity: true } })
    const physicalTotal = total._sum.quantity ?? 0
    if (!Number.isFinite(row.product.stock) || row.product.stock < 0 || !Number.isFinite(physicalTotal) || physicalTotal < 0 || Math.abs(physicalTotal - row.product.stock) > 0.000001) throw new Error(`Stock mismatch for ${row.product.name}; reconcile before removing its empty assignment`)
  }
  await tx.godownStock.deleteMany({ where: { godownId: id, quantity: 0 } })
  await tx.godown.delete({ where: { id } })
}

export async function requestStockTransfer(tx: Tx, input: unknown, actor: string) {
  const data = createTransferSchema.parse(input)
  await lockProducts(tx, data.items.map(item => item.productId))
  if (await tx.godown.count({ where: { id: { in: [data.fromGodownId, data.toGodownId] } } }) !== 2) throw new Error('Source or destination location not found')
  const items: { productId: number; name: string; sku: string; quantity: number }[] = []
  for (const item of data.items) {
    const product = await prepareStock(tx, item.productId)
    const stock = await tx.godownStock.findUnique({ where: { productId_godownId: { productId: item.productId, godownId: data.fromGodownId } } })
    if (!stock || stock.quantity < item.quantity) throw new Error(`Insufficient stock for ${product.name} in source godown (available: ${stock?.quantity ?? 0}, requested: ${item.quantity})`)
    items.push({ productId: product.id, name: product.name, sku: product.sku, quantity: item.quantity })
  }
  return tx.godownTransfer.create({ data: {
    displayId: `TRF-${crypto.randomUUID()}`, fromGodownId: data.fromGodownId, toGodownId: data.toGodownId,
    requestedBy: actor, notes: data.notes, items: { create: items },
  } })
}

export async function cancelPendingTransfer(tx: Tx, id: number) {
  assertId(id)
  await tx.$queryRaw`SELECT id FROM "GodownTransfer" WHERE id = ${id} FOR UPDATE`
  const transfer = await tx.godownTransfer.findUnique({ where: { id } })
  if (!transfer) throw new Error('Transfer not found')
  if (transfer.status === 'Cancelled') return transfer
  if (transfer.status !== 'Pending') throw new Error('Only a pending transfer can be cancelled; completed stock movements are preserved')
  return tx.godownTransfer.update({ where: { id }, data: { status: 'Cancelled' } })
}
