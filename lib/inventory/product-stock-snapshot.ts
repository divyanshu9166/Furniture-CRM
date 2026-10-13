import type { Prisma } from '@prisma/client'
import { z } from 'zod'

export const productStockSnapshotSchema = z.object({
  version: z.literal(1),
  productStock: z.number().nonnegative(),
  locations: z.array(z.object({ godownId: z.number().int().positive(), quantity: z.number().nonnegative() })).max(10000),
}).superRefine((snapshot, context) => {
  if (new Set(snapshot.locations.map(row => row.godownId)).size !== snapshot.locations.length) context.addIssue({ code: 'custom', message: 'Duplicate stock locations' })
  const total = snapshot.locations.reduce((sum, row) => sum + row.quantity, 0)
  // Legacy unallocated stock stays unallocated; never invent a receiving location.
  if (snapshot.locations.length && (!Number.isFinite(total) || Math.abs(total - snapshot.productStock) > 0.000001)) context.addIssue({ code: 'custom', message: 'Product/location stock mismatch' })
})

export async function restoreProductStockSnapshot(tx: Prisma.TransactionClient, productId: number, saved: unknown, expectedStock?: number) {
  const parsed = productStockSnapshotSchema.safeParse(saved)
  if (!parsed.success) throw new Error('Invalid saved stock balances; draft was preserved')
  if (expectedStock !== undefined && parsed.data.productStock !== expectedStock) throw new Error('Saved product and stock snapshot disagree; draft was preserved')
  const product = await tx.product.findUnique({ where: { id: productId } })
  if (!product || product.stock !== 0 || (await tx.godownStock.findMany({ where: { productId } })).length) throw new Error('Stock snapshot can only be restored into a new empty product')
  const data = parsed.data
  const ids = data.locations.map(row => row.godownId)
  const locations = ids.length ? await tx.godown.findMany({ where: { id: { in: ids } }, select: { id: true } }) : []
  if (locations.length !== ids.length) throw new Error('A saved godown is missing; stock and draft were preserved. Restore that godown before restoring this material.')
  for (const row of data.locations) await tx.godownStock.create({ data: { productId, ...row } })
  await tx.product.update({ where: { id: productId }, data: { stock: data.productStock } })
  // Restore, not receipt: no new ledger entry, lot or unit-size multiplication.
}
