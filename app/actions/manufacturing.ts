'use server'

import { prisma } from '@/lib/db'
import { revalidatePath } from 'next/cache'
import { requireRole } from '@/lib/auth-helpers'
import { createBOMSchema, createProductionOrderSchema, completeProductionSchema } from '@/lib/validations/manufacturing'

// ─── BILL OF MATERIALS ───────────────────────────────

export async function getBOMs() {
  const boms = await prisma.billOfMaterials.findMany({
    orderBy: { name: 'asc' },
    include: {
      finishedProduct: { select: { name: true, sku: true } },
      items: {
        include: { rawMaterial: { select: { name: true, sku: true, stock: true, unitOfMeasure: true } } },
      },
    },
  })
  return { success: true, data: boms }
}

export async function createBOM(data: unknown) {
  try { await requireRole('ADMIN', 'MANAGER') } catch { return { success: false, error: 'Access denied' } }
  const parsed = createBOMSchema.safeParse(data)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }

  const { name, finishedProductId, version, notes, items } = parsed.data

  const bom = await prisma.billOfMaterials.create({
    data: {
      name,
      finishedProductId,
      version,
      notes,
      items: {
        create: items.map(i => ({
          rawMaterialId: i.rawMaterialId,
          quantity: i.quantity,
          unitOfMeasure: i.unitOfMeasure,
          wastagePercent: i.wastagePercent,
          notes: i.notes,
        })),
      },
    },
    include: { items: true },
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

// ─── PRODUCTION ORDERS ───────────────────────────────

export async function getProductionOrders() {
  const orders = await prisma.productionOrder.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      bom: { select: { name: true } },
      finishedProduct: { select: { name: true, sku: true } },
      consumptions: {
        include: { rawMaterial: { select: { name: true, sku: true, unitOfMeasure: true } } },
      },
    },
  })
  return { success: true, data: orders }
}

export async function createProductionOrder(data: unknown) {
  try { await requireRole('ADMIN', 'MANAGER') } catch { return { success: false, error: 'Access denied' } }
  const parsed = createProductionOrderSchema.safeParse(data)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }

  const { bomId, plannedQty, startDate, notes } = parsed.data

  const bom = await prisma.billOfMaterials.findUnique({
    where: { id: bomId },
    include: { items: { include: { rawMaterial: { select: { costPrice: true } } } } },
  })
  if (!bom) return { success: false, error: 'BOM not found' }
  if (!bom.isActive) return { success: false, error: 'This BOM is inactive' }

  const count = await prisma.productionOrder.count()
  const displayId = `PRD-${String(count + 1).padStart(4, '0')}`

  const order = await prisma.productionOrder.create({
    data: {
      displayId,
      bomId,
      finishedProductId: bom.finishedProductId,
      plannedQty,
      startDate: startDate ? new Date(startDate) : undefined,
      notes,
      consumptions: {
        create: bom.items.map(i => ({
          rawMaterialId: i.rawMaterialId,
          plannedQty: i.quantity * plannedQty * (1 + i.wastagePercent / 100),
          unitCost: i.rawMaterial.costPrice,
          totalCost: Math.round(i.quantity * plannedQty * (1 + i.wastagePercent / 100) * i.rawMaterial.costPrice),
        })),
      },
    },
  })
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

export async function completeProduction(data: unknown) {
  try { await requireRole('ADMIN', 'MANAGER') } catch { return { success: false, error: 'Access denied' } }
  const parsed = completeProductionSchema.safeParse(data)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }

  const { productionOrderId, actualQty, totalLabourCost, notes, consumptions } = parsed.data

  const order = await prisma.productionOrder.findUnique({
    where: { id: productionOrderId },
    include: { consumptions: true },
  })
  if (!order) return { success: false, error: 'Production order not found' }
  if (order.status !== 'IN_PROGRESS') return { success: false, error: 'Order must be IN_PROGRESS to complete' }

  await prisma.$transaction(async (tx) => {
    let totalMaterialCost = 0

    for (const c of consumptions) {
      const planned = order.consumptions.find(oc => oc.rawMaterialId === c.rawMaterialId)
      const cost = planned ? Math.round(c.actualQty * planned.unitCost) : 0
      totalMaterialCost += cost

      // Deduct raw material stock
      await tx.product.update({
        where: { id: c.rawMaterialId },
        data: { stock: { decrement: Math.ceil(c.actualQty) } },
      })
      // Update consumption record
      if (planned) {
        await tx.materialConsumption.update({
          where: { id: planned.id },
          data: { actualQty: c.actualQty, totalCost: cost },
        })
      }
    }

    // Add finished goods to stock
    await tx.product.update({
      where: { id: order.finishedProductId },
      data: { stock: { increment: actualQty } },
    })

    await tx.productionOrder.update({
      where: { id: productionOrderId },
      data: {
        status: 'COMPLETED',
        actualQty,
        totalMaterialCost,
        totalLabourCost,
        completedDate: new Date(),
        notes,
      },
    })
  })

  revalidatePath('/manufacturing')
  revalidatePath('/inventory')
  return { success: true }
}
