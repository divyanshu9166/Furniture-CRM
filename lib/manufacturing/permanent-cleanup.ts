import type { Prisma } from '@prisma/client'
import { createHash } from 'node:crypto'
import { z } from 'zod'
import { lockBom } from './operations'
import { productionNumber } from './production-number'

export const permanentBomCleanupSchema = z.object({
  bomId: z.number().int().positive(),
  revision: z.string().regex(/^[a-f0-9]{64}$/, 'Refresh the cleanup preview'),
  confirmation: z.string().trim().min(1),
  reason: z.string().trim().min(3, 'Enter a cleanup reason').max(500),
  acknowledge: z.literal(true, { error: 'Confirm that this deletion is permanent and does not return stock' }),
}).strict()

async function loadPlan(tx: Prisma.TransactionClient, bomId: number) {
  // Same lock order as createProductionOrder: numbering, then BOM, then jobs.
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(742013)`
  await lockBom(tx, bomId)
  const bom = await tx.billOfMaterials.findUniqueOrThrow({ where: { id: bomId }, include: { items: { orderBy: { id: 'asc' } }, steps: { orderBy: { id: 'asc' } } } })
  const jobs = await tx.productionOrder.findMany({ where: { bomId }, include: { consumptions: { orderBy: { id: 'asc' } }, productionSteps: { orderBy: { id: 'asc' } }, customInventoryItems: { orderBy: { id: 'asc' } } }, orderBy: { id: 'asc' }, take: 201 })
  for (const job of jobs) await tx.$queryRaw`SELECT id FROM "ProductionOrder" WHERE id = ${job.id} FOR UPDATE`
  const jobIds = jobs.map(job => job.id)
  const consumptionIds = jobs.flatMap(job => job.consumptions.map(row => row.id))
  const [productionLedger, scrap] = await Promise.all([
    jobIds.length ? tx.stockLedger.findMany({ where: { referenceType: { in: ['Production', 'ProductionQC'] }, referenceId: { in: jobIds } }, orderBy: { id: 'asc' }, take: 1001 }) : [],
    jobIds.length ? tx.scrapInventory.findMany({ where: { OR: [{ productionOrderId: { in: jobIds } }, { materialConsumptionId: { in: consumptionIds } }] }, orderBy: { id: 'asc' }, take: 1001 }) : [],
  ])
  for (const row of scrap) await tx.$queryRaw`SELECT id FROM "ScrapInventory" WHERE id = ${row.id} FOR UPDATE`
  const scrapLedger = scrap.length ? await tx.stockLedger.findMany({ where: { referenceType: 'Scrap', referenceId: { in: scrap.map(row => row.id) } }, orderBy: { id: 'asc' }, take: 1001 }) : []
  const ledger = [...productionLedger, ...scrapLedger].sort((a, b) => a.id - b.id)
  const blockers: string[] = []
  if (jobs.length > 200 || ledger.length > 1000 || scrap.length > 1000) blockers.push('History is too large for this bounded cleanup; no records will be removed')
  for (const job of jobs) {
    if (job.status !== 'COMPLETED' || job.qualityStatus !== 'FAILED' || !job.archivedAt) blockers.push(`${job.displayId}: only archived, completed jobs with FAILED QC can be permanently removed`)
    if (job.customOrderId || job.customInventoryItems.length) blockers.push(`${job.displayId}: customer/custom-order links are protected`)
    const allowedProducts = new Set([job.finishedProductId, ...job.consumptions.map(row => row.rawMaterialId)])
    if (productionLedger.some(row => row.referenceId === job.id && !allowedProducts.has(row.productId))) blockers.push(`${job.displayId}: ledger references an unexpected product; review before cleanup`)
  }
  for (const row of scrap) {
    if ((row.productionOrderId !== null && !jobIds.includes(row.productionOrderId)) || (row.materialConsumptionId !== null && !consumptionIds.includes(row.materialConsumptionId))) blockers.push(`Scrap #${row.id}: cross-order references are protected`)
    if (!Number.isFinite(row.quantity) || row.quantity < 0 || (row.status === 'IN_STOCK' && row.quantity !== 0)) blockers.push(`Scrap #${row.id}: live or invalid scrap stock must be reviewed/disposed first`)
    if (!['IN_STOCK', 'USED', 'DISPOSED'].includes(row.status)) blockers.push(`Scrap #${row.id}: unknown scrap status; no cleanup allowed`)
    if (scrapLedger.some(entry => entry.referenceId === row.id && entry.productId !== row.rawMaterialId)) blockers.push(`Scrap #${row.id}: ledger product mismatch; review before cleanup`)
  }
  const counts = { orders: jobs.length, bomItems: bom.items.length, bomSteps: bom.steps.length, productionSteps: jobs.reduce((total, job) => total + job.productionSteps.length, 0), consumptions: consumptionIds.length, scrapHistory: scrap.length, retainedLedger: ledger.length, removedJobCosts: jobs.reduce((total, job) => total + job.totalCost, 0) }
  const revision = createHash('sha256').update(JSON.stringify({ bom, jobs, ledger, scrap })).digest('hex')
  return { bom, jobs, jobIds, ledger, scrap, counts, revision, blockers: [...new Set(blockers)] }
}

export async function previewPermanentBomCleanup(tx: Prisma.TransactionClient, bomId: number) {
  if (!Number.isSafeInteger(bomId) || bomId <= 0) throw new Error('Invalid BOM')
  const plan = await loadPlan(tx, bomId)
  return { bomId, bomName: plan.bom.name, confirmation: `DELETE BOM ${bomId}`, revision: plan.revision, counts: plan.counts, blockers: plan.blockers, orders: plan.jobs.map(job => ({ id: job.id, displayId: job.displayId, status: job.status, qualityStatus: job.qualityStatus, archived: !!job.archivedAt })) }
}

export async function permanentlyDeleteBomAndFailedJobs(tx: Prisma.TransactionClient, input: unknown, actor: string) {
  const data = permanentBomCleanupSchema.parse(input)
  const plan = await loadPlan(tx, data.bomId)
  if (data.confirmation !== `DELETE BOM ${data.bomId}`) throw new Error('Type the exact confirmation phrase shown in the preview')
  if (data.revision !== plan.revision) throw new Error('BOM or production history changed. Refresh the preview before deleting; no records were changed.')
  if (plan.blockers.length) throw new Error(plan.blockers.join(' · '))
  const maxOrderNumber = plan.jobs.reduce((maximum, job) => { const value = productionNumber(job.displayId); return value > maximum ? value : maximum }, BigInt(0))
  const audit = await tx.productionCleanupAudit.create({ data: { bomId: plan.bom.id, bomName: plan.bom.name, orderIds: plan.jobIds, orderNumbers: plan.jobs.map(job => job.displayId), maxOrderNumber, counts: plan.counts, reason: data.reason, deletedBy: actor } })
  // Preserve the ledger AND its batch allocations and balances. Replace only
  // the deleted-document reference with an explicit permanent-cleanup note.
  for (const row of plan.ledger) {
    const source = row.referenceType === 'Scrap' ? `Scrap #${row.referenceId}` : `${row.referenceType} ${plan.jobs.find(job => job.id === row.referenceId)!.displayId} (ID ${row.referenceId})`
    const changed = await tx.stockLedger.updateMany({ where: { id: row.id, referenceType: row.referenceType, referenceId: row.referenceId }, data: {
      referenceType: 'ProductionCleanup', referenceId: null,
      notes: [row.notes, `Permanent cleanup #${audit.id}: ${source}, BOM ${plan.bom.name} (ID ${plan.bom.id}); by ${actor}; reason: ${data.reason}. Recorded stock movement retained; no stock returned.`].filter(Boolean).join('\n'),
    } })
    if (changed.count !== 1) throw new Error('Ledger changed during cleanup; refresh and retry')
  }
  if (plan.scrap.length) {
    const removed = await tx.scrapInventory.deleteMany({ where: { id: { in: plan.scrap.map(row => row.id) } } })
    if (removed.count !== plan.scrap.length) throw new Error('Scrap history changed during cleanup')
  }
  if (plan.jobIds.length) {
    const consumed = await tx.materialConsumption.deleteMany({ where: { productionOrderId: { in: plan.jobIds } } })
    const steps = await tx.productionStep.deleteMany({ where: { productionOrderId: { in: plan.jobIds } } })
    if (consumed.count !== plan.counts.consumptions || steps.count !== plan.counts.productionSteps) throw new Error('Production history changed during cleanup')
    const deleted = await tx.productionOrder.deleteMany({ where: { id: { in: plan.jobIds }, bomId: plan.bom.id, status: 'COMPLETED', qualityStatus: 'FAILED', archivedAt: { not: null } } })
    if (deleted.count !== plan.jobIds.length) throw new Error('Production order changed during cleanup')
  }
  await tx.billOfMaterials.delete({ where: { id: plan.bom.id } })
  return { auditId: audit.id, bomName: plan.bom.name, orders: plan.jobs.map(job => job.displayId), counts: plan.counts }
}
