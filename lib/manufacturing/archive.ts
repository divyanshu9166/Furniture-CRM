import type { Prisma } from '@prisma/client'
import { z } from 'zod'
import { lockedOrder } from './operations'
import { canArchiveFailedProductionOrder } from './archive-rules'

export const archiveFailedProductionSchema = z.object({
  id: z.number().int().positive(),
  confirmation: z.string().trim().min(1),
  reason: z.string().trim().min(1, 'Enter a reason for archiving').max(500),
}).strict()

// Visibility-only: never delete, reverse consumption, touch stock or detach BOMs.
export async function archiveFailedProductionOrder(tx: Prisma.TransactionClient, input: unknown, actor: string, now = new Date()) {
  const data = archiveFailedProductionSchema.parse(input)
  const order = await lockedOrder(tx, data.id, undefined, true)
  if (data.confirmation !== order.displayId) throw new Error('Enter the exact production order number to confirm')
  if (order.status !== 'COMPLETED' || order.qualityStatus !== 'FAILED') throw new Error('Only completed jobs with FAILED quality can be archived')
  if (order.archivedAt) return order // Repeated requests do not replace original archive metadata.
  if (!canArchiveFailedProductionOrder(order)) throw new Error('Order changed. Refresh before archiving')
  return tx.productionOrder.update({ where: { id: order.id }, data: { archivedAt: now, archivedBy: actor, archiveReason: data.reason } })
}

export async function restoreArchivedProductionOrder(tx: Prisma.TransactionClient, id: number) {
  const order = await lockedOrder(tx, id, undefined, true)
  if (!order.archivedAt) return order
  // Retain the last archive actor/reason as metadata; no job status/QC change.
  return tx.productionOrder.update({ where: { id }, data: { archivedAt: null } })
}
