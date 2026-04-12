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
} from '@/lib/validations/custom-order'
import type { CustomOrderStatus } from '@prisma/client'
import { sendEmail } from '@/lib/email'

const statusMap: Record<string, CustomOrderStatus> = {
  'Measurement Scheduled': 'MEASUREMENT_SCHEDULED',
  'Design Phase': 'DESIGN_PHASE',
  'In Production': 'IN_PRODUCTION',
  'Quality Check': 'QUALITY_CHECK',
  'Installation': 'INSTALLATION',
  'Delivered': 'DELIVERED',
}
const statusDisplay: Record<CustomOrderStatus, string> = {
  MEASUREMENT_SCHEDULED: 'Measurement Scheduled',
  DESIGN_PHASE: 'Design Phase',
  IN_PRODUCTION: 'In Production',
  QUALITY_CHECK: 'Quality Check',
  INSTALLATION: 'Installation',
  DELIVERED: 'Delivered',
}

const statusOrder: CustomOrderStatus[] = [
  'MEASUREMENT_SCHEDULED',
  'DESIGN_PHASE',
  'IN_PRODUCTION',
  'QUALITY_CHECK',
  'INSTALLATION',
  'DELIVERED',
]

// ─── GET ALL CUSTOM ORDERS ──────────────────────────────

export async function getCustomOrders() {
  const orders = await prisma.customOrder.findMany({
    include: {
      contact: true,
      assignedStaff: true,
      referenceProduct: { select: { id: true, name: true, sku: true, image: true, price: true } },
      timeline: { orderBy: { date: 'asc' } },
      fieldVisits: {
        include: { staff: { select: { id: true, name: true, role: true } } },
        orderBy: { date: 'desc' },
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
      date: o.date.toISOString().split('T')[0],
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
        date: t.date.toISOString().split('T')[0],
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
        date: fv.date.toISOString().split('T')[0],
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
    })),
  }
}

// ─── CREATE CUSTOM ORDER ────────────────────────────────

export async function createCustomOrder(data: unknown) {
  const parsed = createCustomOrderSchema.safeParse(data)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }

  const {
    customer, phone, address, type, assignedStaffId,
    estimatedDelivery, measurements, referenceProductId, referenceImages,
    materials, color, quotedPrice, advancePaid, productionNotes,
    scheduleVisit, visitDate, visitTime, visitStaffId,
  } = parsed.data

  // Find or create contact
  let contact = await prisma.contact.findFirst({ where: { phone } })
  if (!contact) {
    contact = await prisma.contact.create({ data: { name: customer, phone, address } })
  }

  // Generate display ID using MAX + 1
  const lastOrder = await prisma.customOrder.findFirst({
    orderBy: { id: 'desc' },
    select: { displayId: true },
  })
  let nextNum = 1
  if (lastOrder?.displayId) {
    const match = lastOrder.displayId.match(/CUS-(\d+)/)
    if (match) nextNum = parseInt(match[1]) + 1
  }
  const displayId = `CUS-${String(nextNum).padStart(4, '0')}`

  const now = new Date()

  const order = await prisma.customOrder.create({
    data: {
      displayId,
      contactId: contact.id,
      phone,
      address,
      type,
      assignedStaffId,
      date: now,
      estimatedDelivery: estimatedDelivery ? new Date(estimatedDelivery) : null,
      measurements: measurements || undefined,
      referenceProductId,
      referenceImages: referenceImages || [],
      materials,
      color,
      quotedPrice,
      advancePaid,
      productionNotes,
      timeline: {
        create: {
          date: now,
          event: 'Order Created',
          status: 'done',
          updatedBy: 'Manager',
        },
      },
    },
  })

  // Schedule visit if requested
  if (scheduleVisit && visitDate && visitTime) {
    const visitStaff = visitStaffId || assignedStaffId
    if (visitStaff) {
      const visitDisplayId = `FV-${String(order.id).padStart(3, '0')}-1`
      await prisma.fieldVisit.create({
        data: {
          displayId: visitDisplayId,
          staffId: visitStaff,
          customOrderId: order.id,
          customer,
          address,
          date: now,
          time: visitTime,
          scheduledDate: new Date(visitDate),
          scheduledTime: visitTime,
          status: 'Scheduled',
          type: 'Measurement',
          notes: `Custom order ${displayId} - ${type}`,
        },
      })

      // Add timeline entry for visit scheduling
      await prisma.customOrderTimeline.create({
        data: {
          customOrderId: order.id,
          date: now,
          event: 'Visit Scheduled',
          notes: `Scheduled for ${visitDate} at ${visitTime}`,
          status: 'pending',
          updatedBy: 'Manager',
        },
      })
    }
  }

  revalidatePath('/custom-orders')
  revalidatePath('/staff-portal')
  return { success: true, data: order }
}

// ─── UPDATE STATUS (Manager) ────────────────────────────

export async function updateCustomOrderStatus(id: number, status: string) {
  const dbStatus = statusMap[status]
  if (!dbStatus) return { success: false, error: 'Invalid status' }

  const order = await prisma.customOrder.findUnique({ where: { id } })
  if (!order) return { success: false, error: 'Order not found' }

  const now = new Date()

  await prisma.$transaction([
    prisma.customOrder.update({
      where: { id },
      data: { status: dbStatus },
    }),
    prisma.customOrderTimeline.create({
      data: {
        customOrderId: id,
        date: now,
        event: `Status updated to ${status}`,
        status: 'done',
        updatedBy: 'Manager',
      },
    }),
  ])

  revalidatePath('/custom-orders')
  revalidatePath('/staff-portal')
  return { success: true }
}

// ─── ASSIGN STAFF ───────────────────────────────────────

export async function assignStaff(orderId: number, staffId: number) {
  const staff = await prisma.staff.findUnique({ where: { id: staffId }, select: { name: true } })
  if (!staff) return { success: false, error: 'Staff not found' }

  const now = new Date()

  await prisma.$transaction([
    prisma.customOrder.update({
      where: { id: orderId },
      data: { assignedStaffId: staffId },
    }),
    prisma.customOrderTimeline.create({
      data: {
        customOrderId: orderId,
        date: now,
        event: `Assigned to ${staff.name}`,
        status: 'done',
        updatedBy: 'Manager',
      },
    }),
  ])

  revalidatePath('/custom-orders')
  revalidatePath('/staff-portal')
  return { success: true }
}

// ─── SCHEDULE VISIT (Manager) ───────────────────────────

export async function scheduleVisit(data: unknown) {
  const parsed = scheduleVisitSchema.safeParse(data)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }

  const { customOrderId, staffId, date, time, notes } = parsed.data

  const order = await prisma.customOrder.findUnique({
    where: { id: customOrderId },
    select: { displayId: true, phone: true, address: true, type: true, contact: { select: { name: true } } },
  })
  if (!order) return { success: false, error: 'Order not found' }

  // Count existing visits for this order to generate display ID
  const visitCount = await prisma.fieldVisit.count({ where: { customOrderId } })
  const visitDisplayId = `FV-${String(customOrderId).padStart(3, '0')}-${visitCount + 1}`

  const now = new Date()

  const visit = await prisma.fieldVisit.create({
    data: {
      displayId: visitDisplayId,
      staffId,
      customOrderId,
      customer: order.contact.name,
      address: order.address,
      date: now,
      time,
      scheduledDate: new Date(date),
      scheduledTime: time,
      status: 'Scheduled',
      type: 'Measurement',
      notes: notes || `Custom order ${order.displayId} - ${order.type}`,
    },
  })

  // Also assign the staff to the custom order
  const staff = await prisma.staff.findUnique({ where: { id: staffId }, select: { name: true } })
  await prisma.customOrder.update({
    where: { id: customOrderId },
    data: { assignedStaffId: staffId },
  })

  // Add timeline entry
  await prisma.customOrderTimeline.create({
    data: {
      customOrderId,
      date: now,
      event: `Visit scheduled for ${staff?.name || 'staff'} & assigned to order`,
      notes: `${date} at ${time}`,
      status: 'pending',
      updatedBy: 'Manager',
    },
  })

  revalidatePath('/custom-orders')
  revalidatePath('/staff-portal')
  return { success: true, data: visit }
}

// ─── UPDATE MEASUREMENTS (Manager or Staff) ─────────────

export async function updateMeasurements(data: unknown) {
  const parsed = updateMeasurementsSchema.safeParse(data)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }

  const { customOrderId, measurements } = parsed.data

  await prisma.customOrder.update({
    where: { id: customOrderId },
    data: { measurements },
  })

  await prisma.customOrderTimeline.create({
    data: {
      customOrderId,
      date: new Date(),
      event: 'Measurements updated',
      status: 'done',
      updatedBy: 'Manager',
    },
  })

  revalidatePath('/custom-orders')
  revalidatePath('/staff-portal')
  return { success: true }
}

// ─── UPDATE VISIT (Staff) ───────────────────────────────

export async function updateFieldVisit(data: unknown) {
  const parsed = updateVisitSchema.safeParse(data)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }

  const { visitId, measurements, staffNotes, status, photoUrls } = parsed.data

  const visit = await prisma.fieldVisit.findUnique({
    where: { id: visitId },
    select: { customOrderId: true, staffId: true, photoUrls: true, photos: true },
  })
  if (!visit) return { success: false, error: 'Visit not found' }

  const updateData: Record<string, unknown> = {}
  if (measurements) updateData.measurements = measurements
  if (staffNotes !== undefined) updateData.staffNotes = staffNotes
  if (status) {
    updateData.status = status
    if (status === 'Completed') updateData.completedAt = new Date()
  }
  if (photoUrls) {
    updateData.photoUrls = [...(visit.photoUrls || []), ...photoUrls]
    updateData.photos = (visit.photos || 0) + photoUrls.length
  }

  await prisma.fieldVisit.update({
    where: { id: visitId },
    data: updateData,
  })

  // If visit completed and linked to custom order, update order measurements
  if (status === 'Completed' && visit.customOrderId) {
    const staff = await prisma.staff.findUnique({ where: { id: visit.staffId }, select: { name: true } })

    // Update custom order measurements if provided
    if (measurements) {
      await prisma.customOrder.update({
        where: { id: visit.customOrderId },
        data: { measurements },
      })
    }

    // Add timeline entry
    await prisma.customOrderTimeline.create({
      data: {
        customOrderId: visit.customOrderId,
        date: new Date(),
        event: `Visit completed by ${staff?.name || 'staff'}`,
        notes: staffNotes || (measurements ? 'Measurements recorded' : undefined),
        status: 'done',
        updatedBy: staff?.name || 'Staff',
      },
    })

    // Notify managers about field visit completion
    const order = await prisma.customOrder.findUnique({
      where: { id: visit.customOrderId },
      select: { displayId: true, type: true, contactId: true, contact: { select: { name: true } } },
    })
    const customerName = order?.contact?.name || 'Customer'
    const staffName = staff?.name || 'Staff'
    const orderId = order?.displayId || `#${visit.customOrderId}`
    const hasMeasurements = measurements ? 'Yes' : 'No'

    notifyManagers({
      type: 'field_visit',
      title: `Visit Completed: ${customerName}`,
      subtitle: `${staffName} completed visit for ${orderId}${measurements ? ' — measurements recorded' : ''}`,
      href: '/custom-orders',
      metadata: { visitId, customOrderId: visit.customOrderId, staffId: visit.staffId },
      emailSubject: `✅ Field Visit Completed — ${customerName} (${orderId})`,
      emailHtml: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
          <h2 style="color:#8B4513;border-bottom:2px solid #D4A574;padding-bottom:10px;">✅ Field Visit Completed</h2>
          <table style="width:100%;border-collapse:collapse;margin-top:16px;">
            <tr><td style="padding:8px 12px;font-weight:600;color:#555;width:160px;">Customer</td><td style="padding:8px 12px;">${customerName}</td></tr>
            <tr style="background:#F9F6F3;"><td style="padding:8px 12px;font-weight:600;color:#555;">Order</td><td style="padding:8px 12px;">${orderId}${order?.type ? ` — ${order.type}` : ''}</td></tr>
            <tr><td style="padding:8px 12px;font-weight:600;color:#555;">Completed By</td><td style="padding:8px 12px;">${staffName}</td></tr>
            <tr style="background:#F9F6F3;"><td style="padding:8px 12px;font-weight:600;color:#555;">Measurements Captured</td><td style="padding:8px 12px;">${hasMeasurements}</td></tr>
            ${staffNotes ? `<tr><td style="padding:8px 12px;font-weight:600;color:#555;">Staff Notes</td><td style="padding:8px 12px;">${staffNotes}</td></tr>` : ''}
          </table>
          <p style="margin-top:20px;font-size:13px;color:#888;">Log in to review the visit details and update the order status.</p>
        </div>
      `,
      whatsappText: `✅ *Field Visit Completed*\n\nCustomer: ${customerName}\nOrder: ${orderId}\nCompleted by: ${staffName}\nMeasurements: ${hasMeasurements}${staffNotes ? `\nNotes: ${staffNotes}` : ''}\n\nLog in to review and update order status.`,
    }).catch(err => console.error('[field-visit] Notification failed:', err))
  }

  revalidatePath('/custom-orders')
  revalidatePath('/staff-portal')
  return { success: true }
}

// ─── ADD TIMELINE ENTRY ─────────────────────────────────

export async function addTimelineEntry(data: unknown) {
  const parsed = addTimelineEntrySchema.safeParse(data)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }

  const entry = await prisma.customOrderTimeline.create({
    data: {
      customOrderId: parsed.data.customOrderId,
      date: new Date(parsed.data.date),
      event: parsed.data.event,
      notes: parsed.data.notes,
      status: parsed.data.status,
      updatedBy: parsed.data.updatedBy,
    },
  })

  revalidatePath('/custom-orders')
  revalidatePath('/staff-portal')
  return { success: true, data: entry }
}

// ─── UPDATE REFERENCE IMAGES ────────────────────────────

export async function updateReferenceImages(orderId: number, imageUrls: string[]) {
  const order = await prisma.customOrder.findUnique({ where: { id: orderId }, select: { referenceImages: true } })
  if (!order) return { success: false, error: 'Order not found' }

  await prisma.customOrder.update({
    where: { id: orderId },
    data: { referenceImages: [...order.referenceImages, ...imageUrls] },
  })

  revalidatePath('/custom-orders')
  revalidatePath('/staff-portal')
  return { success: true }
}

// ─── GET STAFF ASSIGNED VISITS ──────────────────────────

export async function getStaffVisits(staffId: number) {
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
  const { staffId, customer, address, type, notes, measurements, photoUrls } = data

  const now = new Date()
  const time = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })

  // Generate displayId
  const count = await prisma.fieldVisit.count({ where: { staffId, customOrderId: null } })
  const displayId = `SV-${staffId}-${count + 1}`

  const visit = await prisma.fieldVisit.create({
    data: {
      displayId,
      staffId,
      customer,
      address,
      date: now,
      time,
      status: 'Completed',
      type,
      notes: notes || null,
      measurements: measurements || undefined,
      photos: photoUrls?.length || 0,
      photoUrls: photoUrls || [],
    },
  })

  revalidatePath('/staff-portal')
  revalidatePath('/staff')
  return { success: true, data: { id: visit.id, displayId: visit.displayId } }
}

// ─── GET SELF VISITS ────────────────────────────────────

export async function getSelfVisits(staffId: number) {
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
}

// ─── UPDATE SELF VISIT PHOTOS ───────────────────────────

export async function updateSelfVisitPhotos(visitId: number, newUrls: string[]) {
  const visit = await prisma.fieldVisit.findUnique({ where: { id: visitId } })
  if (!visit) return { success: false, error: 'Visit not found' }

  await prisma.fieldVisit.update({
    where: { id: visitId },
    data: {
      photoUrls: [...visit.photoUrls, ...newUrls],
      photos: visit.photos + newUrls.length,
    },
  })

  revalidatePath('/staff-portal')
  return { success: true }
}

// ─── SEND PROGRESS NOTIFICATION ────────────────────────────────────

export async function sendProgressNotification(data: {
  orderId: number
  message: string
  channels: ('whatsapp' | 'email')[]
}) {
  const { orderId, message, channels } = data

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
        const phone = order.phone.replace(/\D/g, '')
        const waPhone = phone.startsWith('91') ? phone : `91${phone}`

        // Use approved template if configured, otherwise fall back to text
        // (text only works within 24hr customer service window)
        const templateName = cfg?.templateName
        const statusDisplay: Record<string, string> = {
          MEASUREMENT_SCHEDULED: 'Measurement Scheduled',
          DESIGN_PHASE: 'Design Phase',
          IN_PRODUCTION: 'In Production',
          QUALITY_CHECK: 'Quality Check',
          INSTALLATION: 'Installation',
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
            <h2 style="margin:0;color:#1a1a1a;font-size:20px;">${storeName}</h2>
            <p style="margin:4px 0 0;color:#888;font-size:13px;">Custom Order Update</p>
          </div>
          <div style="background:#f5f3ff;border:1px solid #ede9fe;border-radius:10px;padding:16px 20px;margin-bottom:24px;">
            <p style="margin:0;font-size:13px;color:#5b21b6;font-weight:600;">Order ${order.displayId} — ${statusLabel}</p>
          </div>
          <p style="color:#374151;font-size:15px;line-height:1.6;white-space:pre-line;">${message}</p>
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
}

// ─── GET CUSTOM ORDER STATS ─────────────────────────────

export async function getCustomOrderStats() {
  const orders = await prisma.customOrder.findMany({
    select: { status: true, quotedPrice: true, advancePaid: true },
  })

  const active = orders.filter(o => o.status !== 'DELIVERED').length
  const totalValue = orders.reduce((s, o) => s + (o.quotedPrice || 0), 0)
  const pendingPayment = orders.reduce((s, o) => s + ((o.quotedPrice || 0) - o.advancePaid), 0)
  const measurementsPending = orders.filter(o => o.status === 'MEASUREMENT_SCHEDULED').length
  const inProduction = orders.filter(o => o.status === 'IN_PRODUCTION').length
  const delivered = orders.filter(o => o.status === 'DELIVERED').length

  return {
    success: true,
    data: { active, totalValue, pendingPayment, measurementsPending, inProduction, delivered },
  }
}
