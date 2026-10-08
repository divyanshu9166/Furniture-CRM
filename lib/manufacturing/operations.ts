import type { Prisma } from '@prisma/client'
import { assertOrderTransition, stepTiming } from './logic'
import { canonicalInventoryCategory } from '../inventory/category'

export async function lockBom(tx: Prisma.TransactionClient, id: number) {
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error('Invalid BOM')
  await tx.$queryRaw`SELECT id FROM "BillOfMaterials" WHERE id = ${id} FOR UPDATE`
  const bom = await tx.billOfMaterials.findUnique({ where: { id } })
  if (!bom) throw new Error('BOM not found')
  return bom
}

export async function assertRawMaterialUnit(tx: Prisma.TransactionClient, id: number, unit: string) {
  const product = await tx.product.findUnique({ where: { id }, include: { category: true } })
  if (!product || canonicalInventoryCategory(product.category.name) !== 'Raw Material') throw new Error('BOM items must be raw materials')
  if (unit.trim().toUpperCase() !== product.unitOfMeasure.trim().toUpperCase()) throw new Error(`Use ${product.unitOfMeasure} for ${product.name}; implicit unit conversion is not supported`)
}

export async function lockedOrder(tx: Prisma.TransactionClient, id: number, staffId?: number) {
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error('Invalid production order')
  await tx.$queryRaw`SELECT id FROM "ProductionOrder" WHERE id = ${id} FOR UPDATE`
  const order = await tx.productionOrder.findUnique({ where: { id } })
  if (!order) throw new Error('Production order not found')
  if (staffId !== undefined && order.assignedStaffId !== staffId) throw new Error('You are not assigned to this order')
  return order
}

export async function transitionOrder(tx: Prisma.TransactionClient, id: number, target: string, staffId?: number) {
  const order = await lockedOrder(tx, id, staffId)
  if (staffId !== undefined && (order.status !== 'PLANNED' || target !== 'IN_PROGRESS')) throw new Error('Only your planned order can be started')
  assertOrderTransition(order.status, target)
  if (target === 'IN_PROGRESS') {
    const ids = [order.workCenterId, ...(await tx.productionStep.findMany({ where: { productionOrderId: id }, select: { workCenterId: true } })).map(step => step.workCenterId)].filter((id): id is number => id !== null)
    if (ids.length && await tx.workCenter.count({ where: { id: { in: ids }, status: { not: 'Active' } } })) throw new Error('An assigned work center is inactive or under maintenance')
  }
  return tx.productionOrder.update({ where: { id }, data: { status: target, ...(target === 'IN_PROGRESS' && order.status === 'PLANNED' ? { startDate: new Date() } : {}) } })
}

export async function changeStep(tx: Prisma.TransactionClient, id: number, status: string, actualMins?: number, assignedWorker?: string, staffId?: number, notes?: string) {
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error('Invalid production step')
  const initial = await tx.productionStep.findUnique({ where: { id } })
  if (!initial) throw new Error('Step not found')
  const order = await lockedOrder(tx, initial.productionOrderId, staffId)
  if (order.status !== 'IN_PROGRESS') throw new Error('Production order must be in progress to change a step')
  const current = await tx.productionStep.findUniqueOrThrow({ where: { id } })
  const updated = await tx.productionStep.update({ where: { id }, data: { ...stepTiming(current, status, actualMins), ...(assignedWorker !== undefined ? { assignedWorker } : {}), ...(notes !== undefined ? { notes } : {}) } })
  return { updated, orderId: order.id }
}

export async function assertWorkCenters(tx: Prisma.TransactionClient, ids: (number | undefined | null)[]) {
  const selected = [...new Set(ids.filter((id): id is number => id !== null && id !== undefined))]
  if (!selected.length) return
  const centers = await tx.workCenter.findMany({ where: { id: { in: selected } } })
  if (centers.length !== selected.length || centers.some(center => center.status !== 'Active')) throw new Error('Select active work centers only')
}
