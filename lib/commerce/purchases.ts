import type { Prisma } from '@prisma/client'
import { assertId } from './documents'
import { assertPayment, assertReturn } from './rules'

export async function lockedPurchase(tx: Prisma.TransactionClient, id: number) {
  assertId(id)
  await tx.$queryRaw`SELECT id FROM "PurchaseOrder" WHERE id = ${id} FOR UPDATE`
  const po = await tx.purchaseOrder.findUnique({ where: { id }, include: { items: true, payments: true } })
  if (!po) throw new Error('Purchase order not found')
  return po
}

export async function payPurchase(tx: Prisma.TransactionClient, data: { id: number; amount: number; method: string; reference?: string; note?: string; paidAt: Date }) {
  const po = await lockedPurchase(tx, data.id)
  if (po.status === 'CANCELLED') throw new Error('Cannot pay a cancelled purchase order')
  assertPayment(data.amount, po.balanceDue)
  if (!['Cash', 'UPI', 'Card', 'EMI', 'Bank Transfer', 'Cheque'].includes(data.method)) throw new Error('Invalid payment method')
  const reference = data.reference?.trim() || null
  if (reference && po.payments.some(p => p.reference === reference && p.method === data.method)) throw new Error('This payment reference was already recorded')
  await tx.purchasePayment.create({ data: { poId: po.id, amount: data.amount, method: data.method, reference, notes: data.note, paidAt: data.paidAt } })
  return tx.purchaseOrder.update({ where: { id: po.id }, data: { amountPaid: po.amountPaid + data.amount, balanceDue: po.balanceDue - data.amount } })
}

export async function cancelPurchase(tx: Prisma.TransactionClient, id: number) {
  const po = await lockedPurchase(tx, id)
  if (!['DRAFT', 'APPROVED'].includes(po.status) || po.items.some(item => item.receivedQty > 0)) throw new Error('Only unreceived draft/approved orders may be cancelled')
  if (po.amountPaid || po.payments.length) throw new Error('Resolve supplier advances before cancelling; payment history must be preserved')
  return tx.purchaseOrder.update({ where: { id }, data: { status: 'CANCELLED', balanceDue: 0 } })
}

export async function validateLinkedReturn(tx: Prisma.TransactionClient, supplierId: number, poId: number, items: { productId: number; quantity: number; unitCost: number }[]) {
  const po = await lockedPurchase(tx, poId)
  if (po.supplierId !== supplierId) throw new Error('The selected supplier does not match the purchase order')
  if (!['RECEIVED', 'PARTIALLY_RECEIVED'].includes(po.status)) throw new Error('Only received purchases can be returned')
  const previous = await tx.purchaseReturn.findMany({ where: { poId }, include: { items: true } })
  for (const item of items) {
    const line = po.items.find(row => row.productId === item.productId)
    if (!line) throw new Error('Return item is not on the selected purchase order')
    const returned = previous.reduce((sum, ret) => sum + ret.items.filter(row => row.productId === item.productId).reduce((n, row) => n + row.quantity, 0), 0)
    assertReturn(line.receivedQty, returned, item.quantity)
    if (item.unitCost !== line.unitCost) throw new Error('Linked return unit cost must match the purchase receipt')
  }
}
