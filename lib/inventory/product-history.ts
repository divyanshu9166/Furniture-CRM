import type { Prisma } from '@prisma/client'
import { z } from 'zod'

type Tx = Prisma.TransactionClient
const id = z.number().int().positive()
const timestamp = z.string().datetime()
export const productHistorySchema = z.object({
  version: z.literal(1),
  ledger: z.array(z.object({ id, godownId: id, entryType: z.string().min(1), quantity: z.number(), balanceAfter: z.number(), referenceType: z.string().nullable(), referenceId: id.nullable(), notes: z.string().nullable(), createdBy: z.string().nullable(), createdAt: timestamp })).max(10000),
  batches: z.array(z.object({ id, batchNumber: z.string().min(1), purchaseDate: timestamp, expiryDate: timestamp.nullable(), quantity: z.number().nonnegative(), remainingQty: z.literal(0), costPrice: z.number().int().nonnegative(), supplierId: id.nullable(), poId: id.nullable(), createdAt: timestamp })).max(10000),
  movements: z.array(z.object({ id, batchId: id.nullable(), stockLedgerId: id, quantity: z.number(), createdAt: timestamp })).max(20000),
}).superRefine((data, context) => {
  for (const key of ['ledger', 'batches', 'movements'] as const) if (new Set(data[key].map(row => row.id)).size !== data[key].length) context.addIssue({ code: 'custom', message: 'Duplicate history IDs' })
  const ledgerIds = new Set(data.ledger.map(row => row.id)); const batchIds = new Set(data.batches.map(row => row.id))
  if (data.movements.some(row => !ledgerIds.has(row.stockLedgerId) || (row.batchId !== null && !batchIds.has(row.batchId)))) context.addIssue({ code: 'custom', message: 'Invalid history references' })
})

export async function snapshotProductHistory(tx: Tx, productId: number) {
  const [ledger, batches, movements] = await Promise.all([
    tx.stockLedger.findMany({ where: { productId }, orderBy: { id: 'asc' }, take: 10001 }),
    tx.productBatch.findMany({ where: { productId }, orderBy: { id: 'asc' }, take: 10001 }),
    tx.batchMovement.findMany({ where: { OR: [{ stockLedger: { productId } }, { batch: { productId } }] }, include: { stockLedger: { select: { productId: true } }, batch: { select: { productId: true } } }, orderBy: { id: 'asc' }, take: 20001 }),
  ])
  if (batches.some(row => row.remainingQty !== 0)) throw new Error('Cannot delete: batch stock remains. Reconcile batch and physical stock before deleting.')
  if (movements.some(row => row.stockLedger.productId !== productId || (row.batch && row.batch.productId !== productId))) throw new Error('Cannot delete: batch allocations cross product boundaries; linked records were preserved.')
  // Empty invoice/production tables do not block orphaned old ledger history.
  // Only LIVE document references are protected, including items whose FK was
  // previously lost. Keep unknown reference types protected rather than guess.
  const documentChecks: Record<string, (referenceId: number) => Promise<number>> = {
    Invoice: referenceId => tx.invoice.count({ where: { id: referenceId } }),
    Order: referenceId => tx.order.count({ where: { id: referenceId } }),
    Purchase: referenceId => tx.purchaseOrder.count({ where: { id: referenceId } }),
    PurchaseOrder: referenceId => tx.purchaseOrder.count({ where: { id: referenceId } }),
    PurchaseReturn: referenceId => tx.purchaseReturn.count({ where: { id: referenceId } }),
    Production: referenceId => tx.productionOrder.count({ where: { id: referenceId } }),
    Transfer: referenceId => tx.godownTransfer.count({ where: { id: referenceId } }),
    CustomOrder: referenceId => tx.customOrder.count({ where: { id: referenceId } }),
  }
  const references = new Map(ledger.filter(row => row.referenceId !== null && row.referenceType !== null && !['Manual', 'GodownAssignment'].includes(row.referenceType)).map(row => [`${row.referenceType}:${row.referenceId}`, row]))
  for (const row of references.values()) {
    const check = documentChecks[row.referenceType!]
    if (!check || await check(row.referenceId!) > 0) throw new Error('Cannot delete: ledger is linked to a live business document or an unknown reference. Linked records were preserved.')
  }
  const history = productHistorySchema.safeParse({
    version: 1,
    ledger: ledger.map(({ productId: _product, createdAt, ...row }) => ({ ...row, createdAt: createdAt.toISOString() })),
    batches: batches.map(({ productId: _product, purchaseDate, expiryDate, createdAt, ...row }) => ({ ...row, purchaseDate: purchaseDate.toISOString(), expiryDate: expiryDate?.toISOString() ?? null, createdAt: createdAt.toISOString() })),
    movements: movements.map(({ id, batchId, stockLedgerId, quantity, createdAt }) => ({ id, batchId, stockLedgerId, quantity, createdAt: createdAt.toISOString() })),
  })
  if (!history.success) throw new Error('Cannot delete: inventory history is invalid or too large for safe recovery. No records were changed.')
  return history.data
}

export async function removeProductHistory(tx: Tx, productId: number) {
  await tx.batchMovement.deleteMany({ where: { stockLedger: { productId } } })
  await tx.productBatch.deleteMany({ where: { productId } })
  await tx.stockLedger.deleteMany({ where: { productId } })
}

export async function restoreProductHistory(tx: Tx, productId: number, saved: unknown) {
  if (saved === undefined) return // older Product drafts have no history payload
  const parsed = productHistorySchema.safeParse(saved)
  if (!parsed.success) throw new Error('Invalid inventory history snapshot; draft was preserved')
  const data = parsed.data
  if (!data.ledger.length && !data.batches.length && !data.movements.length) return
  const requiredLocations = [...new Set(data.ledger.map(row => row.godownId))]
  const locations = await tx.godown.findMany({ where: { id: { in: requiredLocations } }, select: { id: true } })
  if (locations.length !== requiredLocations.length) throw new Error('A godown referenced by saved ledger history is missing. Restore that godown before restoring this draft.')
  const ledgerMap = new Map<number, number>(); const batchMap = new Map<number, number>()
  for (const { id: originalId, createdAt, ...row } of data.ledger) {
    const restored = await tx.stockLedger.create({ data: { ...row, productId, createdAt: new Date(createdAt) } })
    ledgerMap.set(originalId, restored.id)
  }
  for (const { id: originalId, createdAt, purchaseDate, expiryDate, ...row } of data.batches) {
    const restored = await tx.productBatch.create({ data: { ...row, productId, createdAt: new Date(createdAt), purchaseDate: new Date(purchaseDate), expiryDate: expiryDate ? new Date(expiryDate) : null } })
    batchMap.set(originalId, restored.id)
  }
  for (const row of data.movements) await tx.batchMovement.create({ data: {
    stockLedgerId: ledgerMap.get(row.stockLedgerId)!, batchId: row.batchId === null ? null : batchMap.get(row.batchId)!, quantity: row.quantity, createdAt: new Date(row.createdAt),
  } })
}
