'use server'

import { prisma } from '@/lib/db'
import { revalidatePath } from 'next/cache'
import { createInvoiceSchema, recordPaymentSchema, createCreditNoteSchema } from '@/lib/validations/invoice'
import type { PaymentStatus, InvoiceStatus } from '@prisma/client'

// ─── GET ALL INVOICES ──────────────────────────────────

export async function getInvoices() {
  const invoices = await prisma.invoice.findMany({
    include: {
      contact: true,
      items: true,
      salesperson: true,
      payments: { orderBy: { date: 'desc' } },
      creditNotes: { orderBy: { date: 'desc' } },
    },
    orderBy: { date: 'desc' },
  })

  return {
    success: true,
    data: invoices.map(inv => ({
      id: inv.displayId,
      dbId: inv.id,
      customer: inv.contact.name,
      phone: inv.contact.phone,
      email: inv.contact.email,
      items: inv.items.map(i => ({
        name: i.name,
        sku: i.sku,
        qty: i.quantity,
        price: i.price,
        hsnCode: i.hsnCode,
      })),
      subtotal: inv.subtotal,
      discount: inv.discount,
      discountType: inv.discountType,
      gst: inv.gst,
      cgst: inv.cgst,
      sgst: inv.sgst,
      transportCost: inv.transportCost,
      total: inv.total,
      amountPaid: inv.amountPaid,
      balanceDue: inv.balanceDue,
      paymentMethod: inv.paymentMethod,
      paymentStatus: inv.paymentStatus.charAt(0) + inv.paymentStatus.slice(1).toLowerCase() as 'Paid' | 'Partial' | 'Pending',
      invoiceStatus: inv.invoiceStatus as InvoiceStatus,
      date: inv.date.toISOString().split('T')[0],
      time: inv.time,
      dueDate: inv.dueDate?.toISOString().split('T')[0] || null,
      salesperson: inv.salesperson?.name || null,
      salespersonId: inv.salespersonId,
      notes: inv.notes,
      isHeld: !!inv.heldAt,
      payments: inv.payments.map(p => ({
        id: p.id,
        amount: p.amount,
        method: p.method,
        reference: p.reference,
        date: p.date.toISOString().split('T')[0],
        notes: p.notes,
      })),
      creditNotes: inv.creditNotes.map(cn => ({
        id: cn.id,
        displayId: cn.displayId,
        amount: cn.amount,
        reason: cn.reason,
        date: cn.date.toISOString().split('T')[0],
      })),
    })),
  }
}

// ─── GET SINGLE INVOICE ────────────────────────────────

export async function getInvoice(id: number) {
  const invoice = await prisma.invoice.findUnique({
    where: { id },
    include: {
      contact: true,
      items: { include: { product: true } },
      salesperson: true,
      payments: { orderBy: { date: 'desc' } },
      creditNotes: { orderBy: { date: 'desc' } },
    },
  })
  if (!invoice) return { success: false, error: 'Invoice not found' }
  return { success: true, data: invoice }
}

// ─── CREATE INVOICE ────────────────────────────────────

export async function createInvoice(data: unknown) {
  const parsed = createInvoiceSchema.safeParse(data)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }

  const { customer, phone, items, discount, discountType, payments, salespersonId, notes, dueDate, isHeld, transportCost } = parsed.data

  // Find or create contact
  let contact = await prisma.contact.findFirst({ where: { phone } })
  if (!contact) {
    contact = await prisma.contact.create({ data: { name: customer, phone } })
  } else if (contact.name !== customer) {
    // Update name if changed
    await prisma.contact.update({ where: { id: contact.id }, data: { name: customer } })
  }

  // Get GST rate from store settings (not hardcoded)
  const settings = await prisma.storeSettings.findFirst({ where: { id: 1 } })
  const gstRate = settings?.gstRate ?? 18

  // Calculate totals
  const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0)
  let discountAmount = 0
  if (discountType === 'flat') discountAmount = Math.min(discount, subtotal)
  else if (discountType === 'percent') discountAmount = Math.round(subtotal * discount / 100)

  const taxable = subtotal - discountAmount
  const totalGst = Math.round(taxable * gstRate / 100)
  const cgst = Math.round(totalGst / 2)
  const sgst = totalGst - cgst // avoid rounding issues
  const total = taxable + totalGst + (transportCost || 0)

  // Calculate total payment
  const totalPayment = payments.reduce((sum, p) => sum + p.amount, 0)
  const amountPaid = Math.min(totalPayment, total) // can't overpay
  const balanceDue = total - amountPaid

  // Determine payment status from actual payments
  let paymentStatus: PaymentStatus = 'PENDING'
  if (amountPaid >= total) paymentStatus = 'PAID'
  else if (amountPaid > 0) paymentStatus = 'PARTIAL'

  // Generate display ID using MAX + 1 (avoids race condition with count())
  const lastInvoice = await prisma.invoice.findFirst({
    orderBy: { id: 'desc' },
    select: { displayId: true },
  })
  let nextNum = 1
  if (lastInvoice?.displayId) {
    const match = lastInvoice.displayId.match(/INV-(\d+)/)
    if (match) nextNum = parseInt(match[1]) + 1
  }
  const displayId = `INV-${String(nextNum).padStart(4, '0')}`

  const now = new Date()

  const invoice = await prisma.invoice.create({
    data: {
      displayId,
      contactId: contact.id,
      subtotal,
      discount: discountAmount,
      discountType,
      gst: totalGst,
      cgst,
      sgst,
      transportCost: transportCost || 0,
      total,
      amountPaid,
      balanceDue,
      paymentMethod: payments[0].method, // primary method
      paymentStatus,
      invoiceStatus: 'ACTIVE',
      date: now,
      time: now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }),
      dueDate: dueDate ? new Date(dueDate) : null,
      salespersonId,
      notes,
      heldAt: isHeld ? now : null,
      items: {
        create: items.map(item => ({
          productId: item.productId,
          name: item.name,
          sku: item.sku,
          quantity: item.quantity,
          price: item.price,
          hsnCode: item.hsnCode,
        })),
      },
      payments: {
        create: payments.map(p => ({
          amount: p.amount,
          method: p.method,
          reference: p.reference,
          notes: p.notes,
          date: now,
        })),
      },
    },
    include: { items: true, payments: true },
  })

  revalidatePath('/billing')
  return { success: true, data: invoice }
}

// ─── RECORD ADDITIONAL PAYMENT ─────────────────────────

export async function recordPayment(data: unknown) {
  const parsed = recordPaymentSchema.safeParse(data)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }

  const { invoiceId, amount, method, reference, notes } = parsed.data

  const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId } })
  if (!invoice) return { success: false, error: 'Invoice not found' }
  if (invoice.invoiceStatus !== 'ACTIVE') return { success: false, error: 'Cannot add payment to cancelled/refunded invoice' }

  const maxPayable = invoice.balanceDue
  if (maxPayable <= 0) return { success: false, error: 'Invoice is already fully paid' }

  const paymentAmount = Math.min(amount, maxPayable)
  const newAmountPaid = invoice.amountPaid + paymentAmount
  const newBalanceDue = invoice.total - newAmountPaid

  let paymentStatus: PaymentStatus = 'PARTIAL'
  if (newBalanceDue <= 0) paymentStatus = 'PAID'

  await prisma.$transaction([
    prisma.payment.create({
      data: {
        invoiceId,
        amount: paymentAmount,
        method,
        reference,
        notes,
      },
    }),
    prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        amountPaid: newAmountPaid,
        balanceDue: newBalanceDue,
        paymentStatus,
      },
    }),
  ])

  revalidatePath('/billing')
  return { success: true }
}

// ─── CANCEL INVOICE ────────────────────────────────────

export async function cancelInvoice(invoiceId: number) {
  const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId } })
  if (!invoice) return { success: false, error: 'Invoice not found' }
  if (invoice.invoiceStatus !== 'ACTIVE') return { success: false, error: 'Invoice is already cancelled or refunded' }

  await prisma.invoice.update({
    where: { id: invoiceId },
    data: { invoiceStatus: 'CANCELLED' },
  })

  revalidatePath('/billing')
  return { success: true }
}

// ─── CREATE CREDIT NOTE ────────────────────────────────

export async function createCreditNote(data: unknown) {
  const parsed = createCreditNoteSchema.safeParse(data)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }

  const { invoiceId, amount, reason } = parsed.data

  const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId } })
  if (!invoice) return { success: false, error: 'Invoice not found' }
  if (invoice.invoiceStatus !== 'ACTIVE') return { success: false, error: 'Cannot create credit note for cancelled invoice' }

  // Generate credit note display ID
  const lastCN = await prisma.creditNote.findFirst({
    orderBy: { id: 'desc' },
    select: { displayId: true },
  })
  let nextNum = 1
  if (lastCN?.displayId) {
    const match = lastCN.displayId.match(/CN-(\d+)/)
    if (match) nextNum = parseInt(match[1]) + 1
  }
  const displayId = `CN-${String(nextNum).padStart(4, '0')}`

  await prisma.creditNote.create({
    data: { displayId, invoiceId, amount, reason },
  })

  // If credit note covers the full invoice, mark as refunded
  const allCredits = await prisma.creditNote.findMany({ where: { invoiceId } })
  const totalCredited = allCredits.reduce((sum, cn) => sum + cn.amount, 0)
  if (totalCredited >= invoice.total) {
    await prisma.invoice.update({
      where: { id: invoiceId },
      data: { invoiceStatus: 'REFUNDED' },
    })
  }

  revalidatePath('/billing')
  return { success: true }
}

// ─── FINALIZE HELD BILL ────────────────────────────────

export async function finalizeHeldInvoice(invoiceId: number) {
  const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId } })
  if (!invoice) return { success: false, error: 'Invoice not found' }
  if (!invoice.heldAt) return { success: false, error: 'Invoice is not held' }

  await prisma.invoice.update({
    where: { id: invoiceId },
    data: { heldAt: null },
  })

  revalidatePath('/billing')
  return { success: true }
}

// ─── SEARCH CONTACTS (for auto-complete) ───────────────

export async function searchContacts(query: string) {
  if (!query || query.length < 2) return { success: true, data: [] }

  const contacts = await prisma.contact.findMany({
    where: {
      OR: [
        { name: { contains: query, mode: 'insensitive' } },
        { phone: { contains: query } },
      ],
    },
    take: 10,
    orderBy: { updatedAt: 'desc' },
  })

  return {
    success: true,
    data: contacts.map(c => ({
      id: c.id,
      name: c.name,
      phone: c.phone,
      email: c.email,
    })),
  }
}

// ─── GET CUSTOMER PROFILE (returning customer detection) ──

export async function getCustomerProfile(phone: string, contactId?: number) {
  const selectFields = {
    id: true,
    name: true,
    phone: true,
    email: true,
    address: true,
    invoices: {
      where: { invoiceStatus: 'ACTIVE' as const },
      select: { total: true, date: true },
      orderBy: { date: 'desc' as const },
    },
    orders: {
      select: { amount: true, date: true },
      orderBy: { date: 'desc' as const },
    },
    customOrders: {
      select: { quotedPrice: true, date: true },
      orderBy: { date: 'desc' as const },
    },
  }

  let contact

  // If we have a direct contact ID (selected from autocomplete), use it — no ambiguity
  if (contactId) {
    contact = await prisma.contact.findUnique({ where: { id: contactId }, select: selectFields })
  } else {
    // Fallback: lookup by phone (last 10 digits) — used when phone is typed directly
    const phoneSuffix = phone?.replace(/\D/g, '').slice(-10) || ''
    if (phoneSuffix.length < 6) return { success: true, data: null }
    contact = await prisma.contact.findFirst({
      where: { phone: { contains: phoneSuffix } },
      select: selectFields,
    })
  }

  if (!contact) return { success: true, data: null }

  const totalInvoiceValue = contact.invoices.reduce((s, i) => s + i.total, 0)
  const totalOrderValue   = contact.orders.reduce((s, o) => s + o.amount, 0)
  const totalCustomValue  = contact.customOrders.reduce((s, c) => s + (c.quotedPrice || 0), 0)

  const allDates = [
    ...contact.invoices.map(i => i.date),
    ...contact.orders.map(o => o.date),
    ...contact.customOrders.map(c => c.date),
  ]
  const lastPurchaseDate = allDates.length > 0
    ? new Date(Math.max(...allDates.map(d => d.getTime())))
    : null

  return {
    success: true,
    data: {
      id: contact.id,
      name: contact.name,
      phone: contact.phone,
      email: contact.email,
      address: contact.address,
      invoiceCount: contact.invoices.length,
      orderCount: contact.orders.length,
      customOrderCount: contact.customOrders.length,
      totalInvoiceValue,
      totalOrderValue,
      totalCustomValue,
      lifetimeValue: totalInvoiceValue + totalOrderValue + totalCustomValue,
      lastPurchaseDate: lastPurchaseDate?.toISOString() || null,
    },
  }
}

// ─── GET INVOICE STATS ─────────────────────────────────

export async function getInvoiceStats() {
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59)

  const [allInvoices, todayInvoices, monthInvoices, lastMonthInvoices] = await Promise.all([
    prisma.invoice.findMany({
      where: { invoiceStatus: 'ACTIVE' },
      select: { total: true, amountPaid: true, balanceDue: true, paymentStatus: true },
    }),
    prisma.invoice.findMany({
      where: { invoiceStatus: 'ACTIVE', date: { gte: todayStart } },
      select: { total: true, amountPaid: true },
    }),
    prisma.invoice.findMany({
      where: { invoiceStatus: 'ACTIVE', date: { gte: monthStart } },
      select: { total: true, amountPaid: true },
    }),
    prisma.invoice.findMany({
      where: { invoiceStatus: 'ACTIVE', date: { gte: lastMonthStart, lte: lastMonthEnd } },
      select: { total: true },
    }),
  ])

  const totalBilled = allInvoices.reduce((s, i) => s + i.total, 0)
  const totalCollected = allInvoices.reduce((s, i) => s + i.amountPaid, 0)
  const totalPending = allInvoices.reduce((s, i) => s + i.balanceDue, 0)
  const overdueCount = allInvoices.filter(i => i.paymentStatus !== 'PAID' && i.balanceDue > 0).length

  const todayRevenue = todayInvoices.reduce((s, i) => s + i.amountPaid, 0)
  const todayCount = todayInvoices.length

  const monthRevenue = monthInvoices.reduce((s, i) => s + i.total, 0)
  const lastMonthRevenue = lastMonthInvoices.reduce((s, i) => s + i.total, 0)
  const monthGrowth = lastMonthRevenue > 0 ? Math.round(((monthRevenue - lastMonthRevenue) / lastMonthRevenue) * 100) : 0

  return {
    success: true,
    data: {
      totalBilled,
      totalCollected,
      totalPending,
      overdueCount,
      todayRevenue,
      todayCount,
      monthRevenue,
      monthGrowth,
    },
  }
}
