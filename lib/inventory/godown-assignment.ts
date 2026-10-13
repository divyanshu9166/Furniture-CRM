import type { Prisma } from '@prisma/client'
import { z } from 'zod'
import { canonicalInventoryCategory } from './category'
import { lockProducts, moveStock, prepareStock } from './stock'

export const assignRawMaterialGodownSchema = z.object({
  productIds: z.array(z.number().int().positive()).min(1, 'Select raw materials').max(200, 'Assign up to 200 materials at a time'),
  godownId: z.number().int().positive('Choose a godown'),
})

// Reassign the current physical balance, never add a second copy of stock.
// All selected products move atomically; transfer entries leave global lots alone.
export async function assignRawMaterialsToGodown(tx: Prisma.TransactionClient, input: unknown, actor: string) {
  const { productIds, godownId } = assignRawMaterialGodownSchema.parse(input)
  const ids = [...new Set(productIds)].sort((a, b) => a - b)
  await lockProducts(tx, ids)
  const target = await tx.godown.findUnique({ where: { id: godownId } })
  if (!target) throw new Error('Selected godown no longer exists. Refresh and retry.')
  const results: { id: number; name: string; stock: number; moved: number }[] = []
  for (const productId of ids) {
    const product = await tx.product.findUnique({ where: { id: productId }, include: { category: true } })
    if (!product || canonicalInventoryCategory(product.category.name) !== 'Raw Material') throw new Error('One or more selected items are not raw materials. No assignments were changed.')
    const rows = await tx.godownStock.findMany({ where: { productId } })
    let moved = 0
    if (!rows.length && product.stock > 0 && Number.isFinite(product.stock)) {
      // Preserve a legacy unallocated balance, assign it directly to the chosen
      // godown, and record provenance without fabricating a second receipt lot.
      await tx.godownStock.create({ data: { productId, godownId, quantity: product.stock } })
      await tx.stockLedger.create({ data: { productId, godownId, entryType: 'IN', quantity: product.stock, balanceAfter: product.stock, referenceType: 'GodownAssignment', notes: 'Existing unallocated opening balance assigned to godown', createdBy: actor } })
      moved = product.stock
    } else {
      await prepareStock(tx, productId) // rejects invalid/mismatched balances
      for (const row of rows.filter(row => row.godownId !== godownId && row.quantity > 0)) {
        const quantity = row.quantity
        const options = { referenceType: 'GodownAssignment', notes: `Raw material reassigned to ${target.name}`, createdBy: actor }
        await moveStock(tx, productId, row.godownId, -quantity, 'TRANSFER_OUT', options)
        await moveStock(tx, productId, godownId, quantity, 'TRANSFER_IN', options)
        moved += quantity
      }
      if (product.stock === 0 && !rows.some(row => row.godownId === godownId)) {
        await tx.godownStock.create({ data: { productId, godownId, quantity: 0 } })
        await tx.stockLedger.create({ data: { productId, godownId, entryType: 'ADJUSTMENT', quantity: 0, balanceAfter: 0, referenceType: 'GodownAssignment', notes: 'Empty raw material assigned to godown', createdBy: actor } })
      }
    }
    await tx.godownStock.deleteMany({ where: { productId, godownId: { not: godownId }, quantity: 0 } })
    const after = await tx.product.findUniqueOrThrow({ where: { id: productId } })
    if (Math.abs(after.stock - product.stock) > 0.000001) throw new Error('Assignment would change total stock. No changes were saved.')
    results.push({ id: productId, name: product.name, stock: product.stock, moved })
  }
  return { godownId, godownName: target.name, assigned: results.length, items: results }
}
