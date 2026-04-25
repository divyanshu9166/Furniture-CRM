'use server'

import { prisma } from '@/lib/db'
import { revalidatePath } from 'next/cache'
import { unstable_noStore } from 'next/cache'
import { requireRole } from '@/lib/auth-helpers'
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

// ─── WORK CENTERS ────────────────────────────────────

export async function getWorkCenters() {
  const centers = await prisma.workCenter.findMany({
    orderBy: { name: 'asc' },
    include: {
      _count: { select: { productionOrders: true } },
    },
  })
  return { success: true, data: centers }
}

export async function createWorkCenter(data: unknown) {
  try { await requireRole('ADMIN', 'MANAGER') } catch { return { success: false, error: 'Access denied' } }
  const parsed = createWorkCenterSchema.safeParse(data)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }

  const existing = await prisma.workCenter.findFirst({ where: { name: parsed.data.name } })
  if (existing) return { success: false, error: 'Work center with this name already exists' }

  const center = await prisma.workCenter.create({ data: parsed.data })
  revalidatePath('/manufacturing')
  return { success: true, data: center }
}

export async function updateWorkCenterStatus(id: number, status: string) {
  try { await requireRole('ADMIN', 'MANAGER') } catch { return { success: false, error: 'Access denied' } }
  await prisma.workCenter.update({ where: { id }, data: { status } })
  revalidatePath('/manufacturing')
  return { success: true }
}

export async function deleteWorkCenter(id: number) {
  try { await requireRole('ADMIN', 'MANAGER') } catch { return { success: false, error: 'Access denied' } }
  const center = await prisma.workCenter.findUnique({ where: { id }, include: { _count: { select: { productionOrders: true } } } })
  if (!center) return { success: false, error: 'Not found' }
  if (center._count.productionOrders > 0) return { success: false, error: 'Cannot delete: work center has production orders' }
  await prisma.workCenter.delete({ where: { id } })
  revalidatePath('/manufacturing')
  return { success: true }
}

// ─── BILL OF MATERIALS ───────────────────────────────

export async function getBOMs() {
  const boms = await prisma.billOfMaterials.findMany({
    orderBy: { name: 'asc' },
    include: {
      finishedProduct: { select: { name: true, sku: true, price: true, costPrice: true } },
      items: {
        include: { rawMaterial: { select: { name: true, sku: true, stock: true, unitOfMeasure: true, costPrice: true } } },
      },
      steps: {
        include: { workCenter: { select: { name: true, type: true } } },
        orderBy: { stepNumber: 'asc' },
      },
      _count: { select: { productionOrders: true } },
    },
  })
  return { success: true, data: boms }
}

export async function createBOM(data: unknown) {
  try { await requireRole('ADMIN', 'MANAGER') } catch { return { success: false, error: 'Access denied' } }
  const parsed = createBOMSchema.safeParse(data)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }

  const { name, finishedProductId, version, estimatedDays, notes, items, steps } = parsed.data

  const bom = await prisma.billOfMaterials.create({
    data: {
      name,
      finishedProductId,
      version,
      estimatedDays,
      notes,
      items: {
        create: items.map(i => ({
          rawMaterialId: i.rawMaterialId,
          quantity: i.quantity,
          unitOfMeasure: i.unitOfMeasure,
          wastagePercent: i.wastagePercent,
          unitCost: i.unitCost ?? 0,
          notes: i.notes,
        })),
      },
      steps: steps ? {
        create: steps.map(s => ({
          stepNumber: s.stepNumber,
          operationName: s.operationName,
          workCenterId: s.workCenterId,
          durationMins: s.durationMins,
          labourRatePerHour: s.labourRatePerHour ?? 0,
          machineCostPerUnit: s.machineCostPerUnit ?? 0,
          notes: s.notes,
        })),
      } : undefined,
    },
    include: { items: true, steps: true },
  })
  revalidatePath('/manufacturing')
  return { success: true, data: bom }
}

export async function toggleBOMStatus(id: number) {
  try { await requireRole('ADMIN', 'MANAGER') } catch { return { success: false, error: 'Access denied' } }
  const bom = await prisma.billOfMaterials.findUnique({ where: { id } })
  if (!bom) return { success: false, error: 'BOM not found' }
  await prisma.billOfMaterials.update({ where: { id }, data: { isActive: !bom.isActive } })
  revalidatePath('/manufacturing')
  return { success: true }
}

export async function deleteBOM(id: number) {
  try { await requireRole('ADMIN', 'MANAGER') } catch { return { success: false, error: 'Access denied' } }
  const bom = await prisma.billOfMaterials.findUnique({ where: { id }, include: { _count: { select: { productionOrders: true } } } })
  if (!bom) return { success: false, error: 'Not found' }
  if (bom._count.productionOrders > 0) return { success: false, error: 'Cannot delete BOM with existing production orders' }
  await prisma.billOfMaterials.delete({ where: { id } })
  revalidatePath('/manufacturing')
  return { success: true }
}

// ─── BOM ITEM MANAGEMENT ─────────────────────────────

export async function addBOMItem(data: unknown) {
  try { await requireRole('ADMIN', 'MANAGER') } catch { return { success: false, error: 'Access denied' } }
  const parsed = addBOMItemSchema.safeParse(data)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }

  const { bomId, rawMaterialId, quantity, unitOfMeasure, wastagePercent, unitCost, notes } = parsed.data
  const item = await prisma.bomItem.create({
    data: { bomId, rawMaterialId, quantity, unitOfMeasure, wastagePercent, unitCost: unitCost ?? 0, notes },
    include: { rawMaterial: { select: { name: true, sku: true, stock: true, unitOfMeasure: true, costPrice: true } } },
  })
  revalidatePath('/manufacturing')
  return { success: true, data: item }
}

export async function updateBOMItem(data: unknown) {
  try { await requireRole('ADMIN', 'MANAGER') } catch { return { success: false, error: 'Access denied' } }
  const parsed = updateBOMItemSchema.safeParse(data)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }

  const { id, ...updateData } = parsed.data
  const item = await prisma.bomItem.update({ where: { id }, data: updateData })
  revalidatePath('/manufacturing')
  return { success: true, data: item }
}

export async function removeBOMItem(id: number) {
  try { await requireRole('ADMIN', 'MANAGER') } catch { return { success: false, error: 'Access denied' } }
  await prisma.bomItem.delete({ where: { id } })
  revalidatePath('/manufacturing')
  return { success: true }
}

// ─── BOM STEP MANAGEMENT ─────────────────────────────

export async function addBOMStep(data: unknown) {
  try { await requireRole('ADMIN', 'MANAGER') } catch { return { success: false, error: 'Access denied' } }
  const parsed = addBOMStepSchema.safeParse(data)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }

  // Find the max step number for this BOM
  const maxStep = await prisma.bomStep.findFirst({
    where: { bomId: parsed.data.bomId },
    orderBy: { stepNumber: 'desc' },
    select: { stepNumber: true },
  })
  const stepNumber = (maxStep?.stepNumber ?? 0) + 1

  const step = await prisma.bomStep.create({
    data: { ...parsed.data, stepNumber },
    include: { workCenter: { select: { name: true, type: true } } },
  })
  revalidatePath('/manufacturing')
  return { success: true, data: step }
}

export async function updateBOMStep(data: unknown) {
  try { await requireRole('ADMIN', 'MANAGER') } catch { return { success: false, error: 'Access denied' } }
  const parsed = updateBOMStepSchema.safeParse(data)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }

  const { id, ...updateData } = parsed.data
  const step = await prisma.bomStep.update({
    where: { id },
    data: updateData,
    include: { workCenter: { select: { name: true, type: true } } },
  })
  revalidatePath('/manufacturing')
  return { success: true, data: step }
}

export async function removeBOMStep(id: number) {
  try { await requireRole('ADMIN', 'MANAGER') } catch { return { success: false, error: 'Access denied' } }
  const step = await prisma.bomStep.findUnique({ where: { id }, select: { bomId: true } })
  if (!step) return { success: false, error: 'Step not found' }
  await prisma.bomStep.delete({ where: { id } })
  // Re-number remaining steps
  const remaining = await prisma.bomStep.findMany({ where: { bomId: step.bomId }, orderBy: { stepNumber: 'asc' } })
  for (let i = 0; i < remaining.length; i++) {
    await prisma.bomStep.update({ where: { id: remaining[i].id }, data: { stepNumber: i + 1 } })
  }
  revalidatePath('/manufacturing')
  return { success: true }
}

// ─── BOM EXPORT ──────────────────────────────────────

export async function exportBOM(id: number) {
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

  return { success: true, data: bom }
}

// ─── BOM TEMPLATES ───────────────────────────────────

export async function getBomTemplates() {
  const templates = await prisma.bomTemplate.findMany({ orderBy: { name: 'asc' } })
  return { success: true, data: templates }
}

export async function createBomTemplate(data: unknown) {
  try { await requireRole('ADMIN', 'MANAGER') } catch { return { success: false, error: 'Access denied' } }
  const parsed = createBomTemplateSchema.safeParse(data)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }

  const existing = await prisma.bomTemplate.findFirst({ where: { name: parsed.data.name } })
  if (existing) return { success: false, error: 'Template with this name already exists' }

  const template = await prisma.bomTemplate.create({ data: parsed.data })
  revalidatePath('/manufacturing')
  return { success: true, data: template }
}

export async function deleteBomTemplate(id: number) {
  try { await requireRole('ADMIN', 'MANAGER') } catch { return { success: false, error: 'Access denied' } }
  await prisma.bomTemplate.delete({ where: { id } })
  revalidatePath('/manufacturing')
  return { success: true }
}

// ─── MRP ANALYSIS ────────────────────────────────────

export async function getMRPAnalysis(bomId: number, qty: number) {
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

  const requirements = bom.items.map(item => {
    const effectiveUnitCost = item.unitCost > 0 ? item.unitCost : item.rawMaterial.costPrice
    const required = item.quantity * qty * (1 + item.wastagePercent / 100)
    const available = item.rawMaterial.stock
    const shortage = Math.max(0, required - available)
    return {
      materialId: item.rawMaterialId,
      materialName: item.rawMaterial.name,
      sku: item.rawMaterial.sku,
      unitOfMeasure: item.rawMaterial.unitOfMeasure,
      required: Math.ceil(required * 100) / 100,
      available,
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
  const sellingPrice = (bom.finishedProduct.price || 0) * qty
  const estimatedProfit = sellingPrice - totalManufacturingCost

  return {
    success: true,
    data: {
      bomName: bom.name,
      finishedProduct: bom.finishedProduct.name,
      qty,
      requirements,
      stepCostings,
      canProduceAll,
      shortages: requirements.filter(r => !r.canProduce),
      totalMaterialCost,
      totalLabourCost,
      totalMachineCost,
      totalManufacturingCost,
      sellingPrice,
      estimatedProfit,
      estimatedMargin: sellingPrice > 0 ? Math.round((estimatedProfit / sellingPrice) * 100) : 0,
    },
  }
}

// ─── PRODUCTION ORDERS ───────────────────────────────

export async function getProductionOrders() {
  unstable_noStore()
  const orders = await prisma.productionOrder.findMany({
    orderBy: [{ status: 'asc' }, { dueDate: 'asc' }, { createdAt: 'desc' }],
    include: {
      bom: { select: { name: true, version: true } },
      finishedProduct: { select: { name: true, sku: true, price: true } },
      workCenter: { select: { name: true, type: true } },
      assignedStaff: { select: { name: true } },
      consumptions: {
        include: { rawMaterial: { select: { name: true, sku: true, unitOfMeasure: true } } },
      },
      productionSteps: {
        include: { workCenter: { select: { name: true } } },
        orderBy: { stepNumber: 'asc' },
      },
    },
  })
  return { success: true, data: orders }
}

export async function getAssignableStaff() {
  const staff = await prisma.staff.findMany({
    where: { status: 'Active' },
    select: { id: true, name: true, role: true },
    orderBy: { name: 'asc' },
  })
  return { success: true, data: staff }
}

export async function createProductionOrder(data: unknown) {
  try { await requireRole('ADMIN', 'MANAGER') } catch { return { success: false, error: 'Access denied' } }
  const parsed = createProductionOrderSchema.safeParse(data)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }

  const { bomId, plannedQty, priority, dueDate, startDate, workCenterId, assignedStaffId, assignedTo, notes } = parsed.data

  const bom = await prisma.billOfMaterials.findUnique({
    where: { id: bomId },
    include: {
      items: { include: { rawMaterial: { select: { costPrice: true } } } },
      steps: { orderBy: { stepNumber: 'asc' } },
    },
  })
  if (!bom) return { success: false, error: 'BOM not found' }
  if (!bom.isActive) return { success: false, error: 'This BOM is inactive' }

  let assigneeName = assignedTo?.trim() || null
  if (assignedStaffId) {
    const staff = await prisma.staff.findUnique({
      where: { id: assignedStaffId },
      select: { name: true, status: true },
    })
    if (!staff) return { success: false, error: 'Selected staff member was not found' }
    if (staff.status !== 'Active') return { success: false, error: 'Selected staff member is not active' }
    assigneeName = staff.name
  }

  const lastOrder = await prisma.productionOrder.findFirst({ orderBy: { id: 'desc' }, select: { displayId: true } })
  let nextNum = 1
  if (lastOrder?.displayId) {
    const m = lastOrder.displayId.match(/PRD-(\d+)/)
    if (m) nextNum = parseInt(m[1]) + 1
  }
  const displayId = `PRD-${String(nextNum).padStart(4, '0')}`

  const baseCreateData = {
    displayId,
    bomId,
    finishedProductId: bom.finishedProductId,
    workCenterId: workCenterId || null,
    plannedQty,
    priority,
    dueDate: dueDate ? new Date(dueDate) : null,
    startDate: startDate ? new Date(startDate) : null,
    assignedTo: assigneeName,
    notes,
    consumptions: {
      create: bom.items.map(i => {
        const effectiveUnitCost = i.unitCost > 0 ? i.unitCost : i.rawMaterial.costPrice
        return {
          rawMaterialId: i.rawMaterialId,
          plannedQty: i.quantity * plannedQty * (1 + i.wastagePercent / 100),
          unitCost: effectiveUnitCost,
          totalCost: Math.round(i.quantity * plannedQty * (1 + i.wastagePercent / 100) * effectiveUnitCost),
        }
      }),
    },
    productionSteps: bom.steps.length > 0 ? {
      create: bom.steps.map(s => ({
        stepNumber: s.stepNumber,
        operationName: s.operationName,
        workCenterId: s.workCenterId || null,
        plannedMins: s.durationMins * plannedQty,
        status: 'PENDING',
      })),
    } : undefined,
  }

  let order
  let createdWithoutAssignedStaffField = false
  try {
    order = await prisma.productionOrder.create({
      data: {
        ...baseCreateData,
        assignedStaffId: assignedStaffId || null,
      },
    })
  } catch (error) {
    const staleClientMissingField =
      assignedStaffId &&
      error instanceof Error &&
      error.message.includes('Unknown argument `assignedStaffId`')

    if (!staleClientMissingField) throw error

    // Fallback for stale Prisma client cache: create without relation field, then update via SQL.
    order = await prisma.productionOrder.create({ data: baseCreateData })
    createdWithoutAssignedStaffField = true
  }

  if (assignedStaffId && createdWithoutAssignedStaffField) {
    try {
      await prisma.$executeRaw`
        UPDATE "ProductionOrder"
        SET "assignedStaffId" = ${assignedStaffId}
        WHERE "id" = ${order.id}
      `
    } catch {
      // Keep order creation successful even if relation update fails in stale environments.
    }
  }
  revalidatePath('/manufacturing')
  return { success: true, data: order }
}

export async function startProduction(id: number) {
  try { await requireRole('ADMIN', 'MANAGER') } catch { return { success: false, error: 'Access denied' } }
  await prisma.productionOrder.update({
    where: { id },
    data: { status: 'IN_PROGRESS', startDate: new Date() },
  })
  revalidatePath('/manufacturing')
  return { success: true }
}

export async function holdProduction(id: number) {
  try { await requireRole('ADMIN', 'MANAGER') } catch { return { success: false, error: 'Access denied' } }
  await prisma.productionOrder.update({ where: { id }, data: { status: 'ON_HOLD' } })
  revalidatePath('/manufacturing')
  return { success: true }
}

export async function cancelProductionOrder(id: number, reason: string) {
  try { await requireRole('ADMIN', 'MANAGER') } catch { return { success: false, error: 'Access denied' } }
  const order = await prisma.productionOrder.findUnique({ where: { id } })
  if (!order) return { success: false, error: 'Order not found' }
  if (order.status === 'COMPLETED') return { success: false, error: 'Cannot cancel a completed order' }

  await prisma.productionOrder.update({
    where: { id },
    data: { status: 'CANCELLED', cancelReason: reason, cancelledDate: new Date() },
  })
  revalidatePath('/manufacturing')
  return { success: true }
}

export async function deleteProductionOrder(id: number) {
  try { await requireRole('ADMIN', 'MANAGER') } catch { return { success: false, error: 'Access denied' } }
  const order = await prisma.productionOrder.findUnique({ where: { id } })
  if (!order) return { success: false, error: 'Order not found' }
  if (order.status === 'COMPLETED') return { success: false, error: 'Cannot delete a completed production order' }
  if (order.status === 'IN_PROGRESS') return { success: false, error: 'Cannot delete an in-progress order. Hold or cancel it first.' }

  await prisma.productionOrder.delete({ where: { id } })
  revalidatePath('/manufacturing')
  return { success: true }
}

export async function updateProductionStep(stepId: number, status: string, actualMins?: number, assignedWorker?: string) {
  try { await requireRole('ADMIN', 'MANAGER') } catch { return { success: false, error: 'Access denied' } }
  await prisma.productionStep.update({
    where: { id: stepId },
    data: {
      status,
      actualMins: actualMins ?? undefined,
      assignedWorker: assignedWorker ?? undefined,
      startedAt: status === 'IN_PROGRESS' ? new Date() : undefined,
      completedAt: status === 'DONE' ? new Date() : undefined,
    },
  })
  revalidatePath('/manufacturing')
  return { success: true }
}

export async function completeProduction(data: unknown) {
  try { await requireRole('ADMIN', 'MANAGER') } catch { return { success: false, error: 'Access denied' } }
  const parsed = completeProductionSchema.safeParse(data)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }

  const { productionOrderId, actualQty, totalLabourCost, overheadCost, machineCost, scrapQty, scrapReason, qualityStatus, qualityNotes, notes, consumptions } = parsed.data

  const order = await prisma.productionOrder.findUnique({
    where: { id: productionOrderId },
    include: { consumptions: true },
  })
  if (!order) return { success: false, error: 'Production order not found' }
  if (order.status !== 'IN_PROGRESS' && order.status !== 'ON_HOLD') {
    return { success: false, error: 'Order must be IN_PROGRESS or ON_HOLD to complete' }
  }

  await prisma.$transaction(async (tx) => {
    let totalMaterialCost = 0

    for (const c of consumptions) {
      const planned = order.consumptions.find(oc => oc.rawMaterialId === c.rawMaterialId)
      const cost = planned ? Math.round(c.actualQty * planned.unitCost) : 0
      totalMaterialCost += cost

      await tx.product.update({
        where: { id: c.rawMaterialId },
        data: { stock: { decrement: Math.ceil(c.actualQty) } },
      })
      if (planned) {
        await tx.materialConsumption.update({
          where: { id: planned.id },
          data: { actualQty: c.actualQty, totalCost: cost },
        })
      }
    }

    // Only add finished goods for passed/partial quality
    const goodQty = qualityStatus === 'FAILED' ? 0 : actualQty - scrapQty
    if (goodQty > 0) {
      await tx.product.update({
        where: { id: order.finishedProductId },
        data: { stock: { increment: goodQty } },
      })
    }

    const totalCost = totalMaterialCost + totalLabourCost + (machineCost ?? 0) + overheadCost
    const costPerUnit = actualQty > 0 ? Math.round(totalCost / actualQty) : 0
    const yieldRate = order.plannedQty > 0 ? Math.round((actualQty / order.plannedQty) * 100 * 10) / 10 : 0

    // Update product cost price if now known
    if (costPerUnit > 0) {
      await tx.product.update({
        where: { id: order.finishedProductId },
        data: { costPrice: costPerUnit },
      })
    }

    await tx.productionOrder.update({
      where: { id: productionOrderId },
      data: {
        status: 'COMPLETED',
        actualQty,
        totalMaterialCost,
        totalLabourCost,
        overheadCost: (machineCost ?? 0) + overheadCost, // store combined overhead
        totalCost,
        costPerUnit,
        yieldRate,
        scrapQty,
        scrapReason,
        qualityStatus,
        qualityNotes,
        completedDate: new Date(),
        notes,
      },
    })

    // Mark all steps done
    await tx.productionStep.updateMany({
      where: { productionOrderId, status: { not: 'DONE' } },
      data: { status: 'DONE', completedAt: new Date() },
    })
  })

  revalidatePath('/manufacturing')
  revalidatePath('/inventory')
  return { success: true }
}

export async function recordQualityCheck(data: unknown) {
  try { await requireRole('ADMIN', 'MANAGER') } catch { return { success: false, error: 'Access denied' } }
  const parsed = qualityCheckSchema.safeParse(data)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }

  const { productionOrderId, qualityStatus, qualityNotes, scrapQty, scrapReason } = parsed.data
  await prisma.productionOrder.update({
    where: { id: productionOrderId },
    data: { qualityStatus, qualityNotes, scrapQty, scrapReason },
  })
  revalidatePath('/manufacturing')
  return { success: true }
}

// ─── ANALYTICS ───────────────────────────────────────

export async function getManufacturingStats() {
  const [allOrders, workCenters] = await Promise.all([
    prisma.productionOrder.findMany({
      include: {
        finishedProduct: { select: { name: true } },
        consumptions: true,
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.workCenter.findMany(),
  ])

  const completed = allOrders.filter(o => o.status === 'COMPLETED')
  const inProgress = allOrders.filter(o => o.status === 'IN_PROGRESS')
  const planned = allOrders.filter(o => o.status === 'PLANNED')

  // Yield rate average
  const avgYield = completed.length > 0
    ? Math.round(completed.reduce((s, o) => s + (o.yieldRate || 0), 0) / completed.length * 10) / 10
    : 0

  // Total production value
  const totalProduced = completed.reduce((s, o) => s + (o.actualQty || 0), 0)
  const totalMaterialCost = completed.reduce((s, o) => s + (o.totalMaterialCost || 0), 0)
  const totalLabourCost = completed.reduce((s, o) => s + (o.totalLabourCost || 0), 0)
  const totalOverhead = completed.reduce((s, o) => s + (o.overheadCost || 0), 0)
  const totalScrap = completed.reduce((s, o) => s + (o.scrapQty || 0), 0)

  // Quality pass rate
  const qualityPassed = completed.filter(o => o.qualityStatus === 'PASSED').length
  const qualityRate = completed.length > 0 ? Math.round((qualityPassed / completed.length) * 100) : 0

  // Top produced products
  const productMap: Record<string, { name: string; qty: number; orders: number }> = {}
  completed.forEach(o => {
    const name = o.finishedProduct.name
    if (!productMap[name]) productMap[name] = { name, qty: 0, orders: 0 }
    productMap[name].qty += o.actualQty || 0
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
    monthlyMap[m].qty += o.actualQty || 0
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
        avgYield,
        qualityRate,
        totalMaterialCost,
        totalLabourCost,
        totalOverhead,
        totalCost: totalMaterialCost + totalLabourCost + totalOverhead,
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
  const orders = await prisma.productionOrder.findMany({
    where: {
      OR: [
        { assignedStaffId: staffId },
        { assignedTo: { not: null } }, // we'll filter these client-side by staff name
      ],
    },
    orderBy: [{ priority: 'asc' }, { dueDate: 'asc' }, { createdAt: 'desc' }],
    include: {
      bom: { select: { name: true, version: true } },
      finishedProduct: { select: { name: true, sku: true } },
      workCenter: { select: { name: true } },
      productionSteps: {
        include: { workCenter: { select: { name: true } } },
        orderBy: { stepNumber: 'asc' },
      },
    },
  })

  // Filter to only orders actually assigned to this staff (by ID)
  const staffOrders = orders.filter(o => o.assignedStaffId === staffId)

  return { success: true, data: staffOrders }
}

export async function staffUpdateProductionStep(staffId: number, stepId: number, status: string) {
  // Verify the step belongs to an order assigned to this staff
  const step = await prisma.productionStep.findUnique({
    where: { id: stepId },
    include: { productionOrder: { select: { assignedStaffId: true, status: true } } },
  })
  if (!step) return { success: false, error: 'Step not found' }
  if (step.productionOrder.assignedStaffId !== staffId) {
    return { success: false, error: 'You are not assigned to this production order' }
  }
  if (step.productionOrder.status !== 'IN_PROGRESS') {
    return { success: false, error: 'Production order is not in progress' }
  }

  await prisma.productionStep.update({
    where: { id: stepId },
    data: {
      status,
      startedAt: status === 'IN_PROGRESS' ? new Date() : undefined,
      completedAt: status === 'DONE' ? new Date() : undefined,
    },
  })
  revalidatePath('/staff-portal')
  revalidatePath('/manufacturing')
  return { success: true }
}

export async function staffUpdateProductionProgress(staffId: number, orderId: number, actualQty: number, notes?: string) {
  const order = await prisma.productionOrder.findUnique({ where: { id: orderId } })
  if (!order) return { success: false, error: 'Order not found' }
  if (order.assignedStaffId !== staffId) return { success: false, error: 'You are not assigned to this order' }
  if (order.status !== 'IN_PROGRESS') return { success: false, error: 'Order is not in progress' }
  if (actualQty < 0) return { success: false, error: 'Quantity cannot be negative' }
  if (actualQty > order.plannedQty) return { success: false, error: 'Cannot exceed planned quantity' }

  const updateData: Record<string, unknown> = {
    actualQty,
    yieldRate: order.plannedQty > 0 ? (actualQty / order.plannedQty) * 100 : 0,
  }
  if (notes !== undefined) updateData.notes = notes

  await prisma.productionOrder.update({ where: { id: orderId }, data: updateData })
  revalidatePath('/staff-portal')
  revalidatePath('/manufacturing')
  return { success: true }
}
