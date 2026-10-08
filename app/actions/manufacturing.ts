'use server'

import { prisma } from '@/lib/db'
import { revalidatePath } from 'next/cache'
import { unstable_noStore } from 'next/cache'
import { requireAuth, requireRole, requireManufacturingPermission } from '@/lib/auth-helpers'
import { inventoryError, inventoryTransaction, lockProducts, moveTotalStock, prepareStock } from '@/lib/inventory/stock'
import type { Prisma } from '@prisma/client'
import { canonicalInventoryCategory, isManualCategory } from '@/lib/inventory/category'
import { assertCompletionMembers, priorityRank, productionCost, usableOutput, weightedCost } from '@/lib/manufacturing/logic'
import { assertRawMaterialUnit, assertWorkCenters, changeStep, lockBom, lockedOrder, transitionOrder } from '@/lib/manufacturing/operations'
import { indiaDate } from '@/lib/inventory/batches'
import {
  createWorkCenterSchema,
  createBOMSchema,
  createProductionOrderSchema,
  completeProductionSchema,
  qualityCheckSchema,
  addBOMItemSchema,
  updateBOMItemSchema,
  addBOMStepSchema,
  updateBOMStepSchema,
  createBomTemplateSchema,
} from '@/lib/validations/manufacturing'

const roundQty = (value: number) => Math.round((value + Number.EPSILON) * 1000) / 1000
type ProductionStepTiming = {
  plannedMins?: number | null
  actualMins?: number | null
  labourRatePerHour?: number | null
  startedAt?: Date | null
  completedAt?: Date | null
}

async function requireAssignedStaffScope(staffId: number) {
  const session = await requireAuth()
  if (session.user.role === 'ADMIN' || session.user.role === 'MANAGER') return session
  if (session.user.staffId !== staffId) throw new Error('Forbidden')
  const staff = await prisma.staff.findUnique({ where: { id: staffId }, select: { status: true, user: { select: { isActive: true } } } })
  if (!staff || staff.status !== 'Active' || !staff.user?.isActive) throw new Error('Staff account is inactive')
  return session
}

function getActualStepMins(step: ProductionStepTiming) {
  if (step.actualMins !== null && step.actualMins !== undefined) return step.actualMins
  if (step.startedAt && step.completedAt) {
    return Math.max(0, Math.round((step.completedAt.getTime() - step.startedAt.getTime()) / 60000))
  }
  return 0
}

function calculateBomMetrics(bom: {
  items?: Array<{ quantity: number; wastagePercent?: number | null; unitCost?: number | null; rawMaterial?: { costPrice?: number | null } | null }>
  steps?: Array<{ durationMins?: number | null; labourRatePerHour?: number | null; machineCostPerUnit?: number | null }>
}, qty = 1) {
  const materialCost = (bom.items || []).reduce((sum, item) => {
    const unitCost = (item.unitCost || 0) > 0 ? item.unitCost || 0 : item.rawMaterial?.costPrice || 0
    const requiredQty = (item.quantity || 0) * (1 + (item.wastagePercent || 0) / 100) * qty
    return sum + requiredQty * unitCost
  }, 0)

  const standardMins = (bom.steps || []).reduce((sum, step) => sum + (step.durationMins || 0) * qty, 0)
  const labourCost = (bom.steps || []).reduce((sum, step) => {
    return sum + (((step.durationMins || 0) / 60) * (step.labourRatePerHour || 0) * qty)
  }, 0)
  const machineCost = (bom.steps || []).reduce((sum, step) => sum + (step.machineCostPerUnit || 0) * qty, 0)

  return {
    standardMins,
    standardHours: Math.round((standardMins / 60) * 10) / 10,
    standardMaterialCost: Math.round(materialCost),
    standardLabourCost: Math.round(labourCost),
    standardMachineCost: Math.round(machineCost),
    standardTotalCost: Math.round(materialCost + labourCost + machineCost),
  }
}

function decorateBOM<T extends {
  items?: Array<{ quantity: number; wastagePercent?: number | null; unitCost?: number | null; rawMaterial?: { costPrice?: number | null } | null }>
  steps?: Array<{ durationMins?: number | null; labourRatePerHour?: number | null; machineCostPerUnit?: number | null }>
}>(bom: T) {
  return { ...bom, ...calculateBomMetrics(bom, 1) }
}

async function adjustManufacturingStockWithTx(tx: Prisma.TransactionClient, productId: number, quantity: number, entryType: string, options?: import('@/lib/inventory/stock').MovementOptions) {
  const qty = roundQty(quantity)
  if (qty === 0) return
  return moveTotalStock(tx, productId, qty, entryType, options)
}

async function updateProductionTimeVarianceWithTx(tx: Prisma.TransactionClient, productionOrderId: number) {
  const order = await tx.productionOrder.findUnique({
    where: { id: productionOrderId },
    include: { productionSteps: true },
  })
  if (!order) return

  const steps = order.productionSteps as ProductionStepTiming[]
  const standardMins = order.standardMins || steps.reduce((sum, s) => sum + (s.plannedMins || 0), 0)
  const actualMins = steps.reduce((sum, s) => sum + getActualStepMins(s), 0)
  const labourVarianceMins = actualMins > 0 ? actualMins - standardMins : 0
  const labourVarianceCost = steps.reduce((sum, s) => {
    const extraMins = getActualStepMins(s) - (s.plannedMins || 0)
    return sum + (extraMins / 60) * (s.labourRatePerHour || 0)
  }, 0)

  await tx.productionOrder.update({
    where: { id: productionOrderId },
    data: {
      standardMins,
      actualMins,
      labourVarianceMins,
      labourVarianceCost: Math.round(labourVarianceCost),
    },
  })
}

// ─── WORK CENTERS ────────────────────────────────────

export async function getWorkCenters() {
  await requireAuth()
  const centers = await prisma.workCenter.findMany({
    orderBy: { name: 'asc' },
    include: {
      _count: { select: { productionOrders: true } },
    },
  })
  return { success: true, data: centers }
}

export async function createWorkCenter(data: unknown) {
  try {
  try { await requireManufacturingPermission('staffCreateWorkCenter') } catch { return { success: false, error: 'Access denied' } }
  const parsed = createWorkCenterSchema.safeParse(data)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }

  const existing = await prisma.workCenter.findFirst({ where: { name: parsed.data.name } })
  if (existing) return { success: false, error: 'Work center with this name already exists' }

  const center = await prisma.workCenter.create({ data: parsed.data })
  revalidatePath('/manufacturing')
  return { success: true, data: center }
  } catch (error) { return { success: false, error: inventoryError(error) } }
}

export async function updateWorkCenterStatus(id: number, status: string) {
  try {
  try { await requireRole('ADMIN', 'MANAGER') } catch { return { success: false, error: 'Access denied' } }
  if (!Number.isSafeInteger(id) || id <= 0 || !['Active', 'Maintenance', 'Inactive'].includes(status)) return { success: false, error: 'Invalid work center status' }
  await prisma.workCenter.update({ where: { id }, data: { status } })
  revalidatePath('/manufacturing')
  return { success: true }
  } catch (error) { return { success: false, error: inventoryError(error) } }
}

export async function deleteWorkCenter(id: number) {
  try {
  try { await requireRole('ADMIN', 'MANAGER') } catch { return { success: false, error: 'Access denied' } }
  const center = await prisma.workCenter.findUnique({ where: { id }, include: { _count: { select: { productionOrders: true } } } })
  if (!center) return { success: false, error: 'Not found' }
  if (center._count.productionOrders > 0) return { success: false, error: 'Cannot delete: work center has production orders' }
  await prisma.workCenter.delete({ where: { id } })
  revalidatePath('/manufacturing')
  return { success: true }
  } catch (error) { return { success: false, error: inventoryError(error) } }
}

// ─── BILL OF MATERIALS ───────────────────────────────

export async function getBOMs() {
  await requireAuth()
  const boms = await prisma.billOfMaterials.findMany({
    orderBy: { name: 'asc' },
    include: {
      finishedProduct: { select: { name: true, sku: true, price: true, costPrice: true, image: true } },
      items: {
        include: { rawMaterial: { select: { name: true, sku: true, stock: true, unitOfMeasure: true, costPrice: true, image: true, description: true } } },
      },
      steps: {
        include: { workCenter: { select: { name: true, type: true } } },
        orderBy: { stepNumber: 'asc' },
      },
      _count: { select: { productionOrders: true } },
    },
  })
  return { success: true, data: boms.map(decorateBOM) }
}

export async function createBOM(data: unknown) {
  try {
  try { await requireManufacturingPermission('staffCreateBom') } catch { return { success: false, error: 'Access denied' } }
  const parsed = createBOMSchema.safeParse(data)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }
  const bom = await inventoryTransaction(prisma, async tx => {
    const { items, steps, ...metadata } = parsed.data
    await lockProducts(tx, [metadata.finishedProductId, ...items.map(item => item.rawMaterialId)])
    const finished = await tx.product.findUnique({ where: { id: metadata.finishedProductId }, include: { category: true } })
    if (!finished || isManualCategory(finished.category.name)) throw new Error('Select a finished product')
    for (const item of items) await assertRawMaterialUnit(tx, item.rawMaterialId, item.unitOfMeasure)
    await assertWorkCenters(tx, (steps ?? []).map(step => step.workCenterId))
    return tx.billOfMaterials.create({ data: { ...metadata, items: { create: items }, steps: { create: steps ?? [] } }, include: { items: true, steps: true } })
  })
  revalidatePath('/manufacturing')
  return { success: true, data: bom }
  } catch (error) { return { success: false, error: inventoryError(error) } }
}

export async function toggleBOMStatus(id: number) {
  try {
  try { await requireRole('ADMIN', 'MANAGER') } catch { return { success: false, error: 'Access denied' } }
  await inventoryTransaction(prisma, async tx => {
    const bom = await lockBom(tx, id)
    await tx.billOfMaterials.update({ where: { id }, data: { isActive: !bom.isActive } })
  })
  revalidatePath('/manufacturing')
  return { success: true }
  } catch (error) { return { success: false, error: inventoryError(error) } }
}

export async function deleteBOM(id: number) {
  try {
  try { await requireRole('ADMIN', 'MANAGER') } catch { return { success: false, error: 'Access denied' } }
  await inventoryTransaction(prisma, async tx => {
    await lockBom(tx, id)
    if (await tx.productionOrder.count({ where: { bomId: id } })) throw new Error('Cannot delete BOM with production history')
    await tx.billOfMaterials.delete({ where: { id } })
  })
  revalidatePath('/manufacturing')
  return { success: true }
  } catch (error) { return { success: false, error: inventoryError(error) } }
}

export async function addBOMItem(data: unknown) {
  try {
  try { await requireRole('ADMIN', 'MANAGER') } catch { return { success: false, error: 'Access denied' } }
  const parsed = addBOMItemSchema.safeParse(data)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }
  const item = await inventoryTransaction(prisma, async tx => {
    await lockBom(tx, parsed.data.bomId)
    await assertRawMaterialUnit(tx, parsed.data.rawMaterialId, parsed.data.unitOfMeasure)
    if (await tx.bomItem.findFirst({ where: { bomId: parsed.data.bomId, rawMaterialId: parsed.data.rawMaterialId } })) throw new Error('This material is already in the BOM; edit its existing quantity')
    return tx.bomItem.create({ data: parsed.data, include: { rawMaterial: true } })
  })
  revalidatePath('/manufacturing')
  return { success: true, data: item }
  } catch (error) { return { success: false, error: inventoryError(error) } }
}

export async function updateBOMItem(data: unknown) {
  try {
  try { await requireRole('ADMIN', 'MANAGER') } catch { return { success: false, error: 'Access denied' } }
  const parsed = updateBOMItemSchema.safeParse(data)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }
  const item = await inventoryTransaction(prisma, async tx => {
    const { id, ...update } = parsed.data
    const old = await tx.bomItem.findUnique({ where: { id } })
    if (!old) throw new Error('BOM item not found')
    await lockBom(tx, old.bomId)
    await assertRawMaterialUnit(tx, old.rawMaterialId, update.unitOfMeasure ?? old.unitOfMeasure)
    return tx.bomItem.update({ where: { id }, data: update })
  })
  revalidatePath('/manufacturing')
  return { success: true, data: item }
  } catch (error) { return { success: false, error: inventoryError(error) } }
}

export async function removeBOMItem(id: number) {
  try {
  try { await requireRole('ADMIN', 'MANAGER') } catch { return { success: false, error: 'Access denied' } }
  await inventoryTransaction(prisma, async tx => {
    const old = await tx.bomItem.findUnique({ where: { id } })
    if (!old) throw new Error('BOM item not found')
    await lockBom(tx, old.bomId)
    if (await tx.bomItem.count({ where: { bomId: old.bomId } }) <= 1) throw new Error('A BOM must retain at least one material')
    await tx.bomItem.delete({ where: { id } })
  })
  revalidatePath('/manufacturing')
  return { success: true }
  } catch (error) { return { success: false, error: inventoryError(error) } }
}

export async function addBOMStep(data: unknown) {
  try {
  try { await requireRole('ADMIN', 'MANAGER') } catch { return { success: false, error: 'Access denied' } }
  const parsed = addBOMStepSchema.safeParse(data)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }
  const step = await inventoryTransaction(prisma, async tx => {
    await lockBom(tx, parsed.data.bomId)
    await assertWorkCenters(tx, [parsed.data.workCenterId])
    const last = await tx.bomStep.findFirst({ where: { bomId: parsed.data.bomId }, orderBy: { stepNumber: 'desc' } })
    return tx.bomStep.create({ data: { ...parsed.data, stepNumber: (last?.stepNumber ?? 0) + 1 }, include: { workCenter: true } })
  })
  revalidatePath('/manufacturing')
  return { success: true, data: step }
  } catch (error) { return { success: false, error: inventoryError(error) } }
}

export async function updateBOMStep(data: unknown) {
  try {
  try { await requireRole('ADMIN', 'MANAGER') } catch { return { success: false, error: 'Access denied' } }
  const parsed = updateBOMStepSchema.safeParse(data)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }
  const step = await inventoryTransaction(prisma, async tx => {
    const { id, ...update } = parsed.data
    const old = await tx.bomStep.findUnique({ where: { id } })
    if (!old) throw new Error('BOM step not found')
    await lockBom(tx, old.bomId)
    await assertWorkCenters(tx, [update.workCenterId])
    return tx.bomStep.update({ where: { id }, data: update, include: { workCenter: true } })
  })
  revalidatePath('/manufacturing')
  return { success: true, data: step }
  } catch (error) { return { success: false, error: inventoryError(error) } }
}

export async function removeBOMStep(id: number) {
  try {
  try { await requireRole('ADMIN', 'MANAGER') } catch { return { success: false, error: 'Access denied' } }
  await inventoryTransaction(prisma, async tx => {
    const old = await tx.bomStep.findUnique({ where: { id } })
    if (!old) throw new Error('BOM step not found')
    await lockBom(tx, old.bomId)
    await tx.bomStep.delete({ where: { id } })
    const remaining = await tx.bomStep.findMany({ where: { bomId: old.bomId }, orderBy: [{ stepNumber: 'asc' }, { id: 'asc' }] })
    for (let index = 0; index < remaining.length; index++) await tx.bomStep.update({ where: { id: remaining[index].id }, data: { stepNumber: index + 1 } })
  })
  revalidatePath('/manufacturing')
  return { success: true }
  } catch (error) { return { success: false, error: inventoryError(error) } }
}

export async function exportBOM(id: number) {
  await requireAuth()
  const bom = await prisma.billOfMaterials.findUnique({
    where: { id },
    include: {
      finishedProduct: { select: { name: true, sku: true, price: true } },
      items: {
        include: { rawMaterial: { select: { name: true, sku: true, unitOfMeasure: true, costPrice: true } } },
      },
      steps: {
        include: { workCenter: { select: { name: true } } },
        orderBy: { stepNumber: 'asc' },
      },
    },
  })
  if (!bom) return { success: false, error: 'BOM not found' }

  return { success: true, data: decorateBOM(bom) }
}

// ─── BOM TEMPLATES ───────────────────────────────────

export async function getBomTemplates() {
  await requireAuth()
  const templates = await prisma.bomTemplate.findMany({ orderBy: { name: 'asc' } })
  return { success: true, data: templates }
}

export async function createBomTemplate(data: unknown) {
  try {
  try { await requireRole('ADMIN', 'MANAGER') } catch { return { success: false, error: 'Access denied' } }
  const parsed = createBomTemplateSchema.safeParse(data)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }

  const existing = await prisma.bomTemplate.findFirst({ where: { name: parsed.data.name } })
  if (existing) return { success: false, error: 'Template with this name already exists' }

  const template = await prisma.bomTemplate.create({ data: parsed.data })
  revalidatePath('/manufacturing')
  return { success: true, data: template }
  } catch (error) { return { success: false, error: inventoryError(error) } }
}

export async function deleteBomTemplate(id: number) {
  try {
  try { await requireRole('ADMIN', 'MANAGER') } catch { return { success: false, error: 'Access denied' } }
  await prisma.bomTemplate.delete({ where: { id } })
  revalidatePath('/manufacturing')
  return { success: true }
  } catch (error) { return { success: false, error: inventoryError(error) } }
}

// ─── MRP ANALYSIS ────────────────────────────────────

export async function getMRPAnalysis(bomId: number, qty: number) {
  try { await requireManufacturingPermission('staffMrpPlanner') } catch { return { success: false, error: 'Access denied' } }
  if (!Number.isSafeInteger(bomId) || bomId <= 0 || !Number.isSafeInteger(qty) || qty <= 0) return { success: false, error: 'Select a BOM and positive whole production quantity' }
  const bom = await prisma.billOfMaterials.findUnique({
    where: { id: bomId },
    include: {
      items: {
        include: { rawMaterial: { select: { id: true, name: true, sku: true, stock: true, unitOfMeasure: true, costPrice: true } } },
      },
      steps: {
        include: { workCenter: { select: { name: true } } },
        orderBy: { stepNumber: 'asc' },
      },
      finishedProduct: { select: { name: true, price: true, costPrice: true } },
    },
  })
  if (!bom) return { success: false, error: 'BOM not found' }

  if (!bom.isActive || !bom.items.length) return { success: false, error: 'Select an active BOM with materials' }
  if (new Set(bom.items.map(item => item.rawMaterialId)).size !== bom.items.length) return { success: false, error: 'Legacy BOM has duplicate materials. Correct its lines before planning.' }
  if (bom.items.some(item => item.unitOfMeasure.toUpperCase() !== item.rawMaterial.unitOfMeasure.toUpperCase())) return { success: false, error: 'BOM units differ from stock base units. Correct the BOM before planning.' }
  const [commitments, lots] = await Promise.all([
    prisma.materialConsumption.groupBy({ by: ['rawMaterialId'], where: { rawMaterialId: { in: bom.items.map(item => item.rawMaterialId) }, productionOrder: { status: { in: ['PLANNED', 'IN_PROGRESS', 'ON_HOLD'] } } }, _sum: { plannedQty: true } }),
    prisma.productBatch.findMany({ where: { productId: { in: bom.items.map(item => item.rawMaterialId) }, remainingQty: { gt: 0 } } }),
  ])
  const today = indiaDate()
  const requirements = bom.items.map(item => {
    const effectiveUnitCost = item.unitCost > 0 ? item.unitCost : item.rawMaterial.costPrice
    const required = item.quantity * qty * (1 + item.wastagePercent / 100)
    const reserved = commitments.find(row => row.rawMaterialId === item.rawMaterialId)?._sum.plannedQty ?? 0
    const expired = lots.filter(lot => lot.productId === item.rawMaterialId && lot.expiryDate && lot.expiryDate.toISOString().slice(0, 10) < today).reduce((sum, lot) => sum + lot.remainingQty, 0)
    const available = Math.max(0, item.rawMaterial.stock - reserved - expired)
    const shortage = Math.max(0, required - available)
    return {
      materialId: item.rawMaterialId,
      materialName: item.rawMaterial.name,
      sku: item.rawMaterial.sku,
      unitOfMeasure: item.unitOfMeasure || item.rawMaterial.unitOfMeasure,
      required: Math.ceil(required * 100) / 100,
      available,
      physicalStock: item.rawMaterial.stock,
      committedToOtherJobs: reserved,
      expiredStock: expired,
      shortage: Math.ceil(shortage * 100) / 100,
      canProduce: shortage === 0,
      unitCost: effectiveUnitCost,
      estimatedCost: Math.round(required * effectiveUnitCost),
    }
  })

  // Labour cost from steps: sum of (durationMins/60 * labourRatePerHour) per unit * qty
  const stepCostings = bom.steps.map(s => {
    const labourCostPerUnit = (s.durationMins / 60) * s.labourRatePerHour
    const machineCostPerUnit = s.machineCostPerUnit
    return {
      stepNumber: s.stepNumber,
      operationName: s.operationName,
      workCenter: s.workCenter?.name ?? '—',
      durationMins: s.durationMins,
      labourRatePerHour: s.labourRatePerHour,
      machineCostPerUnit,
      labourCostPerUnit,
      totalLabourCost: Math.round(labourCostPerUnit * qty),
      totalMachineCost: Math.round(machineCostPerUnit * qty),
    }
  })

  const canProduceAll = requirements.every(r => r.canProduce)
  const totalMaterialCost = requirements.reduce((s, r) => s + r.estimatedCost, 0)
  const totalLabourCost = stepCostings.reduce((s, c) => s + c.totalLabourCost, 0)
  const totalMachineCost = stepCostings.reduce((s, c) => s + c.totalMachineCost, 0)
  const totalManufacturingCost = totalMaterialCost + totalLabourCost + totalMachineCost
  const totalStandardMins = bom.steps.reduce((s, step) => s + step.durationMins * qty, 0)
  const sellingPrice = (bom.finishedProduct.price || 0) * qty
  const estimatedProfit = sellingPrice - totalManufacturingCost

  return {
    success: true,
    data: {
      bomName: bom.name,
      finishedProduct: bom.finishedProduct.name,
      qty,
      planningOnly: true,
      requirements,
      stepCostings,
      canProduceAll,
      shortages: requirements.filter(r => !r.canProduce),
      totalMaterialCost,
      totalLabourCost,
      totalMachineCost,
      totalManufacturingCost,
      totalStandardMins,
      totalStandardHours: Math.round((totalStandardMins / 60) * 10) / 10,
      sellingPrice,
      estimatedProfit,
      estimatedMargin: sellingPrice > 0 ? Math.round((estimatedProfit / sellingPrice) * 100) : 0,
    },
  }
}

// ─── PRODUCTION ORDERS ───────────────────────────────

const PRIORITY_SORT = priorityRank

export async function getProductionOrders() {
  await requireAuth()
  unstable_noStore()
  const orders = await prisma.productionOrder.findMany({
    orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }],
    include: {
      bom: {
        select: {
          name: true,
          version: true,
          steps: { select: { stepNumber: true, durationMins: true, labourRatePerHour: true, machineCostPerUnit: true } },
        },
      },
      finishedProduct: { select: { name: true, sku: true, price: true } },
      customOrder: { select: { id: true, displayId: true, type: true, contact: { select: { name: true } } } },
      workCenter: { select: { name: true, type: true } },
      assignedStaff: { select: { name: true } },
      consumptions: {
        include: { rawMaterial: { select: { name: true, sku: true, unitOfMeasure: true } } },
      },
      scrapEntries: {
        include: { rawMaterial: { select: { name: true, sku: true, unitOfMeasure: true } } },
        orderBy: { createdAt: 'desc' },
      },
      customInventoryItems: true,
      productionSteps: {
        include: { workCenter: { select: { name: true } } },
        orderBy: { stepNumber: 'asc' },
      },
    },
  })
  return {
    success: true,
    data: orders
      .map(order => {
        const standardMins = order.standardMins || order.productionSteps.reduce((sum, step) => sum + (step.plannedMins || 0), 0)
        const actualMins = order.actualMins || order.productionSteps.reduce((sum, step) => sum + getActualStepMins(step), 0)
        const labourVarianceMins = actualMins > 0 ? actualMins - standardMins : order.labourVarianceMins
        return { ...order, standardMins, actualMins, labourVarianceMins }
      })
      // Sort: CRITICAL → HIGH → NORMAL, then by due date
      .sort((a, b) => {
        const pa = PRIORITY_SORT[a.priority] ?? 9
        const pb = PRIORITY_SORT[b.priority] ?? 9
        if (pa !== pb) return pa - pb
        if (a.dueDate && b.dueDate) return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()
        return 0
      }),
  }
}

export async function getAssignableStaff() {
  await requireAuth()
  const staff = await prisma.staff.findMany({
    where: { status: 'Active' },
    select: { id: true, name: true, role: true },
    orderBy: { name: 'asc' },
  })
  return { success: true, data: staff }
}

export async function getManufacturingCustomOrders() {
  await requireAuth()
  const orders = await prisma.customOrder.findMany({
    where: { status: { not: 'DELIVERED' } },
    select: {
      id: true,
      displayId: true,
      type: true,
      status: true,
      quotedPrice: true,
      contact: { select: { name: true } },
    },
    orderBy: { date: 'desc' },
  })
  return {
    success: true,
    data: orders.map(o => ({
      id: o.id,
      displayId: o.displayId,
      type: o.type,
      status: o.status,
      customerName: o.contact.name,
      quotedPrice: o.quotedPrice,
    })),
  }
}

export async function getScrapInventory() {
  await requireAuth()
  const entries = await prisma.scrapInventory.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      rawMaterial: { select: { name: true, sku: true, unitOfMeasure: true } },
      productionOrder: { select: { displayId: true, finishedProduct: { select: { name: true } } } },
    },
  })
  return { success: true, data: entries }
}

// Act on a scrap lot: either return reusable offcuts back to raw-material stock,
// or mark the lot as disposed/used. A scrap lot can only be actioned once (while
// IN_STOCK) so its quantity can never be returned to stock twice.
//   action 'REUSE'   → adds the scrap quantity back to the raw material's stock,
//                       flips status to USED (it has left the scrap pile).
//   action 'DISPOSE' → marks the lot WASTE/DISPOSED, no stock movement.
export async function updateScrapDisposition(scrapId: number, action: 'REUSE' | 'DISPOSE') {
  // Scrap disposition (returning stock / writing off waste) is a manager action,
  // not a toggleable staff permission.
  try { await requireRole('ADMIN', 'MANAGER') } catch { return { success: false, error: 'Access denied' } }

  const scrap = await prisma.scrapInventory.findUnique({ where: { id: scrapId } })
  if (!scrap) return { success: false, error: 'Scrap lot not found' }
  if (scrap.status !== 'IN_STOCK') {
    return { success: false, error: 'This scrap lot has already been actioned' }
  }

  try {
    await inventoryTransaction(prisma, async (tx) => {
      await tx.$queryRaw`SELECT id FROM "ScrapInventory" WHERE id = ${scrapId} FOR UPDATE`
      const current = await tx.scrapInventory.findUnique({ where: { id: scrapId } })
      if (!current || current.status !== 'IN_STOCK') throw new Error('This scrap lot has already been actioned')
      if (!['REUSE', 'DISPOSE'].includes(action)) throw new Error('Invalid scrap action')
      if (action === 'REUSE') {
        if (current.disposition !== 'REUSABLE') throw new Error('Only reusable scrap can be returned to usable stock')
        // Return the offcut quantity to the raw material's usable stock.
        await adjustManufacturingStockWithTx(tx, current.rawMaterialId, roundQty(current.quantity), 'RETURN', {
          referenceType: 'Scrap',
          referenceId: current.id,
          notes: `Reusable scrap returned to stock (lot #${scrap.id})`,
          createdBy: 'Manufacturing',
          batchCostPrice: current.unitCost,
        })
        await tx.scrapInventory.update({
          where: { id: scrapId },
          data: { status: 'USED', disposition: 'REUSABLE' },
        })
      } else {
        await tx.scrapInventory.update({
          where: { id: scrapId },
          data: { status: 'DISPOSED', disposition: 'WASTE' },
        })
      }
    })
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed to update scrap lot' }
  }

  revalidatePath('/manufacturing')
  revalidatePath('/inventory')
  revalidatePath('/godowns')
  return { success: true }
}

export async function getCustomOrderInventory() {
  try { await requireManufacturingPermission('staffCustomInventory') } catch { return { success: true, data: [] } }
  const entries = await prisma.customOrderInventory.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      customOrder: { select: { displayId: true, type: true, contact: { select: { name: true } } } },
      product: { select: { name: true, sku: true } },
      productionOrder: { select: { displayId: true } },
    },
  })
  return { success: true, data: entries }
}

export async function createProductionOrder(data: unknown) {
  let actor: string
  try { actor = (await requireManufacturingPermission('staffCreateProductionOrder')).user.name } catch { return { success: false, error: 'Access denied' } }
  const parsed = createProductionOrderSchema.safeParse(data)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }
  try {
    const order = await inventoryTransaction(prisma, async tx => {
      const { bomId, customOrderId, plannedQty, priority, dueDate, startDate, workCenterId, assignedStaffId, assignedTo, notes } = parsed.data
      // Serialize display-ID allocation, retaining the client's PRD-0001 format.
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(742013)`
      await tx.$queryRaw`SELECT id FROM "BillOfMaterials" WHERE id = ${bomId} FOR UPDATE`
      const bom = await tx.billOfMaterials.findUnique({ where: { id: bomId }, include: { finishedProduct: { include: { category: true } }, items: { include: { rawMaterial: { include: { category: true } } } }, steps: { orderBy: { stepNumber: 'asc' } } } })
      if (!bom?.isActive || !bom.items.length) throw new Error('Select an active BOM with materials')
      if (isManualCategory(bom.finishedProduct.category.name)) throw new Error('BOM output must be a finished product')
      if (new Set(bom.items.map(item => item.rawMaterialId)).size !== bom.items.length) throw new Error('Legacy BOM has duplicate materials; correct the BOM before production')
      for (const item of bom.items) {
        if (canonicalInventoryCategory(item.rawMaterial.category.name) !== 'Raw Material') throw new Error('BOM contains a non-raw-material item')
        if (item.unitOfMeasure.trim().toUpperCase() !== item.rawMaterial.unitOfMeasure.trim().toUpperCase()) throw new Error('BOM quantities must use the raw material base unit; implicit unit conversion is not supported')
      }
      await assertWorkCenters(tx, [workCenterId, ...bom.steps.map(step => step.workCenterId)])
      if (customOrderId) {
        await tx.$queryRaw`SELECT id FROM "CustomOrder" WHERE id = ${customOrderId} FOR UPDATE`
        const custom = await tx.customOrder.findUnique({ where: { id: customOrderId } })
        if (!custom || custom.status === 'DELIVERED') throw new Error('Custom order is missing or already delivered')
      }
      let assignee = assignedTo?.trim() || null
      if (assignedStaffId) {
        const staff = await tx.staff.findUnique({ where: { id: assignedStaffId }, select: { status: true, name: true } })
        if (!staff || staff.status !== 'Active') throw new Error('Select an active staff member')
        assignee = staff.name
      }
      const maximum = await tx.$queryRaw<{ maximum: bigint }[]>`SELECT COALESCE(MAX((substring("displayId" from '^PRD-([0-9]+)$'))::bigint), 0) AS maximum FROM "ProductionOrder"`
      const displayId = `PRD-${String(Number(maximum[0].maximum) + 1).padStart(4, '0')}`
      const created = await tx.productionOrder.create({ data: {
        displayId, bomId, finishedProductId: bom.finishedProductId, customOrderId: customOrderId ?? null, workCenterId: workCenterId ?? null,
        plannedQty, standardMins: bom.steps.reduce((sum, step) => sum + step.durationMins * plannedQty, 0), priority,
        dueDate: dueDate ? new Date(`${dueDate}T00:00:00.000Z`) : null, startDate: startDate ? new Date(`${startDate}T00:00:00.000Z`) : null,
        assignedStaffId: assignedStaffId ?? null, assignedTo: assignee, notes, createdBy: actor,
        consumptions: { create: bom.items.map(item => {
          const planned = roundQty(item.quantity * plannedQty * (1 + item.wastagePercent / 100))
          const cost = item.unitCost > 0 ? item.unitCost : item.rawMaterial.costPrice
          return { rawMaterialId: item.rawMaterialId, plannedQty: planned, unitCost: cost, totalCost: Math.round(planned * cost) }
        }) },
        productionSteps: { create: bom.steps.map(step => ({ stepNumber: step.stepNumber, operationName: step.operationName,
          workCenterId: step.workCenterId, plannedMins: step.durationMins * plannedQty, labourRatePerHour: step.labourRatePerHour,
          machineCostPerUnit: step.machineCostPerUnit, status: 'PENDING' })) },
      } })
      if (customOrderId) {
        await tx.customOrder.update({ where: { id: customOrderId }, data: { status: 'IN_PRODUCTION' } })
        await tx.customOrderTimeline.create({ data: { customOrderId, date: new Date(), event: `Production order ${displayId} created`, status: 'done', updatedBy: actor } })
      }
      return created
    })
    revalidatePath('/manufacturing'); revalidatePath('/custom-orders'); revalidatePath('/staff-portal')
    return { success: true, data: order }
  } catch (error) { return { success: false, error: inventoryError(error) } }
}

export async function startProduction(id: number) {
  try {
    await requireRole('ADMIN', 'MANAGER')
    await inventoryTransaction(prisma, tx => transitionOrder(tx, id, 'IN_PROGRESS'))
    revalidatePath('/manufacturing'); revalidatePath('/staff-portal')
    return { success: true }
  } catch (error) { return { success: false, error: inventoryError(error) } }
}

export async function holdProduction(id: number) {
  try {
    await requireRole('ADMIN', 'MANAGER')
    await inventoryTransaction(prisma, tx => transitionOrder(tx, id, 'ON_HOLD'))
    revalidatePath('/manufacturing'); revalidatePath('/staff-portal')
    return { success: true }
  } catch (error) { return { success: false, error: inventoryError(error) } }
}

export async function cancelProductionOrder(id: number, reason: string) {
  try { await requireRole('ADMIN', 'MANAGER') } catch { return { success: false, error: 'Access denied' } }
  if (typeof reason !== 'string' || !reason.trim() || reason.length > 2000) return { success: false, error: 'A cancellation reason is required (maximum 2000 characters)' }
  const order = await prisma.productionOrder.findUnique({
    where: { id },
    include: {
      consumptions: {
        select: { rawMaterialId: true, issuedQty: true, rawMaterial: { select: { name: true } } },
      },
    },
  })
  if (!order) return { success: false, error: 'Order not found' }
  if (order.status === 'COMPLETED') return { success: false, error: 'Cannot cancel a completed order' }

  try {
  await inventoryTransaction(prisma, async (tx) => {
    await tx.$queryRaw`SELECT id FROM "ProductionOrder" WHERE id = ${id} FOR UPDATE`
    const current = await tx.productionOrder.findUnique({ where: { id }, include: { consumptions: true } })
    if (!current || ['COMPLETED', 'CANCELLED'].includes(current.status)) throw new Error('Production order is already completed or cancelled')
    await lockProducts(tx, current.consumptions.map(c => c.rawMaterialId))
    // This module uses a backflush model: raw materials are deducted from stock
    // only at completion (see completeProduction), so a cancelled order normally
    // has issuedQty = 0 and nothing to return. This block is a safety net — if a
    // partial issue ever recorded issuedQty > 0, it is returned to stock on
    // cancellation. It intentionally no-ops in the common case.
    if ((current.status === 'IN_PROGRESS' || current.status === 'ON_HOLD') && current.consumptions.length > 0) {
      for (const c of current.consumptions) {
        const recorded = await tx.stockLedger.aggregate({ where: { productId: c.rawMaterialId, referenceType: 'Production', referenceId: id }, _sum: { quantity: true } })
        // Return only a physical issue documented in the ledger. An issuedQty
        // annotation alone is not proof that stock ever left inventory.
        const issued = Math.min(roundQty(c.issuedQty || 0), Math.max(0, -(recorded._sum.quantity ?? 0)))
        if (issued > 0) {
          await adjustManufacturingStockWithTx(tx, c.rawMaterialId, issued, 'RETURN', {
            referenceType: 'Production',
            referenceId: id,
            notes: `Material returned — order ${order.displayId} cancelled`,
            createdBy: 'Manufacturing',
            reverseBatches: true,
          })
        }
      }
    }

    await tx.productionOrder.update({
      where: { id },
      data: { status: 'CANCELLED', cancelReason: reason.trim(), cancelledDate: new Date() },
    })
  })

  revalidatePath('/manufacturing')
  revalidatePath('/inventory')
  revalidatePath('/godowns')
  return { success: true }
  } catch (error) { return { success: false, error: inventoryError(error) } }
}

export async function deleteProductionOrder(id: number) {
  try {
    await requireRole('ADMIN', 'MANAGER')
    await inventoryTransaction(prisma, async tx => {
      const order = await lockedOrder(tx, id)
      if (order.status !== 'PLANNED') throw new Error('Only an untouched planned order can be deleted. Cancel active jobs to preserve their history.')
      const recorded = await tx.stockLedger.count({ where: { referenceType: { in: ['Production', 'ProductionQC'] }, referenceId: id } })
      const steps = await tx.productionStep.count({ where: { productionOrderId: id, OR: [{ status: { not: 'PENDING' } }, { startedAt: { not: null } }] } })
      if (recorded || steps || order.actualQty > 0 || order.customOrderId) throw new Error('This order has operational history or a custom-order link; cancel it instead of deleting')
      await tx.productionOrder.delete({ where: { id } })
    })
    revalidatePath('/manufacturing'); revalidatePath('/staff-portal')
    return { success: true }
  } catch (error) { return { success: false, error: inventoryError(error) } }
}

export async function updateProductionStep(stepId: number, status: string, actualMins?: number, assignedWorker?: string) {
  try {
    await requireRole('ADMIN', 'MANAGER')
    await inventoryTransaction(prisma, async tx => {
      const result = await changeStep(tx, stepId, status, actualMins, assignedWorker)
      await updateProductionTimeVarianceWithTx(tx, result.orderId)
    })
    revalidatePath('/manufacturing'); revalidatePath('/staff-portal')
    return { success: true }
  } catch (error) { return { success: false, error: inventoryError(error) } }
}

export async function completeProduction(data: unknown) {
  try { await requireRole('ADMIN', 'MANAGER') } catch { return { success: false, error: 'Access denied' } }
  const parsed = completeProductionSchema.safeParse(data)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }

  const {
    productionOrderId,
    actualQty,
    totalLabourCost,
    overheadCost,
    machineCost,
    scrapQty,
    scrapReason,
    qualityStatus,
    qualityNotes,
    notes,
    consumptions,
    stepActuals,
  } = parsed.data

  try {
  await inventoryTransaction(prisma, async (tx) => {
    await tx.$queryRaw`SELECT id FROM "ProductionOrder" WHERE id = ${productionOrderId} FOR UPDATE`
    const order = await tx.productionOrder.findUnique({ where: { id: productionOrderId }, include: { consumptions: { include: { rawMaterial: { select: { unitOfMeasure: true } } } }, productionSteps: true } })
    if (!order || !['IN_PROGRESS', 'ON_HOLD'].includes(order.status)) throw new Error('Production order was already completed or its status changed')
    assertCompletionMembers(order.consumptions.map(item => item.rawMaterialId), consumptions.map(item => item.rawMaterialId), order.productionSteps.map(step => step.id), (stepActuals ?? []).map(step => step.stepId))
    await lockProducts(tx, [order.finishedProductId, ...consumptions.map(c => c.rawMaterialId)])
    let totalMaterialCost = 0

    for (const c of consumptions) {
      const planned = order.consumptions.find(oc => oc.rawMaterialId === c.rawMaterialId)
      const materialScrapQty = c.scrapQty || 0
      const issuedQty = roundQty(c.issuedQty || 0)  // Use issued instead of planned
      const actualQtyRounded = roundQty(c.actualQty || 0)
      const totalConsumedAndScrap = roundQty(actualQtyRounded + materialScrapQty)
      
      // Calculate returned: issued - actual - scrap
      const returnedQty = Math.max(0, roundQty(issuedQty - totalConsumedAndScrap))
      
      // Detect over-consumption: if actual + scrap > issued
      const isOverConsumed = totalConsumedAndScrap > issuedQty
      
      // Backflush: issued stock was never deducted earlier. Deduct only consumed
      // material and scrap; the reported unused return is already in inventory.
      const recorded = await tx.stockLedger.aggregate({ where: { productId: c.rawMaterialId, referenceType: 'Production', referenceId: productionOrderId }, _sum: { quantity: true } })
      const previouslyIssued = Math.max(0, -(recorded._sum.quantity ?? 0))
      const stockDelta = roundQty(previouslyIssued - totalConsumedAndScrap)
      
      // Cost calculation based on actual consumption + scrap
      const cost = planned ? Math.round(totalConsumedAndScrap * planned.unitCost) : 0
      totalMaterialCost += cost

      await adjustManufacturingStockWithTx(tx, c.rawMaterialId, stockDelta, stockDelta > 0 ? 'RETURN' : 'PRODUCTION', {
        referenceType: 'Production',
        referenceId: productionOrderId,
        notes: `Consumed for production ${order.displayId}`,
        createdBy: 'Manufacturing',
        reverseBatches: stockDelta > 0,
      })
      if (planned) {
        await tx.materialConsumption.update({
          where: { id: planned.id },
          data: {
            issuedQty,
            actualQty: actualQtyRounded,
            scrapQty: materialScrapQty,
            returnedQty,
            isOverConsumed,
            scrapReason: c.scrapReason,
            totalCost: cost,
          },
        })
        if (materialScrapQty > 0) {
          await tx.scrapInventory.create({
            data: {
              productionOrderId,
              rawMaterialId: c.rawMaterialId,
              materialConsumptionId: planned.id,
              quantity: materialScrapQty,
              unitOfMeasure: planned.rawMaterial?.unitOfMeasure || 'PCS',
              unitCost: planned.unitCost,
              estimatedValue: Math.round(materialScrapQty * planned.unitCost),
              reason: c.scrapReason || scrapReason,
              disposition: 'REUSABLE',
              status: 'IN_STOCK',
              notes: `Recorded from ${order.displayId}`,
            },
          })
        }
      }
    }


    const now = new Date()
    for (const step of order.productionSteps) {
      const supplied = stepActuals?.find(value => value.stepId === step.id)
      const minutes = supplied?.actualMins ?? (step.status === 'SKIPPED' ? 0 : step.status === 'DONE' ? step.actualMins :
        step.startedAt ? Math.max(0, Math.round((now.getTime() - step.startedAt.getTime()) / 60000)) : step.plannedMins)
      await tx.productionStep.update({ where: { id: step.id }, data: { actualMins: minutes,
        status: step.status === 'SKIPPED' ? 'SKIPPED' : 'DONE', completedAt: step.completedAt ?? now } })
    }
    await updateProductionTimeVarianceWithTx(tx, productionOrderId)
    const refreshedOrder = await tx.productionOrder.findUniqueOrThrow({ where: { id: productionOrderId }, include: { productionSteps: true } })
    const goodQty = usableOutput(actualQty, scrapQty, qualityStatus)
    const costs = productionCost({ material: totalMaterialCost, labour: totalLabourCost, machine: machineCost, overhead: overheadCost,
      actualQty, goodQty, plannedQty: order.plannedQty, steps: refreshedOrder.productionSteps })
    const roundedLabourCost = costs.labour
    const totalCost = costs.total
    const costPerUnit = costs.costPerUnit
    const yieldRate = costs.yieldRate
    const finishedBefore = !order.customOrderId ? await prepareStock(tx, order.finishedProductId) : null
    // Only add finished goods for passed/partial quality
    if (goodQty > 0) {
      if (order.customOrderId) {
        await tx.customOrderInventory.create({
          data: {
            customOrderId: order.customOrderId,
            productionOrderId,
            productId: order.finishedProductId,
            quantity: goodQty,
            status: 'READY',
            notes: `Finished from ${order.displayId}`,
          },
        })
      } else {
        await adjustManufacturingStockWithTx(tx, order.finishedProductId, goodQty, 'PRODUCTION', {
          referenceType: 'Production',
          referenceId: productionOrderId,
          notes: `Finished goods from ${order.displayId}`,
          createdBy: 'Manufacturing',
          batchCostPrice: costPerUnit,
        })
      }
    }

    if (goodQty > 0 && finishedBefore) {
      await tx.product.update({
        where: { id: order.finishedProductId },
        data: { costPrice: weightedCost(finishedBefore!.stock, finishedBefore!.costPrice, goodQty, costPerUnit) },
      })
    }

    if (order.customOrderId && goodQty > 0) {
      await tx.customOrderInventory.updateMany({
        where: { productionOrderId },
        data: { unitCost: costPerUnit, totalCost: costPerUnit * goodQty },
      })
    }

    await tx.productionOrder.update({
      where: { id: productionOrderId },
      data: {
        status: 'COMPLETED',
        actualQty,
        totalMaterialCost,
        totalLabourCost: roundedLabourCost,
        machineCost: costs.machine,      // stored as its own cost category
        overheadCost,                        // other expenses only (no longer folded)
        totalCost,
        costPerUnit,
        actualMins: refreshedOrder?.actualMins || 0,
        labourVarianceMins: refreshedOrder?.labourVarianceMins || 0,
        labourVarianceCost: refreshedOrder?.labourVarianceCost || 0,
        yieldRate,
        scrapQty,
        scrapReason,
        qualityStatus,
        qualityNotes,
        completedDate: new Date(),
        notes,
      },
    })

    if (order.customOrderId) {
      await tx.$queryRaw`SELECT id FROM "CustomOrder" WHERE id = ${order.customOrderId} FOR UPDATE`
      const custom = await tx.customOrder.findUniqueOrThrow({ where: { id: order.customOrderId } })
      if (custom.status === 'DELIVERED') throw new Error('Cannot complete production against a delivered custom order')
      const unfinished = await tx.productionOrder.count({ where: { customOrderId: order.customOrderId, id: { not: productionOrderId }, status: { in: ['PLANNED', 'IN_PROGRESS', 'ON_HOLD'] } } })
      await tx.customOrder.update({
        where: { id: order.customOrderId },
        data: { status: unfinished ? 'IN_PRODUCTION' : 'QUALITY_CHECK' }
      })

      await tx.customOrderTimeline.create({
        data: {
          customOrderId: order.customOrderId,
          date: new Date(),
          event: `Production completed (${order.displayId})`,
          status: 'done',
          updatedBy: 'Manager',
        },
      })
    }
  })

  revalidatePath('/manufacturing')
  revalidatePath('/inventory')
  revalidatePath('/godowns')
  revalidatePath('/custom-orders')
  return { success: true }
  } catch (error) { return { success: false, error: inventoryError(error) } }
}


export async function recordQualityCheck(data: unknown) {
  try { await requireRole('ADMIN', 'MANAGER') } catch { return { success: false, error: 'Access denied' } }
  const parsed = qualityCheckSchema.safeParse(data)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }
  try {
    await inventoryTransaction(prisma, async tx => {
      const { productionOrderId: id, qualityStatus, qualityNotes, scrapQty, scrapReason } = parsed.data
      const order = await lockedOrder(tx, id)
      if (order.status !== 'COMPLETED') throw new Error('Finalize output and QC in Complete Production first. Post-production QC is available only on completed jobs.')
      if (order.qualityStatus === 'PENDING') throw new Error('Legacy output has no recorded QC basis. Review its stock history before changing quantities.')
      const beforeGood = usableOutput(order.actualQty, order.scrapQty, order.qualityStatus)
      const afterGood = usableOutput(order.actualQty, scrapQty, qualityStatus)
      const delta = afterGood - beforeGood
      const unitCost = afterGood > 0 ? Math.round(order.totalCost / afterGood) : 0
      if (order.customOrderId) {
        await tx.$queryRaw`SELECT id FROM "CustomOrder" WHERE id = ${order.customOrderId} FOR UPDATE`
        const custom = await tx.customOrder.findUniqueOrThrow({ where: { id: order.customOrderId } })
        const rows = await tx.customOrderInventory.findMany({ where: { productionOrderId: id }, orderBy: { id: 'asc' } })
        if (delta && (custom.status === 'DELIVERED' || rows.some(row => row.status === 'DELIVERED'))) throw new Error('Delivered custom inventory cannot be changed by QC; use the returns workflow')
        if (delta < 0) {
          let remaining = -delta
          for (const row of rows.filter(row => row.status === 'READY')) {
            const removed = Math.min(remaining, row.quantity)
            await tx.customOrderInventory.update({ where: { id: row.id }, data: { quantity: row.quantity - removed, totalCost: (row.quantity - removed) * unitCost, unitCost } })
            remaining -= removed
          }
          if (remaining) throw new Error('Insufficient undelivered custom inventory for this QC correction')
        } else if (delta > 0) {
          await tx.customOrderInventory.create({ data: { customOrderId: order.customOrderId, productionOrderId: id, productId: order.finishedProductId, quantity: delta, status: 'READY', unitCost, totalCost: delta * unitCost, notes: 'QC released output' } })
        }
        const ready = await tx.customOrderInventory.findMany({ where: { productionOrderId: id, status: 'READY' } })
        for (const row of ready) await tx.customOrderInventory.update({ where: { id: row.id }, data: { unitCost, totalCost: row.quantity * unitCost } })
        await tx.customOrderTimeline.create({ data: { customOrderId: order.customOrderId, date: new Date(), event: `QC ${qualityStatus}: ${order.displayId}, usable output ${afterGood}`, status: 'done', updatedBy: 'Manager' } })
      } else if (delta) {
        const product = await prepareStock(tx, order.finishedProductId)
        const receipts = await tx.batchMovement.findMany({ where: { quantity: { gt: 0 }, stockLedger: { productId: order.finishedProductId, referenceType: { in: ['Production', 'ProductionQC'] }, referenceId: id } } })
        const batchIds = [...new Set(receipts.flatMap(row => row.batchId ? [row.batchId] : []))]
        if (delta < 0 && !batchIds.length) throw new Error('Legacy production has no lot allocation history; verify and reconcile stock rather than deducting unrelated inventory')
        await moveTotalStock(tx, order.finishedProductId, delta, 'ADJUSTMENT', { referenceType: 'ProductionQC', referenceId: id, notes: `QC ${qualityStatus}: usable output ${beforeGood} → ${afterGood}`, createdBy: 'Manager', batchCostPrice: unitCost, ...(delta < 0 ? { onlyBatchIds: batchIds } : {}) })
        const remainingLots = await tx.productBatch.findMany({ where: { id: { in: batchIds } } })
        const revalued = remainingLots.reduce((sum, lot) => sum + lot.remainingQty * (unitCost - lot.costPrice), 0)
        const updatedStock = product.stock + delta
        const value = product.stock * product.costPrice + (delta > 0 ? delta * unitCost : delta * order.costPerUnit) + revalued
        if (updatedStock > 0) await tx.product.update({ where: { id: product.id }, data: { costPrice: Math.max(0, Math.round(value / updatedStock)) } })
        if (batchIds.length) await tx.productBatch.updateMany({ where: { id: { in: batchIds }, remainingQty: { gt: 0 } }, data: { costPrice: unitCost } })
      }
      await tx.productionOrder.update({ where: { id }, data: { qualityStatus, qualityNotes, scrapQty, scrapReason, costPerUnit: unitCost, yieldRate: order.plannedQty ? Math.round(afterGood / order.plannedQty * 1000) / 10 : 0 } })
    })
    revalidatePath('/manufacturing'); revalidatePath('/inventory'); revalidatePath('/godowns'); revalidatePath('/custom-orders')
    return { success: true }
  } catch (error) { return { success: false, error: inventoryError(error) } }
}

// ─── ANALYTICS ───────────────────────────────────────

export async function getManufacturingStats() {
  await requireAuth()
  const [allOrders, workCenters, scrapEntries, customInventory] = await Promise.all([
    prisma.productionOrder.findMany({
      include: {
        finishedProduct: { select: { name: true } },
        consumptions: true,
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.workCenter.findMany(),
    prisma.scrapInventory.findMany(),
    prisma.customOrderInventory.findMany(),
  ])

  const completed = allOrders.filter(o => o.status === 'COMPLETED')
  const inProgress = allOrders.filter(o => o.status === 'IN_PROGRESS')
  const planned = allOrders.filter(o => o.status === 'PLANNED')

  // Yield rate average
  const avgYield = completed.length > 0
    ? Math.round(completed.reduce((s, o) => s + (o.yieldRate || 0), 0) / completed.length * 10) / 10
    : 0

  // Total production value
  const totalProduced = completed.reduce((s, o) => s + usableOutput(o.actualQty, o.scrapQty, o.qualityStatus), 0)
  const totalMaterialCost = completed.reduce((s, o) => s + (o.totalMaterialCost || 0), 0)
  const totalLabourCost = completed.reduce((s, o) => s + (o.totalLabourCost || 0), 0)
  const totalMachineCost = completed.reduce((s, o) => s + (o.machineCost || 0), 0)
  const totalOverhead = completed.reduce((s, o) => s + (o.overheadCost || 0), 0)
  const totalScrap = completed.reduce((s, o) => s + (o.scrapQty || 0), 0)
  const totalMaterialScrapQty = scrapEntries.reduce((s, e) => s + (e.quantity || 0), 0)
  const totalMaterialScrapValue = scrapEntries.reduce((s, e) => s + (e.estimatedValue || 0), 0)
  const totalTimeVarianceMins = completed.reduce((s, o) => s + (o.labourVarianceMins || 0), 0)
  const totalTimeVarianceCost = completed.reduce((s, o) => s + (o.labourVarianceCost || 0), 0)

  // Quality pass rate
  const qualityPassed = completed.filter(o => o.qualityStatus === 'PASSED').length
  const qualityRate = completed.length > 0 ? Math.round((qualityPassed / completed.length) * 100) : 0

  // Top produced products
  const productMap: Record<string, { name: string; qty: number; orders: number }> = {}
  completed.forEach(o => {
    const name = o.finishedProduct.name
    if (!productMap[name]) productMap[name] = { name, qty: 0, orders: 0 }
    productMap[name].qty += usableOutput(o.actualQty, o.scrapQty, o.qualityStatus)
    productMap[name].orders++
  })
  const topProducts = Object.values(productMap).sort((a, b) => b.qty - a.qty).slice(0, 5)

  // Monthly production trend (last 6 months)
  const sixMonthsAgo = new Date()
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5)
  sixMonthsAgo.setDate(1)
  const monthlyOrders = completed.filter(o => o.completedDate && o.completedDate >= sixMonthsAgo)
  const monthlyMap: Record<string, { qty: number; orders: number; cost: number }> = {}
  monthlyOrders.forEach(o => {
    const m = o.completedDate!.toISOString().slice(0, 7)
    if (!monthlyMap[m]) monthlyMap[m] = { qty: 0, orders: 0, cost: 0 }
    monthlyMap[m].qty += usableOutput(o.actualQty, o.scrapQty, o.qualityStatus)
    monthlyMap[m].orders++
    monthlyMap[m].cost += o.totalCost || 0
  })

  // Overdue production orders
  const now = new Date()
  const overdue = allOrders.filter(o =>
    o.dueDate && new Date(o.dueDate) < now &&
    o.status !== 'COMPLETED' && o.status !== 'CANCELLED'
  )

  return {
    success: true,
    data: {
      totals: {
        all: allOrders.length,
        planned: planned.length,
        inProgress: inProgress.length,
        completed: completed.length,
        overdue: overdue.length,
        totalProduced,
        totalScrap,
        totalMaterialScrapQty,
        totalMaterialScrapValue,
        totalCustomInventoryQty: customInventory.filter(item => item.status === 'READY').reduce((s, i) => s + (i.quantity || 0), 0),
        totalTimeVarianceMins,
        totalTimeVarianceCost,
        avgYield,
        qualityRate,
        totalMaterialCost,
        totalLabourCost,
        totalMachineCost,
        totalOverhead,
        totalCost: totalMaterialCost + totalLabourCost + totalMachineCost + totalOverhead,
      },
      topProducts,
      monthlyTrend: Object.entries(monthlyMap)
        .map(([month, data]) => ({ month, ...data }))
        .sort((a, b) => a.month.localeCompare(b.month)),
      workCenterUtilization: workCenters.map(wc => ({
        id: wc.id,
        name: wc.name,
        type: wc.type,
        status: wc.status,
        ordersCount: allOrders.filter(o => o.workCenterId === wc.id).length,
      })),
      overdueOrders: overdue.map(o => ({
        displayId: o.displayId,
        product: o.finishedProduct.name,
        dueDate: o.dueDate?.toISOString().split('T')[0],
        status: o.status,
        priority: o.priority,
      })),
    },
  }
}

// ─── Staff Portal: Production Orders ────────────────────

export async function getStaffProductionOrders(staffId: number) {
  try { await requireAssignedStaffScope(staffId) } catch { return { success: false, error: 'Forbidden', data: [] } }
  const orders = await prisma.productionOrder.findMany({
    where: { assignedStaffId: staffId },  // Only fetch orders assigned to THIS staff
    orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }],
    include: {
      bom: {
        select: {
          name: true,
          version: true,
          items: {
            include: {
              rawMaterial: { select: { name: true, sku: true, unitOfMeasure: true, stock: true } },
            },
          },
        },
      },
      finishedProduct: { select: { name: true, sku: true } },
      workCenter: { select: { name: true } },
      customOrder: {
        select: {
          displayId: true,
          type: true,
          contact: { select: { name: true } },
        },
      },
      productionSteps: {
        include: { workCenter: { select: { name: true } } },
        orderBy: { stepNumber: 'asc' },
      },
    },
  })

  // Normalize customOrder to expose customer name cleanly
  return {
    success: true,
    data: orders.map(o => ({
      ...o,
      customOrder: o.customOrder
        ? { ...o.customOrder, customer: o.customOrder.contact?.name || o.customOrder.displayId }
        : null,
    })),
  }
}

export async function staffUpdateProductionStep(staffId: number, stepId: number, status: string, notes?: string) {
  try {
    await requireAssignedStaffScope(staffId)
    if (!['PENDING', 'IN_PROGRESS', 'DONE'].includes(status) || (notes !== undefined && notes.length > 5000)) throw new Error('Invalid step update')
    await inventoryTransaction(prisma, async tx => {
      const result = await changeStep(tx, stepId, status, undefined, undefined, staffId, notes)
      await updateProductionTimeVarianceWithTx(tx, result.orderId)
    })
    revalidatePath('/staff-portal'); revalidatePath('/manufacturing')
    return { success: true }
  } catch (error) { return { success: false, error: inventoryError(error) } }
}

export async function staffAddStepNote(staffId: number, stepId: number, notes: string) {
  try {
    await requireAssignedStaffScope(staffId)
    if (!Number.isSafeInteger(stepId) || stepId <= 0 || typeof notes !== 'string' || !notes.trim() || notes.length > 5000) throw new Error('Invalid step note')
    await inventoryTransaction(prisma, async tx => {
      const step = await tx.productionStep.findUnique({ where: { id: stepId } })
      if (!step) throw new Error('Step not found')
      const order = await lockedOrder(tx, step.productionOrderId, staffId)
      if (!['PLANNED', 'IN_PROGRESS', 'ON_HOLD'].includes(order.status)) throw new Error('Terminal production history cannot be edited')
      await tx.productionStep.update({ where: { id: stepId }, data: { notes: notes.trim() } })
    })
    revalidatePath('/staff-portal'); revalidatePath('/manufacturing')
    return { success: true }
  } catch (error) { return { success: false, error: inventoryError(error) } }
}

export async function staffUpdateProductionProgress(staffId: number, orderId: number, actualQty: number, notes?: string) {
  try {
    await requireAssignedStaffScope(staffId)
    if (!Number.isSafeInteger(actualQty) || actualQty < 0 || (notes !== undefined && notes.length > 5000)) throw new Error('Quantity must be a non-negative whole unit')
    await inventoryTransaction(prisma, async tx => {
      const order = await lockedOrder(tx, orderId, staffId)
      if (order.status !== 'IN_PROGRESS' || actualQty > order.plannedQty) throw new Error('Order must be in progress; quantity cannot exceed planned output')
      await tx.productionOrder.update({ where: { id: orderId }, data: { actualQty, ...(notes !== undefined ? { notes } : {}) } })
    })
    revalidatePath('/staff-portal'); revalidatePath('/manufacturing')
    return { success: true }
  } catch (error) { return { success: false, error: inventoryError(error) } }
}

export async function staffStartProduction(staffId: number, orderId: number) {
  try {
    await requireAssignedStaffScope(staffId)
    await inventoryTransaction(prisma, tx => transitionOrder(tx, orderId, 'IN_PROGRESS', staffId))
    revalidatePath('/staff-portal'); revalidatePath('/manufacturing')
    return { success: true }
  } catch (error) { return { success: false, error: inventoryError(error) } }
}
