'use server'

import { prisma } from '@/lib/db'
import { revalidatePath } from 'next/cache'
import { createOrderSchema, updateOrderStatusSchema } from '@/lib/validations/order'
import type { OrderSource, OrderStatus, PaymentStatus } from '@prisma/client'
import { adjustGodownStock, getOrCreateDefaultGodown } from './godowns'

export async function getOrders(source?: string) {
  const where = source && source !== 'All'
    ? { source: source.toUpperCase() as OrderSource }
    : {}

  const orders = await prisma.order.findMany({
    where,
    include: { contact: true, product: true },
    orderBy: { date: 'desc' },
  })

  return {
    success: true,
    data: orders.map(o => ({
      id: o.displayId,
      customer: o.contact.name,
      product: o.product.name,
      quantity: o.quantity,
      amount: o.amount,
      status: o.status.charAt(0) + o.status.slice(1).toLowerCase(),
      date: o.date.toISOString().split('T')[0],
      deliveryDate: o.deliveryDate?.toISOString().split('T')[0] || null,
      payment: o.payment.charAt(0) + o.payment.slice(1).toLowerCase(),
      source: o.source.charAt(0) + o.source.slice(1).toLowerCase(),
      dbId: o.id,
    })),
  }
}

export async function getOrder(id: number) {
  const order = await prisma.order.findUnique({
    where: { id },
    include: { contact: true, product: true },
  })
  if (!order) return { success: false, error: 'Order not found' }
  return { success: true, data: order }
}

export async function createOrder(data: unknown) {
  const parsed = createOrderSchema.safeParse(data)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }

  const { customer, phone, productId, quantity, amount, source, payment, notes, godownId } = parsed.data
  const orderSource = source as OrderSource
  const shouldDeductStock = orderSource === 'STORE' || orderSource === 'SHOPIFY'
  let targetGodownId: number | undefined
  let usingGodownStock = false

  // Find or create contact
  let contact = await prisma.contact.findFirst({ where: { phone } })
  if (!contact) {
    contact = await prisma.contact.create({ data: { name: customer, phone } })
  }

  // Generate display ID — based on last order's ID to survive deletions
  const prefix = orderSource === 'STORE' ? 'ORD' : orderSource === 'AMAZON' ? 'AMZ' : orderSource === 'FLIPKART' ? 'FK' : 'SHP'
  const lastOrder = await prisma.order.findFirst({
    where: { displayId: { startsWith: prefix } },
    orderBy: { id: 'desc' },
    select: { displayId: true },
  })
  let nextNum = 1
  if (lastOrder?.displayId) {
    const match = lastOrder.displayId.match(/(\d+)$/)
    if (match) nextNum = parseInt(match[1]) + 1
  }
  const displayId = `${prefix}-${String(nextNum).padStart(4, '0')}`

  // Check stock availability
  const product = await prisma.product.findUnique({ where: { id: productId } })
  if (!product) return { success: false, error: 'Product not found' }

  if (shouldDeductStock) {
    const godownCount = await prisma.godown.count()
    usingGodownStock = godownCount > 0

    if (usingGodownStock) {
      if (orderSource === 'STORE') {
        if (!godownId) return { success: false, error: 'Please select a showroom/godown for offline orders' }
        targetGodownId = godownId
      } else if (godownId) {
        targetGodownId = godownId
      } else {
        const defaultGodown = await getOrCreateDefaultGodown()
        targetGodownId = defaultGodown.id
      }

      const selectedGodown = await prisma.godown.findUnique({
        where: { id: targetGodownId },
        select: { id: true, name: true },
      })
      if (!selectedGodown) return { success: false, error: 'Selected showroom/godown not found' }

      const godownStock = await prisma.godownStock.findUnique({
        where: { productId_godownId: { productId, godownId: selectedGodown.id } },
        select: { quantity: true },
      })
      const available = godownStock?.quantity || 0
      if (available < quantity) {
        return { success: false, error: `Only ${available} units available in ${selectedGodown.name}` }
      }

      targetGodownId = selectedGodown.id
    } else if (product.stock < quantity) {
      return { success: false, error: `Only ${product.stock} units in stock` }
    }
  }

  const order = await prisma.order.create({
    data: {
      displayId,
      contactId: contact.id,
      productId,
      quantity,
      amount,
      source: orderSource,
      payment: payment as PaymentStatus,
      status: 'CONFIRMED',
      date: new Date(),
      notes,
      godownId: targetGodownId,
    },
  })

  if (shouldDeductStock) {
    if (usingGodownStock && targetGodownId) {
      await adjustGodownStock(productId, targetGodownId, -quantity, 'OUT', {
        referenceType: 'Order',
        referenceId: order.id,
        notes: `${orderSource} order ${displayId}`,
        createdBy: 'Orders',
      })
      await prisma.product.update({
        where: { id: productId },
        data: { sold: { increment: quantity } },
      })
    } else {
      await prisma.product.update({
        where: { id: productId },
        data: {
          stock: { decrement: quantity },
          sold: { increment: quantity },
        },
      })
    }
  }

  revalidatePath('/orders')
  revalidatePath('/inventory')
  if (usingGodownStock) revalidatePath('/godowns')
  return { success: true, data: order }
}

export async function updateOrderStatus(data: unknown) {
  const parsed = updateOrderStatusSchema.safeParse(data)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }

  const updateData: { status: OrderStatus; deliveryDate?: Date } = {
    status: parsed.data.status,
  }

  if (parsed.data.status === 'DELIVERED') {
    updateData.deliveryDate = new Date()
  }

  const order = await prisma.order.update({
    where: { id: parsed.data.id },
    data: updateData,
  })

  revalidatePath('/orders')
  return { success: true, data: order }
}

export async function getOrdersBySource() {
  const counts = await prisma.order.groupBy({
    by: ['source'],
    _count: true,
    _sum: { amount: true },
  })

  return {
    success: true,
    data: counts.map(c => ({
      source: c.source,
      count: c._count,
      revenue: c._sum.amount || 0,
    })),
  }
}
