'use server'

import { prisma } from '@/lib/db'
import { revalidatePath } from 'next/cache'
import { notifyManagers } from '@/lib/notify'
import {
  createCustomOrderSchema,
  addTimelineEntrySchema,
  scheduleVisitSchema,
  updateVisitSchema,
  updateMeasurementsSchema,
  type UpdateMeasurementsInput,
  photoUrlsSchema,
} from '@/lib/validations/custom-order'
import type { CustomOrderStatus } from '@prisma/client'
import { sendEmail } from '@/lib/email'
import { requireAuth, requireRole } from '@/lib/auth-helpers'

import { inventoryError, inventoryTransaction } from '@/lib/inventory/stock'
import { activeStaff, assertId, nextDocumentId } from '@/lib/commerce/documents'
import { changeVisit, createCustom, lockedCustomOrder, measureCustom, scheduleCustomVisit, transitionCustom } from '@/lib/commerce/custom-orders'
import { z } from 'zod'
import { normalizePhoneForMetaIndia } from '@/lib/whatsapp/phone-utils'
import { indiaDay } from '@/lib/commerce/rules'

function escapeHtml(value: string) { return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;') }

async function orderEditor() {
  const session = await requireAuth()
  if (!['ADMIN', 'MANAGER'].includes(session.user.role)) {
    if (!session.user.staffId) throw new Error('Access denied')
    await requireStaffPortalScope(session.user.staffId)
  }
  return { actor: session.user.name, staffId: ['ADMIN', 'MANAGER'].includes(session.user.role) ? undefined : session.user.staffId! }
}

const statusMap: Record<string, CustomOrderStatus> = {
  'Measurement Scheduled': 'MEASUREMENT_SCHEDULED',
  'In Production': 'IN_PRODUCTION',
  'Quality Check': 'QUALITY_CHECK',
  'Delivered': 'DELIVERED',
}

const statusDisplay: Record<CustomOrderStatus, string> = {
  MEASUREMENT_SCHEDULED: 'Measurement Scheduled',
  IN_PRODUCTION: 'In Production',
  QUALITY_CHECK: 'Quality Check',
  DELIVERED: 'Delivered',
}

type MeasurementsInput = UpdateMeasurementsInput['measurements']

async function requireStaffPortalScope(staffId: number) {
  const session = await requireAuth()
  if (session.user.role === 'ADMIN' || session.user.role === 'MANAGER') return session
  if (session.user.staffId !== staffId) throw new Error('Forbidden')
  const staff = await prisma.staff.findUnique({ where: { id: staffId }, select: { status: true, user: { select: { isActive: true } } } })
  if (!staff || staff.status !== 'Active' || !staff.user?.isActive) throw new Error('Staff account is inactive')
  return session
}

// ─── GET ALL CUSTOM ORDERS ──────────────────────────────

export async function getCustomOrders() {
  try {
  const session = await requireAuth()
  const manager = ['ADMIN', 'MANAGER'].includes(session.user.role)
  if (!manager && !session.user.staffId) return { success: false, error: 'Access denied', data: [] }
  const orders = await prisma.customOrder.findMany({
    where: manager ? {} : { assignedStaffId: session.user.staffId },
    include: {
      contact: true,
      assignedStaff: true,
      referenceProduct: { select: { id: true, name: true, sku: true, image: true, price: true } },
      timeline: { orderBy: { date: 'asc' } },
      fieldVisits: {
        include: { staff: { select: { id: true, name: true, role: true } } },
        orderBy: { date: 'desc' },
      },
      inventoryItems: {
        include: {
          product: { select: { name: true, sku: true } },
          productionOrder: { select: { displayId: true } },
        },
        orderBy: { createdAt: 'desc' },
      },
    },
    orderBy: { date: 'desc' },
  })

  return {
    success: true,
    data: orders.map(o => ({
      id: o.displayId,
      dbId: o.id,
      customer: o.contact.name,
      phone: o.phone,
      address: o.address,
      type: o.type,
      status: statusDisplay[o.status],
      statusKey: o.status,
      assignedStaff: o.assignedStaff?.name || null,
      assignedStaffId: o.assignedStaffId,
      date: indiaDay(o.date),
      estimatedDelivery: o.estimatedDelivery?.toISOString().split('T')[0] || null,
      measurements: o.measurements,
      photos: o.photos,
      referenceImages: o.referenceImages,
      referenceProduct: o.referenceProduct ? {
        id: o.referenceProduct.id,
        name: o.referenceProduct.name,
        sku: o.referenceProduct.sku,
        image: o.referenceProduct.image,
        price: o.referenceProduct.price,
      } : null,
      materials: o.materials,
      color: o.color,
      quotedPrice: o.quotedPrice,
      advancePaid: o.advancePaid,
      productionNotes: o.productionNotes,
      timeline: o.timeline.map(t => ({
        id: t.id,
        date: indiaDay(t.date),
        event: t.event,
        notes: t.notes,
        status: t.status,
        updatedBy: t.updatedBy,
      })),
      fieldVisits: o.fieldVisits.map(fv => ({
        id: fv.id,
        displayId: fv.displayId,
        staffName: fv.staff.name,
        staffRole: fv.staff.role,
        staffId: fv.staff.id,
        date: indiaDay(fv.date),
        time: fv.time,
        scheduledDate: fv.scheduledDate?.toISOString().split('T')[0] || null,
        scheduledTime: fv.scheduledTime,
        status: fv.status,
        completedAt: fv.completedAt?.toISOString().split('T')[0] || null,
        type: fv.type,
        notes: fv.notes,
        staffNotes: fv.staffNotes,
        measurements: fv.measurements,
        photos: fv.photos,
        photoUrls: fv.photoUrls,
      })),
      // ── Finished goods from production ──
      inventoryItems: o.inventoryItems.map(i => ({
        id: i.id,
        productName: i.product?.name || 'Product',
        productSku: i.product?.sku || '',
        quantity: i.quantity,
        status: i.status,         // READY | DELIVERED | DAMAGED
        unitCost: i.unitCost,
        totalCost: i.totalCost,
        productionOrderId: i.productionOrder?.displayId || null,
        notes: i.notes,
        createdAt: i.createdAt.toISOString().split('T')[0],
      })),
    })),
  }
  } catch (error) { return { success: false, error: inventoryError(error), data: undefined } }
}


// ─── CREATE CUSTOM ORDER ────────────────────────────────

export async function createCustomOrder(data: unknown) {
  try {
  const session = await requireRole('ADMIN', 'MANAGER')
  const parsed = createCustomOrderSchema.safeParse(data)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }
  const order = await inventoryTransaction(prisma, tx => createCustom(tx, parsed.data, session.user.name))
  revalidatePath('/custom-orders'); revalidatePath('/staff-portal')
  return { success: true, data: order }
  } catch (error) { return { success: false, error: inventoryError(error), data: undefined } }
}


// ─── UPDATE STATUS (Manager) ────────────────────────────

export async function updateCustomOrderStatus(id: number, status: string) {
  try {
  const session = await requireRole('ADMIN', 'MANAGER')
  const dbStatus = statusMap[status]
  if (!dbStatus) return { success: false, error: 'Invalid status' }
  await inventoryTransaction(prisma, tx => transitionCustom(tx, id, dbStatus, session.user.name))
  for (const path of ['/custom-orders', '/staff-portal', '/manufacturing']) revalidatePath(path)
  return { success: true }
  } catch (error) { return { success: false, error: inventoryError(error), data: undefined } }
}


// ─── ASSIGN STAFF ───────────────────────────────────────

export async function assignStaff(orderId: number, staffId: number) {
  try {
  const session = await requireRole('ADMIN', 'MANAGER')
  assertId(staffId)
  await inventoryTransaction(prisma, async tx => {
    await lockedCustomOrder(tx, orderId)
    await activeStaff(tx, staffId)
    const staff = await tx.staff.findUniqueOrThrow({ where: { id: staffId } })
    await tx.customOrder.update({ where: { id: orderId }, data: { assignedStaffId: staffId } })
    await tx.customOrderTimeline.create({ data: { customOrderId: orderId, date: new Date(), event: `Assigned to ${staff.name}`, status: 'done', updatedBy: session.user.name } })
  })
  revalidatePath('/custom-orders'); revalidatePath('/staff-portal')
  return { success: true }
  } catch (error) { return { success: false, error: inventoryError(error), data: undefined } }
}


// ─── SCHEDULE VISIT (Manager) ───────────────────────────

export async function scheduleVisit(data: unknown) {
  try {
  const session = await requireRole('ADMIN', 'MANAGER')
  const parsed = scheduleVisitSchema.safeParse(data)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }
  const visit = await inventoryTransaction(prisma, tx => scheduleCustomVisit(tx, parsed.data, session.user.name))
  revalidatePath('/custom-orders'); revalidatePath('/staff-portal')
  return { success: true, data: visit }
  } catch (error) { return { success: false, error: inventoryError(error), data: undefined } }
}


// ─── UPDATE MEASUREMENTS (Manager or Staff) ─────────────

export async function updateMeasurements(data: unknown) {
  try {
  const editor = await orderEditor()
  const parsed = updateMeasurementsSchema.safeParse(data)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }
  await inventoryTransaction(prisma, tx => measureCustom(tx, parsed.data, [], editor.actor, editor.staffId))
  revalidatePath('/custom-orders'); revalidatePath('/staff-portal')
  return { success: true }
  } catch (error) { return { success: false, error: inventoryError(error), data: undefined } }
}


// ─── UPDATE MEASUREMENTS WITH PHOTOS ────────────────────

export async function updateMeasurementsWithPhotos(customOrderId: number, measurements: MeasurementsInput, photoUrls: string[]) {
  try {
  const editor = await orderEditor()
  const parsed = updateMeasurementsSchema.safeParse({ customOrderId, measurements })
  const photos = photoUrlsSchema.safeParse(photoUrls)
  if (!parsed.success || !photos.success) return { success: false, error: 'Invalid measurements or image URLs' }
  await inventoryTransaction(prisma, tx => measureCustom(tx, parsed.data, photos.data, editor.actor, editor.staffId))
  revalidatePath('/custom-orders'); revalidatePath('/staff-portal')
  return { success: true }
  } catch (error) { return { success: false, error: inventoryError(error), data: undefined } }
}


// ─── UPDATE VISIT (Staff) ───────────────────────────────

export async function updateFieldVisit(data: unknown) {
  try {
  const editor = await orderEditor()
  const parsed = updateVisitSchema.safeParse(data)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }
  const visit = await inventoryTransaction(prisma, tx => changeVisit(tx, parsed.data, editor.actor, editor.staffId))
  if (visit.status === 'Completed' && visit.customOrderId) {
    await notifyManagers({
      type: 'field_visit', title: `Visit completed by ${editor.actor}`, subtitle: visit.customer,
      href: '/custom-orders', metadata: { visitId: visit.id, customOrderId: visit.customOrderId, staffId: visit.staffId },
      emailSubject: `Field visit completed — ${visit.customer}`,
      emailHtml: `<p>${escapeHtml(editor.actor)} completed the field visit for ${escapeHtml(visit.customer)}.</p><p>${escapeHtml(visit.staffNotes || '')}</p>`,
      whatsappText: `Field visit completed by ${editor.actor} for ${visit.customer}. Review measurements in Custom Orders.`,
    }).catch(() => console.warn('[field-visit] Notification failed', { visitId: visit.id }))
  }
  revalidatePath('/custom-orders'); revalidatePath('/staff-portal')
  return { success: true }
  } catch (error) { return { success: false, error: inventoryError(error), data: undefined } }
}


// ─── ADD TIMELINE ENTRY ─────────────────────────────────

export async function addTimelineEntry(data: unknown) {
  try {
  const session = await requireRole('ADMIN', 'MANAGER')
  const parsed = addTimelineEntrySchema.safeParse(data)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }
  const entry = await inventoryTransaction(prisma, async tx => {
    await lockedCustomOrder(tx, parsed.data.customOrderId)
    return tx.customOrderTimeline.create({ data: { ...parsed.data, date: new Date(parsed.data.date), updatedBy: session.user.name } })
  })
  revalidatePath('/custom-orders'); revalidatePath('/staff-portal')
  return { success: true, data: entry }
  } catch (error) { return { success: false, error: inventoryError(error), data: undefined } }
}


// ─── UPDATE REFERENCE IMAGES ────────────────────────────

export async function updateReferenceImages(orderId: number, imageUrls: string[]) {
  try {
  const editor = await orderEditor()
  const parsed = photoUrlsSchema.safeParse(imageUrls)
  if (!parsed.success) return { success: false, error: 'Invalid image URLs' }
  await inventoryTransaction(prisma, async tx => {
    const order = await lockedCustomOrder(tx, orderId, editor.staffId)
    await tx.customOrder.update({ where: { id: orderId }, data: { referenceImages: [...new Set([...order.referenceImages, ...parsed.data])] } })
  })
  revalidatePath('/custom-orders'); revalidatePath('/staff-portal')
  return { success: true }
  } catch (error) { return { success: false, error: inventoryError(error), data: undefined } }
}


// ─── GET STAFF ASSIGNED VISITS ──────────────────────────

export async function getStaffVisits(staffId: number) {
  try {
  try { await requireStaffPortalScope(staffId) } catch { return { success: false, error: 'Forbidden', data: [] } }
  const visits = await prisma.fieldVisit.findMany({
    where: { staffId },
    include: {
      customOrder: {
        include: {
          referenceProduct: { select: { id: true, name: true, sku: true, price: true, image: true } },
        },
      },
    },
    orderBy: { scheduledDate: 'asc' },
  })

  return {
    success: true,
    data: visits.map(v => {
      const co = v.customOrder
      return {
        id: v.id,
        displayId: v.displayId,
        customOrderId: v.customOrderId,
        customOrderDisplayId: co?.displayId || null,
        customOrderType: co?.type || null,
        customOrderStatus: co?.status ? statusDisplay[co.status] : null,
        existingMeasurements: co?.measurements || null,
        // Full custom order details
        referenceImages: co?.referenceImages || [],
        referenceProduct: co?.referenceProduct || null,
        materials: co?.materials || null,
        color: co?.color || null,
        quotedPrice: co?.quotedPrice || null,
        advancePaid: co?.advancePaid || 0,
        estimatedDelivery: co?.estimatedDelivery?.toISOString().split('T')[0] || null,
        productionNotes: co?.productionNotes || null,
        orderPhotos: co?.photos || [],
        // Visit fields
        customer: v.customer,
        address: v.address,
        date: v.date.toISOString().split('T')[0],
        time: v.time,
        scheduledDate: v.scheduledDate?.toISOString().split('T')[0] || null,
        scheduledTime: v.scheduledTime,
        status: v.status,
        completedAt: v.completedAt?.toISOString().split('T')[0] || null,
        type: v.type,
        notes: v.notes,
        staffNotes: v.staffNotes,
        measurements: v.measurements,
        photos: v.photos,
        photoUrls: v.photoUrls,
      }
    }),
  }
  } catch (error) { return { success: false, error: inventoryError(error), data: undefined } }
}

// ─── LOG SELF VISIT ─────────────────────────────────────

export async function logSelfVisit(data: {
  staffId: number
  customer: string
  address: string
  type: string
  notes?: string
  measurements?: Record<string, string>
  photoUrls?: string[]
}) {
  try {
  const { staffId, customer, address, type, notes, measurements, photoUrls } = data
  try { await requireStaffPortalScope(staffId) } catch { return { success: false, error: 'Forbidden' } }
  if (!Number.isInteger(staffId) || staffId <= 0 || !customer.trim() || !address.trim() || !type.trim()) {
    return { success: false, error: 'Customer, address and visit type are required' }
  }

  const now = new Date()
  const time = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })

  // Generate displayId
  const validPhotos = photoUrlsSchema.safeParse(photoUrls || [])
  if (!validPhotos.success) return { success: false, error: 'Invalid image URLs' }
  const visit = await inventoryTransaction(prisma, async tx => {
  await activeStaff(tx, staffId)
  const displayId = await nextDocumentId(tx, 'fieldVisit', `SV-${staffId}-`, 1)
  return tx.fieldVisit.create({
    data: {
      displayId,
      staffId,
      customer,
      address,
      date: now,
      time,
      status: 'Completed',
      completedAt: now,
      type,
      notes: notes || null,
      measurements: measurements || undefined,
      photos: photoUrls?.length || 0,
      photoUrls: photoUrls || [],
    },
  })

  })
  revalidatePath('/staff-portal')
  revalidatePath('/staff')
  return { success: true, data: { id: visit.id, displayId: visit.displayId } }
  } catch (error) { return { success: false, error: inventoryError(error), data: undefined } }
}

// ─── GET SELF VISITS ────────────────────────────────────

export async function getSelfVisits(staffId: number) {
  try {
  try { await requireStaffPortalScope(staffId) } catch { return { success: false, error: 'Forbidden', data: [] } }
  const visits = await prisma.fieldVisit.findMany({
    where: { staffId, customOrderId: null },
    orderBy: { date: 'desc' },
  })

  return {
    success: true,
    data: visits.map(v => ({
      id: v.id,
      displayId: v.displayId,
      customer: v.customer,
      address: v.address,
      date: v.date.toISOString().split('T')[0],
      time: v.time,
      status: v.status,
      type: v.type,
      notes: v.notes,
      measurements: v.measurements as Record<string, string> | null,
      photos: v.photos,
      photoUrls: v.photoUrls,
    })),
  }
  } catch (error) { return { success: false, error: inventoryError(error), data: undefined } }
}

// ─── UPDATE SELF VISIT PHOTOS ───────────────────────────

export async function updateSelfVisitPhotos(visitId: number, newUrls: string[]) {
  try {
  const visit = await prisma.fieldVisit.findUnique({ where: { id: visitId } })
  if (!visit) return { success: false, error: 'Visit not found' }
  try { await requireStaffPortalScope(visit.staffId) } catch { return { success: false, error: 'Forbidden' } }
  if (!Array.isArray(newUrls) || newUrls.length === 0 || newUrls.some(url => typeof url !== 'string' || !url)) {
    return { success: false, error: 'Invalid photo upload' }
  }

  const parsed = photoUrlsSchema.safeParse(newUrls)
  if (!parsed.success || visit.customOrderId) return { success: false, error: 'Use the assigned visit update for custom-order visits' }
  await inventoryTransaction(prisma, async tx => {
    await tx.$queryRaw`SELECT id FROM "FieldVisit" WHERE id = ${visitId} FOR UPDATE`
    const current = await tx.fieldVisit.findUniqueOrThrow({ where: { id: visitId } })
    const photos = [...new Set([...current.photoUrls, ...parsed.data])]
    await tx.fieldVisit.update({ where: { id: visitId }, data: { photoUrls: photos, photos: photos.length } })
  })

  revalidatePath('/staff-portal')
  return { success: true }
  } catch (error) { return { success: false, error: inventoryError(error), data: undefined } }
}

// ─── SEND PROGRESS NOTIFICATION ────────────────────────────────────

export async function sendProgressNotification(data: {
  orderId: number
  message: string
  channels: ('whatsapp' | 'email')[]
}) {
  try {
  await requireRole('ADMIN', 'MANAGER')
  const parsed = z.object({ orderId: z.number().int().positive(), message: z.string().trim().min(1).max(2000), channels: z.array(z.enum(['whatsapp', 'email'])).min(1).max(2) }).safeParse(data)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }
  const { orderId, message, channels } = parsed.data

  const order = await prisma.customOrder.findUnique({
    where: { id: orderId },
    select: {
      displayId: true,
      type: true,
      phone: true,
      status: true,
      contact: { select: { name: true, email: true } },
    },
  })
  if (!order) return { success: false, error: 'Order not found' }

  const results: { whatsapp?: string; email?: string } = {}
  const errors: string[] = []

  // ── WhatsApp ────────────────────────────────────────────────────
  if (channels.includes('whatsapp')) {
    try {
      const config = await prisma.channelConfig.findUnique({ where: { channel: 'WhatsApp' } })
      const cfg = config?.config as Record<string, string> | null
      // Settings saves token as 'apiToken' — use that, fall back to 'accessToken' for compatibility
      const token = cfg?.apiToken || cfg?.accessToken
      if (!config?.enabled || !cfg?.phoneNumberId || !token) {
        errors.push('WhatsApp not configured or disabled. Go to Settings → Channels → WhatsApp and enable it with your Phone Number ID and API Token.')
      } else {
        const waPhone = normalizePhoneForMetaIndia(order.phone)

        // Use approved template if configured, otherwise fall back to text
        // (text only works within 24hr customer service window)
        const templateName = cfg?.templateName
        const statusDisplay: Record<string, string> = {
          MEASUREMENT_SCHEDULED: 'Measurement Scheduled',
          IN_PRODUCTION: 'In Production',
          QUALITY_CHECK: 'Quality Check',
          DELIVERED: 'Delivered',
        }
        const statusLabel = statusDisplay[order.status] || order.status

        let body: Record<string, unknown>
        if (templateName) {
          // Template message — works for all outbound (cold) messages
          body = {
            messaging_product: 'whatsapp',
            to: waPhone,
            type: 'template',
            template: {
              name: templateName,
              language: { code: cfg?.templateLanguage || 'en' },
              components: [
                {
                  type: 'body',
                  parameters: [
                    { type: 'text', text: order.contact.name },   // {{1}} customer name
                    { type: 'text', text: order.displayId },       // {{2}} order ID
                    { type: 'text', text: statusLabel },           // {{3}} status
                    { type: 'text', text: message },               // {{4}} custom message
                  ],
                },
              ],
            },
          }
        } else {
          // Free-text fallback — only works if customer messaged you first within 24h
          body = {
            messaging_product: 'whatsapp',
            to: waPhone,
            type: 'text',
            text: { body: message },
          }
        }

        const res = await fetch(
          `https://graph.facebook.com/v19.0/${cfg.phoneNumberId}/messages`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(15000),
          }
        )
        const json = await res.json()
        if (!res.ok) {
          errors.push(`WhatsApp: ${json.error?.message || 'Send failed'} (code ${json.error?.code || res.status})`)
        } else {
          results.whatsapp = json.messages?.[0]?.id || 'sent'
        }
      }
    } catch (e: any) {
      errors.push(`WhatsApp: ${e.message}`)
    }
  }

  // ── Email ───────────────────────────────────────────────────────
  if (channels.includes('email')) {
    const email = order.contact.email
    if (!email) {
      errors.push('Email: no email address on file for this customer')
    } else {
      const settings = await prisma.storeSettings.findFirst({ where: { id: 1 } })
      const storeName = settings?.storeName || 'Furniture Store'
      const statusLabel = statusDisplay[order.status]
      const html = `
        <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;background:#fff;">
          <div style="border-bottom:3px solid #7c3aed;padding-bottom:16px;margin-bottom:24px;">
            <h2 style="margin:0;color:#1a1a1a;font-size:20px;">${escapeHtml(storeName)}</h2>
            <p style="margin:4px 0 0;color:#888;font-size:13px;">Custom Order Update</p>
          </div>
          <div style="background:#f5f3ff;border:1px solid #ede9fe;border-radius:10px;padding:16px 20px;margin-bottom:24px;">
            <p style="margin:0;font-size:13px;color:#5b21b6;font-weight:600;">Order ${order.displayId} — ${statusLabel}</p>
          </div>
          <p style="color:#374151;font-size:15px;line-height:1.6;white-space:pre-line;">${escapeHtml(message)}</p>
          <div style="margin-top:32px;padding-top:16px;border-top:1px solid #e5e7eb;font-size:12px;color:#9ca3af;text-align:center;">
            <p style="margin:0;">This message was sent regarding your custom order from ${storeName}.</p>
          </div>
        </div>
      `
      const res = await sendEmail({
        to: email,
        subject: `Your Order ${order.displayId} Update — ${statusLabel}`,
        html,
      })
      if (!res.success) {
        errors.push(`Email: ${res.error}`)
      } else {
        results.email = res.messageId || 'sent'
      }
    }
  }

  // ── Log to timeline ─────────────────────────────────────────────
  const sentVia = Object.keys(results).join(' & ')
  if (sentVia) {
    await prisma.customOrderTimeline.create({
      data: {
        customOrderId: orderId,
        date: new Date(),
        event: `Customer notified via ${sentVia}`,
        notes: message.length > 120 ? message.slice(0, 117) + '…' : message,
        status: 'done',
        updatedBy: 'Manager',
      },
    })
    revalidatePath('/custom-orders')
  }

  if (errors.length > 0 && !sentVia) {
    return { success: false, error: errors.join('; ') }
  }
  return { success: true, results, errors: errors.length > 0 ? errors : undefined }
  } catch (error) { return { success: false, error: inventoryError(error), data: undefined } }
}

// ─── GET CUSTOM ORDER STATS ─────────────────────────────

export async function getCustomOrderStats() {
  try {
  await requireRole('ADMIN', 'MANAGER')
  const orders = await prisma.customOrder.findMany({
    select: { status: true, quotedPrice: true, advancePaid: true },
  })

  const active = orders.filter(o => o.status !== 'DELIVERED').length
  const totalValue = orders.reduce((s, o) => s + (o.quotedPrice || 0), 0)
  const pendingPayment = orders.reduce((s, o) => s + Math.max(0, (o.quotedPrice || 0) - o.advancePaid), 0)
  const measurementsPending = orders.filter(o => o.status === 'MEASUREMENT_SCHEDULED').length
  const inProduction = orders.filter(o => o.status === 'IN_PRODUCTION').length
  const delivered = orders.filter(o => o.status === 'DELIVERED').length

  return {
    success: true,
    data: { active, totalValue, pendingPayment, measurementsPending, inProduction, delivered },
  }
  } catch (error) { return { success: false, error: inventoryError(error), data: undefined } }
}
