'use server'

import { prisma } from '@/lib/db'
import { revalidatePath } from 'next/cache'
import { requireAuth, requireRole } from '@/lib/auth-helpers'
import { createSupplierSchema, createPurchaseOrderSchema, createPurchaseReturnSchema } from '@/lib/validations/purchase'
import { sendEmail } from '@/lib/email'
import { inventoryError, inventoryTransaction, lockProducts, moveTotalStock } from '@/lib/inventory/stock'

import { assertId, nextDocumentId } from '@/lib/commerce/documents'
import { calculateBill, indiaDay, wholeMoney } from '@/lib/commerce/rules'
import { cancelPurchase, lockedPurchase, payPurchase, validateLinkedReturn } from '@/lib/commerce/purchases'
import { normalizePhoneForMetaIndia } from '@/lib/whatsapp/phone-utils'

function escapeHtml(value: string | number | null | undefined) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function formatDate(dateValue?: Date | null) {
  if (!dateValue) return '—'
  return new Date(dateValue).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })
}

function normalizeIndianPhone(phone: string) {
  return normalizePhoneForMetaIndia(phone)
}

async function sendSupplierWhatsApp(phoneNumberId: string, apiToken: string, to: string, text: string) {
  try {
    const response = await fetch(`https://graph.facebook.com/v21.0/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'text',
        text: { body: text },
      }),
      signal: AbortSignal.timeout(15000),
    })

    if (!response.ok) {
      const errorText = await response.text()
      return { success: false, error: `WhatsApp API error: ${errorText}` }
    }

    return { success: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'WhatsApp send failed'
    return { success: false, error: message }
  }
}

async function validatePurchaseItems(tx: import('@prisma/client').Prisma.TransactionClient, supplierId: number, items: { productId: number; name: string; sku: string }[]) {
  assertId(supplierId)
  if (!await tx.supplier.findUnique({ where: { id: supplierId } })) throw new Error('Supplier not found')
  await lockProducts(tx, items.map(item => item.productId))
  const products = await tx.product.findMany({ where: { id: { in: items.map(item => item.productId) } } })
  for (const item of items) {
    const product = products.find(row => row.id === item.productId)
    if (!product || product.name !== item.name || product.sku !== item.sku) throw new Error('Selected product details changed; refresh and select the item again')
  }
}

async function notifySupplierForPurchaseOrder(poId: number, source: 'approved' | 'manual') {
  const po = await prisma.purchaseOrder.findUnique({
    where: { id: poId },
    include: {
      supplier: {
        select: {
          name: true,
          email: true,
          phone: true,
          contactPerson: true,
        },
      },
      items: true,
    },
  })

  if (!po) return { success: false, error: 'Purchase order not found' }
  if (po.status === 'CANCELLED') return { success: false, error: 'Cannot send a cancelled purchase order' }

  const settings = await prisma.storeSettings.findFirst({ where: { id: 1 } })
  const storeName = settings?.storeName || 'Furniture Store'

  const supplierPhone = po.supplier?.phone ? normalizeIndianPhone(po.supplier.phone) : ''
  const hasSupplierEmail = Boolean(po.supplier?.email)

  const waChannel = await prisma.channelConfig.findUnique({ where: { channel: 'WhatsApp' } })
  const waConfig = waChannel?.enabled ? (waChannel.config as Record<string, string>) : null
  const hasWhatsAppSetup = Boolean(waConfig?.phoneNumberId && waConfig?.apiToken && supplierPhone)

  if (!hasSupplierEmail && !hasWhatsAppSetup) {
    return {
      success: false,
      error: 'Supplier contact missing. Add supplier email or phone with WhatsApp channel enabled.',
    }
  }

  const itemRows = po.items
    .map(item => `
      <tr>
        <td style="padding:8px 10px;border-bottom:1px solid #eee;font-size:13px;">${escapeHtml(item.name)}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #eee;font-size:13px;color:#666;">${escapeHtml(item.sku)}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #eee;font-size:13px;text-align:center;">${item.quantity}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #eee;font-size:13px;text-align:right;">${Number(item.unitCost || 0).toLocaleString('en-IN')}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #eee;font-size:13px;text-align:right;font-weight:600;">${Number(item.amount || 0).toLocaleString('en-IN')}</td>
      </tr>
    `)
    .join('')

  const emailHtml = `
    <div style="font-family:Arial,sans-serif;max-width:680px;margin:0 auto;color:#1f2937;">
      <h2 style="margin:0 0 8px;">Purchase Order ${escapeHtml(po.displayId)}</h2>
      <p style="margin:0 0 16px;color:#4b5563;">Dear ${escapeHtml(po.supplier.contactPerson || po.supplier.name)}, please find your purchase order details below.</p>

      <table style="width:100%;border-collapse:collapse;margin:10px 0 14px;">
        <tbody>
          <tr>
            <td style="padding:6px 0;font-size:13px;color:#6b7280;">Supplier</td>
            <td style="padding:6px 0;font-size:13px;font-weight:600;">${escapeHtml(po.supplier.name)}</td>
          </tr>
          <tr>
            <td style="padding:6px 0;font-size:13px;color:#6b7280;">PO Date</td>
            <td style="padding:6px 0;font-size:13px;">${formatDate(po.date)}</td>
          </tr>
          <tr>
            <td style="padding:6px 0;font-size:13px;color:#6b7280;">Expected Delivery</td>
            <td style="padding:6px 0;font-size:13px;">${formatDate(po.expectedDate)}</td>
          </tr>
        </tbody>
      </table>

      <table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
        <thead>
          <tr style="background:#f9fafb;">
            <th style="padding:10px;text-align:left;font-size:12px;color:#6b7280;border-bottom:1px solid #e5e7eb;">Product</th>
            <th style="padding:10px;text-align:left;font-size:12px;color:#6b7280;border-bottom:1px solid #e5e7eb;">SKU</th>
            <th style="padding:10px;text-align:center;font-size:12px;color:#6b7280;border-bottom:1px solid #e5e7eb;">Qty</th>
            <th style="padding:10px;text-align:right;font-size:12px;color:#6b7280;border-bottom:1px solid #e5e7eb;">Unit Cost</th>
            <th style="padding:10px;text-align:right;font-size:12px;color:#6b7280;border-bottom:1px solid #e5e7eb;">Amount</th>
          </tr>
        </thead>
        <tbody>${itemRows}</tbody>
      </table>

      <div style="margin-top:14px;padding:12px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;">
        <p style="margin:0 0 4px;font-size:13px;">Subtotal: <strong>INR ${Number(po.subtotal || 0).toLocaleString('en-IN')}</strong></p>
        <p style="margin:0 0 4px;font-size:13px;">GST: <strong>INR ${Number(po.gst || 0).toLocaleString('en-IN')}</strong></p>
        <p style="margin:0;font-size:14px;">PO Total: <strong>INR ${Number(po.total || 0).toLocaleString('en-IN')}</strong></p>
      </div>

      <p style="margin:16px 0 6px;font-size:12px;color:#4b5563;">Please acknowledge this PO and share your delivery confirmation timeline.</p>
      <p style="margin:0;font-size:12px;color:#6b7280;">Issued by ${escapeHtml(storeName)}${settings?.phone ? ` | ${escapeHtml(settings.phone)}` : ''}${settings?.email ? ` | ${escapeHtml(settings.email)}` : ''}</p>
    </div>
  `

  const whatsappLines = [
    `*Purchase Order ${po.displayId}*`,
    `Supplier: ${po.supplier.name}`,
    `PO Date: ${formatDate(po.date)}`,
    `Expected Delivery: ${formatDate(po.expectedDate)}`,
    `Total: INR ${Number(po.total || 0).toLocaleString('en-IN')}`,
    '',
    'Items:',
    ...po.items.map(item => `- ${item.name} (${item.sku}) | Qty ${item.quantity} | INR ${Number(item.amount || 0).toLocaleString('en-IN')}`),
    '',
    `Issued by ${storeName}`,
  ]
  const whatsappText = whatsappLines.join('\n')

  const deliveredChannels: string[] = []
  const channelErrors: string[] = []

  if (hasSupplierEmail && po.supplier.email) {
    const emailResult = await sendEmail({
      to: po.supplier.email,
      subject: `${storeName} | Purchase Order ${po.displayId}`,
      html: emailHtml,
    })

    if (emailResult.success) deliveredChannels.push('Email')
    else channelErrors.push(`Email: ${emailResult.error || 'send failed'}`)
  }

  if (hasWhatsAppSetup && waConfig && supplierPhone) {
    const waResult = await sendSupplierWhatsApp(
      waConfig.phoneNumberId,
      waConfig.apiToken,
      supplierPhone,
      whatsappText
    )
    if (waResult.success) deliveredChannels.push('WhatsApp')
    else channelErrors.push(`WhatsApp: ${waResult.error || 'send failed'}`)
  }

  if (deliveredChannels.length === 0) {
    const reason = channelErrors.length > 0 ? channelErrors.join(' | ') : 'No communication channel available'

    try {
      await prisma.notification.create({
        data: {
          type: 'purchase_order',
          title: `PO ${po.displayId} notification failed`,
          subtitle: `${po.supplier.name} | ${reason}`,
          href: '/purchases',
          metadata: {
            poId: po.id,
            supplierId: po.supplierId,
            source,
          },
        },
      })
    } catch {
      // Notification logging must not block purchase flow.
    }

    return { success: false, error: reason }
  }

  const noteLine = `[SUPPLIER_NOTIFIED ${new Date().toISOString().slice(0, 19).replace('T', ' ')}] ${source === 'approved' ? 'Auto on approval' : 'Manual resend'} via ${deliveredChannels.join(', ')}`

  await prisma.purchaseOrder.update({
    where: { id: po.id },
    data: {
      notes: po.notes ? `${po.notes}\n${noteLine}` : noteLine,
    },
  })

  try {
    await prisma.notification.create({
      data: {
        type: 'purchase_order',
        title: `PO ${po.displayId} sent to supplier`,
        subtitle: `${po.supplier.name} | ${source === 'approved' ? 'Auto on approval' : 'Manually sent'} via ${deliveredChannels.join(', ')}`,
        href: '/purchases',
        metadata: {
          poId: po.id,
          supplierId: po.supplierId,
          source,
          email: po.supplier.email,
          phone: po.supplier.phone,
          channels: deliveredChannels,
          errors: channelErrors,
        },
      },
    })
  } catch {
    // In-app notification is best-effort only.
  }

  return { success: true, message: `PO sent via ${deliveredChannels.join(', ')}` }
}

// ─── SUPPLIERS ───────────────────────────────────────

export async function getSuppliers() {
  await requireAuth()
  const suppliers = await prisma.supplier.findMany({
    orderBy: { name: 'asc' },
    include: {
      _count: { select: { purchaseOrders: true } },
    },
  })
  return { success: true, data: suppliers }
}

export async function createSupplier(data: unknown) {
  try {
  try { await requireRole('ADMIN', 'MANAGER') } catch { return { success: false, error: 'Access denied' } }
  const parsed = createSupplierSchema.safeParse(data)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }

  const supplier = await prisma.supplier.create({ data: parsed.data })
  revalidatePath('/purchases')
  return { success: true, data: supplier }
  } catch (error) { return { success: false, error: inventoryError(error) } }
}

export async function updateSupplier(id: number, data: unknown) {
  try {
  try { await requireRole('ADMIN', 'MANAGER') } catch { return { success: false, error: 'Access denied' } }
  const parsed = createSupplierSchema.safeParse(data)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }

  const supplier = await prisma.supplier.update({ where: { id }, data: parsed.data })
  revalidatePath('/purchases')
  return { success: true, data: supplier }
  } catch (error) { return { success: false, error: inventoryError(error) } }
}

// ─── PURCHASE ORDERS ─────────────────────────────────

export async function getPurchaseOrders() {
  await requireAuth()
  const pos = await prisma.purchaseOrder.findMany({
    orderBy: { date: 'desc' },
    include: {
      supplier: { select: { name: true, phone: true, email: true, contactPerson: true, gstNumber: true, address: true, paymentTerms: true } },
      items: { include: { product: { select: { name: true, sku: true } } } },
      payments: { orderBy: { paidAt: 'desc' } },
    },
  })
  return { success: true, data: pos }
}

export async function createPurchaseOrder(data: unknown) {
  try {
  try { await requireRole('ADMIN', 'MANAGER') } catch { return { success: false, error: 'Access denied' } }
  const parsed = createPurchaseOrderSchema.safeParse(data)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }

  const { supplierId, expectedDate, notes, discount, isRCM, itcEligible, itcCategory, items } = parsed.data

  // Calculate totals
  const bill = calculateBill(items.map(item => ({ ...item, price: item.unitCost })), discount, 'flat')
  const { subtotal, gst, cgst, sgst, total } = bill
  const discountAmt = bill.discount

  // Generate displayId
  const po = await inventoryTransaction(prisma, async tx => {
  const displayId = await nextDocumentId(tx, 'purchaseOrder', 'PO-')
  await validatePurchaseItems(tx, supplierId, items)
  return tx.purchaseOrder.create({
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
      isRCM,
      itcEligible,
      itcCategory,
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

  })
  revalidatePath('/purchases')
  return { success: true, data: po }
  } catch (error) { return { success: false, error: inventoryError(error) } }
}

export async function updatePurchaseOrder(id: number, data: unknown) {
  try {
  try { await requireRole('ADMIN', 'MANAGER') } catch { return { success: false, error: 'Access denied' } }
  const parsed = createPurchaseOrderSchema.safeParse(data)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }

  const existing = await prisma.purchaseOrder.findUnique({
    where: { id },
    include: { items: true },
  })

  if (!existing) return { success: false, error: 'Purchase order not found' }
  if (existing.status !== 'DRAFT') {
    return { success: false, error: 'Only DRAFT purchase orders can be edited' }
  }

  const { supplierId, expectedDate, notes, discount, isRCM, itcEligible, itcCategory, items } = parsed.data

  // Recalculate PO totals from updated line items.
  const bill = calculateBill(items.map(item => ({ ...item, price: item.unitCost })), discount, 'flat')
  const { subtotal, gst, cgst, sgst, total } = bill
  const discountAmt = bill.discount

  if (total < existing.amountPaid) {
    return { success: false, error: 'Updated total cannot be less than amount already paid' }
  }

  const po = await inventoryTransaction(prisma, async (tx) => {
    const current = await lockedPurchase(tx, id)
    if (current.status !== 'DRAFT' || current.amountPaid > total) throw new Error('Purchase order changed; only unpaid-compatible drafts can be edited')
    await validatePurchaseItems(tx, supplierId, items)
    await tx.purchaseOrderItem.deleteMany({ where: { poId: id } })

    return tx.purchaseOrder.update({
      where: { id },
      data: {
        supplierId,
        notes,
        discount: discountAmt,
        subtotal,
        gst,
        cgst,
        sgst,
        total,
        balanceDue: total - current.amountPaid,
        isRCM,
        itcEligible,
        itcCategory,
        expectedDate: expectedDate ? new Date(expectedDate) : null,
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
  })

  revalidatePath('/purchases')
  return { success: true, data: po }
  } catch (error) { return { success: false, error: inventoryError(error) } }
}

export async function approvePurchaseOrder(id: number) {
  try {
  try { await requireRole('ADMIN', 'MANAGER') } catch { return { success: false, error: 'Access denied' } }
  const po = await prisma.purchaseOrder.findUnique({ where: { id } })
  if (!po) return { success: false, error: 'Purchase order not found' }
  if (po.status !== 'DRAFT') return { success: false, error: 'Only DRAFT orders can be approved' }

  await inventoryTransaction(prisma, async tx => {
    const current = await lockedPurchase(tx, id)
    if (current.status !== 'DRAFT') throw new Error('Only draft orders can be approved')
    await tx.purchaseOrder.update({ where: { id }, data: { status: 'APPROVED' } })
  })

  const notifyResult = await notifySupplierForPurchaseOrder(id, 'approved').catch(() => ({ success: false as const, error: 'Notification failed after approval. You can resend it without approving again.', message: undefined }))
  revalidatePath('/purchases')

  if (!notifyResult.success) {
    return {
      success: true,
      warning: `PO approved. Supplier notification failed: ${notifyResult.error}`,
    }
  }

  return {
    success: true,
    message: notifyResult.message || 'PO approved and supplier notified',
  }
  } catch (error) { return { success: false, error: inventoryError(error) } }
}

export async function sendPurchaseOrderToSupplier(id: number) {
  try {
  try { await requireRole('ADMIN', 'MANAGER') } catch { return { success: false, error: 'Access denied' } }

  const po = await prisma.purchaseOrder.findUnique({ where: { id } })
  if (!po) return { success: false, error: 'Purchase order not found' }
  if (po.status === 'CANCELLED') return { success: false, error: 'Cannot send a cancelled purchase order' }

  const notifyResult = await notifySupplierForPurchaseOrder(id, 'manual')
  revalidatePath('/purchases')

  if (!notifyResult.success) return { success: false, error: notifyResult.error }
  return { success: true, message: notifyResult.message }
  } catch (error) { return { success: false, error: inventoryError(error) } }
}

export async function receivePurchaseOrder(id: number) {
  try {
  try { await requireRole('ADMIN', 'MANAGER') } catch { return { success: false, error: 'Access denied' } }

  const po = await prisma.purchaseOrder.findUnique({
    where: { id },
    include: { items: true },
  })
  if (!po) return { success: false, error: 'Purchase order not found' }
  if (!['APPROVED', 'PARTIALLY_RECEIVED'].includes(po.status)) {
    return { success: false, error: 'Order must be approved before receiving' }
  }

  const pendingItems = po.items.filter(item => item.receivedQty < item.quantity)
  if (pendingItems.length === 0) {
    return { success: false, error: 'All items in this order are already received' }
  }

  // Use transaction to update stock for each item
  try {
  await inventoryTransaction(prisma, async (tx) => {
    await tx.$queryRaw`SELECT id FROM "PurchaseOrder" WHERE id = ${id} FOR UPDATE`
    const current = await tx.purchaseOrder.findUnique({ where: { id }, include: { items: true } })
    if (!current || !['APPROVED', 'PARTIALLY_RECEIVED'].includes(current.status)) throw new Error('Purchase order was already received or its status changed')
    await lockProducts(tx, current.items.map(item => item.productId))
    for (const item of current.items) {
      const pendingQty = Math.max(0, item.quantity - item.receivedQty)
      if (pendingQty === 0) continue

      const now = new Date()

      await moveTotalStock(tx, item.productId, pendingQty, 'IN', { referenceType: 'PurchaseOrder', referenceId: id, notes: `Received ${current.displayId}`, createdBy: 'Purchases', batchCostPrice: item.unitCost })
      await tx.product.update({
        where: { id: item.productId },
        data: {
          costPrice: item.unitCost,
          lastRestocked: now,
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
          quantity: pendingQty,
          date: now,
          time: now.toTimeString().split(' ')[0],
        },
      })
    }
    await tx.purchaseOrder.update({
      where: { id },
      data: { status: 'RECEIVED', receivedAt: new Date() },
    })
  })
  } catch (error) { return { success: false, error: inventoryError(error) } }

  revalidatePath('/purchases')
  revalidatePath('/inventory')
  revalidatePath('/godowns')
  return { success: true }
  } catch (error) { return { success: false, error: inventoryError(error) } }
}

export async function recordPurchaseOrderPayment(
  id: number,
  amount: number,
  note?: string,
  method: string = 'Bank Transfer',
  reference?: string,
  paidAt?: string
) {
  try {
  try { await requireRole('ADMIN', 'MANAGER') } catch { return { success: false, error: 'Access denied' } }

  if (!Number.isFinite(amount) || amount <= 0) {
    return { success: false, error: 'Payment amount must be greater than 0' }
  }

  const paymentDate = paidAt ? new Date(paidAt) : new Date()
  if (Number.isNaN(paymentDate.getTime())) {
    return { success: false, error: 'Invalid payment date' }
  }

  wholeMoney(amount, 'Payment')
  const updated = await inventoryTransaction(prisma, tx => payPurchase(tx, { id, amount, method, reference, note, paidAt: paymentDate }))

  revalidatePath('/purchases')
  return { success: true, data: updated }
  } catch (error) { return { success: false, error: inventoryError(error) } }
}

export async function cancelPurchaseOrder(id: number) {
  try {
  try { await requireRole('ADMIN', 'MANAGER') } catch { return { success: false, error: 'Access denied' } }
  await inventoryTransaction(prisma, tx => cancelPurchase(tx, id))
  revalidatePath('/purchases')
  return { success: true }
  } catch (error) { return { success: false, error: inventoryError(error) } }
}

// ─── PURCHASE RETURNS ─────────────────────────────────

export async function getPurchaseReturns() {
  await requireAuth()
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
  try {
  try { await requireRole('ADMIN', 'MANAGER') } catch { return { success: false, error: 'Access denied' } }
  const parsed = createPurchaseReturnSchema.safeParse(data)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }

  const { supplierId, poId, reason, notes, items } = parsed.data
  const totalAmount = items.reduce((sum, i) => sum + i.quantity * i.unitCost, 0)

  wholeMoney(totalAmount, 'Return total')

  // Deduct stock in transaction
  try {
  const ret = await inventoryTransaction(prisma, async (tx) => {
    const displayId = await nextDocumentId(tx, 'purchaseReturn', 'PRN-')
    if (poId) await validateLinkedReturn(tx, supplierId, poId, items)
    await validatePurchaseItems(tx, supplierId, items)
    await lockProducts(tx, items.map(item => item.productId))
    const returned = await tx.purchaseReturn.create({
      data: {
        displayId,
        supplierId,
        poId,
        reason,
        notes,
        totalAmount,
        status: 'Completed',
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
    for (const item of items) {
      const receiptLots = poId ? await tx.batchMovement.findMany({ where: { quantity: { gt: 0 }, stockLedger: { referenceType: 'PurchaseOrder', referenceId: poId, productId: item.productId } }, select: { batchId: true } }) : []
      const lotIds = receiptLots.flatMap(row => row.batchId ? [row.batchId] : [])
      await moveTotalStock(tx, item.productId, -item.quantity, 'OUT', { referenceType: 'PurchaseReturn', referenceId: returned.id, notes: `${returned.displayId}: ${reason}`, createdBy: 'Purchases', ...(lotIds.length ? { onlyBatchIds: lotIds } : {}) })
    }
    return returned
  })

  revalidatePath('/purchases')
  revalidatePath('/inventory')
  revalidatePath('/godowns')
  return { success: true, data: ret }
  } catch (error) { return { success: false, error: inventoryError(error) } }
  } catch (error) { return { success: false, error: inventoryError(error) } }
}

export async function getPurchaseStats() {
  await requireAuth()
  const [totalPOs, totalSpend, pendingPOs, totalSuppliers, overduePOs, outstandingPayables] = await Promise.all([
    prisma.purchaseOrder.count(),
    prisma.purchaseOrder.aggregate({
      where: { status: { in: ['APPROVED', 'RECEIVED', 'PARTIALLY_RECEIVED'] } },
      _sum: { total: true },
    }),
    prisma.purchaseOrder.count({ where: { status: { in: ['DRAFT', 'APPROVED', 'PARTIALLY_RECEIVED'] } } }),
    prisma.supplier.count(),
    prisma.purchaseOrder.count({
      where: {
        expectedDate: { lt: new Date(`${indiaDay()}T00:00:00Z`) },
        status: { in: ['DRAFT', 'APPROVED', 'PARTIALLY_RECEIVED'] },
      },
    }),
    prisma.purchaseOrder.aggregate({
      where: {
        status: { not: 'CANCELLED' },
      },
      _sum: { balanceDue: true },
    }),
  ])

  return {
    success: true,
    data: {
      totalPOs,
      totalSpend: totalSpend._sum.total || 0,
      pendingPOs,
      overduePOs,
      totalSuppliers,
      suppliers: totalSuppliers,
      outstandingPayables: outstandingPayables._sum.balanceDue || 0,
    },
  }
}
