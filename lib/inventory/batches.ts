import type { Prisma } from '@prisma/client'

const EPSILON = 0.000001
type Lot = { id: number; remainingQty: number; quantity: number; purchaseDate: Date; expiryDate: Date | null; costPrice: number }
export function indiaDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now)
  return ['year', 'month', 'day'].map(type => parts.find(part => part.type === type)!.value).join('-')
}

export function planBatchIssue(lots: Lot[], physicalStock: number, requested: number, allowExpired = false, now = new Date(), onlyBatchIds?: number[]) {
  if (![physicalStock, requested].every(value => Number.isFinite(value) && value >= 0)) throw new Error('Invalid batch allocation quantity')
  if (lots.some(lot => !Number.isFinite(lot.remainingQty) || lot.remainingQty < 0 || lot.remainingQty > lot.quantity + EPSILON)) throw new Error('Invalid batch balance; review batch records')
  const tracked = lots.reduce((sum, lot) => sum + lot.remainingQty, 0)
  if (tracked > physicalStock + EPSILON) throw new Error('Combined batch balances exceed physical stock. Correct batch balances before issuing stock.')
  const today = indiaDate(now)
  // Expiring lots first, then undated receipts in FIFO order. ID breaks ties.
  const sorted = [...lots].filter(lot => (!onlyBatchIds || onlyBatchIds.includes(lot.id)) && (allowExpired || !lot.expiryDate || lot.expiryDate.toISOString().slice(0, 10) >= today))
    .sort((a, b) => (a.expiryDate?.getTime() ?? Infinity) - (b.expiryDate?.getTime() ?? Infinity) || a.purchaseDate.getTime() - b.purchaseDate.getTime() || a.id - b.id)
  const allocations: { batchId: number | null; quantity: number; costPrice: number | null }[] = []
  let remaining = requested
  for (const lot of sorted) {
    if (remaining <= EPSILON) break
    const quantity = Math.min(lot.remainingQty, remaining)
    if (quantity > 0) allocations.push({ batchId: lot.id, quantity, costPrice: lot.costPrice })
    remaining -= quantity
  }
  const untracked = onlyBatchIds ? 0 : Math.max(0, physicalStock - tracked)
  const quantity = Math.min(untracked, remaining)
  if (quantity > EPSILON) { allocations.push({ batchId: null, quantity, costPrice: null }); remaining -= quantity }
  if (remaining > EPSILON) throw new Error('Insufficient usable stock: expired lots are unavailable. Review batches or record a verified disposal/correction.')
  return allocations
}

export async function recordBatchMovement(tx: Prisma.TransactionClient, ledger: { id: number; productId: number; quantity: number; entryType: string; referenceType: string | null; referenceId: number | null }, physicalBefore: number, costPrice: number, reverse = false, onlyBatchIds?: number[]) {
  if (ledger.entryType.startsWith('TRANSFER_') || ledger.quantity === 0) return
  if (ledger.quantity < 0) {
    const lots = await tx.productBatch.findMany({ where: { productId: ledger.productId, remainingQty: { gt: 0 } } })
    const allowExpired = ledger.entryType === 'ADJUSTMENT' || ledger.referenceType === 'PurchaseReturn' || reverse
    const allocations = planBatchIssue(lots, physicalBefore, -ledger.quantity, allowExpired, new Date(), onlyBatchIds)
    for (const allocation of allocations) {
      if (allocation.batchId) await tx.productBatch.update({ where: { id: allocation.batchId }, data: { remainingQty: { decrement: allocation.quantity } } })
      await tx.batchMovement.create({ data: { stockLedgerId: ledger.id, batchId: allocation.batchId, quantity: -allocation.quantity } })
    }
    return
  }
  let remaining = ledger.quantity
  if (reverse && ledger.referenceType && ledger.referenceId) {
    // Net allocation history permits partial reversal, but never repeated lot
    // restoration beyond the amount physically deducted for this reference.
    const movements = await tx.batchMovement.findMany({ where: { stockLedger: { productId: ledger.productId, referenceType: ledger.referenceType, referenceId: ledger.referenceId } }, include: { batch: true }, orderBy: { id: 'asc' } })
    const net = new Map<number, number>()
    for (const movement of movements) if (movement.batchId) net.set(movement.batchId, (net.get(movement.batchId) ?? 0) + movement.quantity)
    for (const [batchId, balance] of net) {
      if (remaining <= EPSILON) break
      const lot = movements.find(movement => movement.batchId === batchId)?.batch
      if (!lot || balance >= 0) continue
      const quantity = Math.min(-balance, remaining, Math.max(0, lot.quantity - lot.remainingQty))
      if (quantity <= 0) continue
      await tx.productBatch.update({ where: { id: batchId }, data: { remainingQty: { increment: quantity } } })
      await tx.batchMovement.create({ data: { stockLedgerId: ledger.id, batchId, quantity } })
      remaining -= quantity
    }
    // Legacy/untracked returns remain explicitly untracked, with no invented age.
    if (remaining > EPSILON) await tx.batchMovement.create({ data: { stockLedgerId: ledger.id, quantity: remaining } })
    return
  }
  // A receipt lot is created in the same transaction as the physical balance.
  // Operators can rename its number/add supplier and expiry, not receive twice.
  const batch = await tx.productBatch.create({ data: { productId: ledger.productId, batchNumber: `AUTO-${ledger.id}`, quantity: remaining, remainingQty: remaining, costPrice: Math.round(costPrice), purchaseDate: new Date(`${indiaDate()}T00:00:00.000Z`) } })
  await tx.batchMovement.create({ data: { stockLedgerId: ledger.id, batchId: batch.id, quantity: remaining } })
}
