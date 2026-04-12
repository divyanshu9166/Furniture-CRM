'use server'

import { prisma } from '@/lib/db'
import { revalidatePath } from 'next/cache'
import { requireRole } from '@/lib/auth-helpers'
import { createSupplierSchema, createPurchaseOrderSchema, createPurchaseReturnSchema } from '@/lib/validations/purchase'

// ─── SUPPLIERS ───────────────────────────────────────

export async function getSuppliers() {
  const suppliers = await prisma.supplier.findMany({
    orderBy: { name: 'asc' },
    include: {
      _count: { select: { purchaseOrders: true } },
    },
  })
  return { success: true, data: suppliers }
}

export async function createSupplier(data: unknown) {
  try { await requireRole('ADMIN', 'MANAGER') } catch { return { success: false, error: 'Access denied' } }
  const parsed = createSupplierSchema.safeParse(data)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }

  const supplier = await prisma.supplier.create({ data: parsed.data })
  revalidatePath('/purchases')
  return { success: true, data: supplier }
}

export async function updateSupplier(id: number, data: unknown) {
  try { await requireRole('ADMIN', 'MANAGER') } catch { return { success: false, error: 'Access denied' } }
  const parsed = createSupplierSchema.safeParse(data)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }

  const supplier = await prisma.supplier.update({ where: { id }, data: parsed.data })
  revalidatePath('/purchases')
  return { success: true, data: supplier }
}

// ─── PURCHASE ORDERS ─────────────────────────────────

export async function getPurchaseOrders() {
  const pos = await prisma.purchaseOrder.findMany({
    orderBy: { date: 'desc' },
    include: {
      supplier: { select: { name: true, phone: true } },
      items: { include: { product: { select: { name: true, sku: true } } } },
    },
  })
  return { success: true, data: pos }
}

export async function createPurchaseOrder(data: unknown) {
  try { await requireRole('ADMIN', 'MANAGER') } catch { return { success: false, error: 'Access denied' } }
  const parsed = createPurchaseOrderSchema.safeParse(data)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }

  const { supplierId, expectedDate, notes, discount, items } = parsed.data

  // Calculate totals
  const subtotal = items.reduce((sum, i) => sum + i.quantity * i.unitCost, 0)
  const discountAmt = discount
  const taxable = subtotal - discountAmt
  const gst = Math.round(taxable * 18 / 100)
  const cgst = Math.round(gst / 2)
  const sgst = gst - cgst
  const total = taxable + gst

  // Generate displayId
  const count = await prisma.purchaseOrder.count()
  const displayId = `PO-${String(count + 1).padStart(4, '0')}`

  const po = await prisma.purchaseOrder.create({
    data: {
      displayId,
      supplierId,
      notes,
      discount: discountAmt,
      subtotal,
      gst,
      cgst,
      sgst,
      total,
      balanceDue: total,
      expectedDate: expectedDate ? new Date(expectedDate) : undefined,
      items: {
        create: items.map(i => ({
          productId: i.productId,
          name: i.name,
          sku: i.sku,
          hsnCode: i.hsnCode,
          quantity: i.quantity,
          unitCost: i.unitCost,
          gstRate: i.gstRate,
          amount: i.quantity * i.unitCost,
        })),
      },
    },
    include: { items: true },
  })

  revalidatePath('/purchases')
  return { success: true, data: po }
}

export async function approvePurchaseOrder(id: number) {
  try { await requireRole('ADMIN', 'MANAGER') } catch { return { success: false, error: 'Access denied' } }
  const po = await prisma.purchaseOrder.findUnique({ where: { id } })
  if (!po) return { success: false, error: 'Purchase order not found' }
  if (po.status !== 'DRAFT') return { success: false, error: 'Only DRAFT orders can be approved' }

  await prisma.purchaseOrder.update({ where: { id }, data: { status: 'APPROVED' } })
  revalidatePath('/purchases')
  return { success: true }
}

export async function receivePurchaseOrder(id: number) {
  try { await requireRole('ADMIN', 'MANAGER') } catch { return { success: false, error: 'Access denied' } }

  const po = await prisma.purchaseOrder.findUnique({
    where: { id },
    include: { items: true },
  })
  if (!po) return { success: false, error: 'Purchase order not found' }
  if (!['APPROVED', 'PARTIALLY_RECEIVED'].includes(po.status)) {
    return { success: false, error: 'Order must be approved before receiving' }
  }

  // Use transaction to update stock for each item
  await prisma.$transaction(async (tx) => {
    for (const item of po.items) {
      await tx.product.update({
        where: { id: item.productId },
        data: {
          stock: { increment: item.quantity },
          costPrice: item.unitCost,
          lastRestocked: new Date(),
        },
      })
      await tx.purchaseOrderItem.update({
        where: { id: item.id },
        data: { receivedQty: item.quantity },
      })
      // Log stock update
      await tx.stockUpdate.create({
        data: {
          product: item.name,
          warehouse: 'Main',
          action: 'Add',
          quantity: item.quantity,
          date: new Date().toISOString().split('T')[0],
          time: new Date().toTimeString().split(' ')[0],
        },
      })
    }
    await tx.purchaseOrder.update({
      where: { id },
      data: { status: 'RECEIVED', receivedAt: new Date() },
    })
  })

  revalidatePath('/purchases')
  revalidatePath('/inventory')
  return { success: true }
}

export async function cancelPurchaseOrder(id: number) {
  try { await requireRole('ADMIN', 'MANAGER') } catch { return { success: false, error: 'Access denied' } }
  const po = await prisma.purchaseOrder.findUnique({ where: { id } })
  if (!po) return { success: false, error: 'Not found' }
  if (po.status === 'RECEIVED') return { success: false, error: 'Cannot cancel a received order' }

  await prisma.purchaseOrder.update({ where: { id }, data: { status: 'CANCELLED' } })
  revalidatePath('/purchases')
  return { success: true }
}

// ─── PURCHASE RETURNS ─────────────────────────────────

export async function getPurchaseReturns() {
  const returns = await prisma.purchaseReturn.findMany({
    orderBy: { date: 'desc' },
    include: {
      supplier: { select: { name: true } },
      po: { select: { displayId: true } },
      items: true,
    },
  })
  return { success: true, data: returns }
}

export async function createPurchaseReturn(data: unknown) {
  try { await requireRole('ADMIN', 'MANAGER') } catch { return { success: false, error: 'Access denied' } }
  const parsed = createPurchaseReturnSchema.safeParse(data)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }

  const { supplierId, poId, reason, notes, items } = parsed.data
  const totalAmount = items.reduce((sum, i) => sum + i.quantity * i.unitCost, 0)

  const count = await prisma.purchaseReturn.count()
  const displayId = `PRN-${String(count + 1).padStart(4, '0')}`

  // Deduct stock in transaction
  const ret = await prisma.$transaction(async (tx) => {
    for (const item of items) {
      await tx.product.update({
        where: { id: item.productId },
        data: { stock: { decrement: item.quantity } },
      })
    }
    return tx.purchaseReturn.create({
      data: {
        displayId,
        supplierId,
        poId,
        reason,
        notes,
        totalAmount,
        items: {
          create: items.map(i => ({
            productId: i.productId,
            name: i.name,
            sku: i.sku,
            quantity: i.quantity,
            unitCost: i.unitCost,
          })),
        },
      },
    })
  })

  revalidatePath('/purchases')
  revalidatePath('/inventory')
  return { success: true, data: ret }
}

export async function getPurchaseStats() {
  const [totalPOs, totalSpend, pendingPOs, suppliers] = await Promise.all([
    prisma.purchaseOrder.count(),
    prisma.purchaseOrder.aggregate({
      where: { status: { in: ['APPROVED', 'RECEIVED', 'PARTIALLY_RECEIVED'] } },
      _sum: { total: true },
    }),
    prisma.purchaseOrder.count({ where: { status: { in: ['DRAFT', 'APPROVED'] } } }),
    prisma.supplier.count(),
  ])
  return {
    success: true,
    data: {
      totalPOs,
      totalSpend: totalSpend._sum.total || 0,
      pendingPOs,
      suppliers,
    },
  }
}
