'use server'

import { prisma } from '@/lib/db'
import { requireAuth, requireRole } from '@/lib/auth-helpers'
import { inventoryError, inventoryTransaction } from '@/lib/inventory/stock'
import { addInvoicePayment, creditInvoice, finalizeInvoice, saveInvoice, voidInvoice } from '@/lib/commerce/invoices'
import { indiaBillingPeriods, indiaDay } from '@/lib/commerce/rules'
import { normalizePhoneForMetaIndia } from '@/lib/whatsapp/phone-utils'
import { revalidatePath } from 'next/cache'
import { createInvoiceSchema, updateInvoiceSchema, recordPaymentSchema, createCreditNoteSchema } from '@/lib/validations/invoice'
import type { InvoiceStatus } from '@prisma/client'
import type { InvoiceSnapshot } from '@/lib/billing/invoice-document'



// ─── GET ALL INVOICES ──────────────────────────────────

export async function getInvoices() {
  await requireAuth()
  const invoices = await prisma.invoice.findMany({
    include: {
      contact: true,
      items: { orderBy: { id: 'asc' } },
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
      customer: (inv.documentSnapshot as InvoiceSnapshot | null)?.buyer.customer ?? inv.contact.name,
      phone: (inv.documentSnapshot as InvoiceSnapshot | null)?.buyer.phone ?? inv.contact.phone,
      email: inv.contact.email,
      address: inv.documentSnapshot ? (inv.documentSnapshot as InvoiceSnapshot).buyer.address : inv.contact.address,
      gstNumber: inv.documentSnapshot ? (inv.documentSnapshot as InvoiceSnapshot).buyer.gstNumber : inv.contact.gstNumber,
      documentSnapshot: inv.documentSnapshot as InvoiceSnapshot | null,
      items: inv.items.map(i => ({
        name: i.name,
        sku: i.sku,
        qty: i.quantity,
        price: i.price,
        hsnCode: i.hsnCode,
        gstRate: i.gstRate,
        taxableAmount: i.taxableAmount,
        cgst: i.cgst,
        sgst: i.sgst,
        igst: i.igst,
        cess: i.cess,
      })),
      subtotal: inv.subtotal,
      discount: inv.discount,
      discountType: inv.discountType,
      gst: inv.gst,
      cgst: inv.cgst,
      sgst: inv.sgst,
      igst: inv.igst,
      cess: inv.cess,
      isRCM: inv.isRCM,
      supplyType: inv.supplyType,
      placeOfSupply: inv.placeOfSupply,
      transportCost: inv.transportCost,
      total: inv.total,
      amountPaid: inv.amountPaid,
      balanceDue: inv.balanceDue,
      paymentMethod: inv.paymentMethod,
      paymentStatus: inv.paymentStatus.charAt(0) + inv.paymentStatus.slice(1).toLowerCase() as 'Paid' | 'Partial' | 'Pending',
      invoiceStatus: inv.invoiceStatus as InvoiceStatus,
      date: indiaDay(inv.date),
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
        date: indiaDay(p.date),
        notes: p.notes,
      })),
      creditNotes: inv.creditNotes.map(cn => ({
        id: cn.id,
        displayId: cn.displayId,
        amount: cn.amount,
        reason: cn.reason,
        date: indiaDay(cn.date),
      })),
    })),
  }
}

// ─── GET SINGLE INVOICE ────────────────────────────────

export async function getInvoice(id: number) {
  await requireAuth()
  const invoice = await prisma.invoice.findUnique({
    where: { id },
    include: {
      contact: true,
      items: { include: { product: true }, orderBy: { id: 'asc' } },
      salesperson: true,
      payments: { orderBy: { date: 'desc' } },
      creditNotes: { orderBy: { date: 'desc' } },
    },
  })
  if (!invoice) return { success: false, error: 'Invoice not found' }
  return { success: true, data: invoice }
}

// ─── CREATE INVOICE ────────────────────────────────────

async function billingAction<T>(roles: ('ADMIN' | 'MANAGER' | 'STAFF')[], operation: (actor: string) => Promise<T>) {
  try {
    const session = await requireRole(...roles)
    const data = await operation(session.user.name)
    for (const path of ['/billing', '/inventory', '/godowns']) revalidatePath(path)
    return { success: true as const, data }
  } catch (error) { return { success: false as const, error: inventoryError(error) } }
}

export async function createInvoice(data: unknown) {
  const parsed = createInvoiceSchema.safeParse(data)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }
  return billingAction(['ADMIN', 'MANAGER', 'STAFF'], actor => inventoryTransaction(prisma, tx => saveInvoice(tx, parsed.data, actor)))
}

export async function updateInvoice(invoiceId: number, data: unknown) {
  const parsed = updateInvoiceSchema.safeParse(data)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }
  return billingAction(['ADMIN'], actor => inventoryTransaction(prisma, tx => saveInvoice(tx, parsed.data, actor, invoiceId)))
}

export async function recordPayment(data: unknown) {
  const parsed = recordPaymentSchema.safeParse(data)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }
  return billingAction(['ADMIN', 'MANAGER', 'STAFF'], () => inventoryTransaction(prisma, tx => addInvoicePayment(tx, parsed.data)))
}

export async function cancelInvoice(invoiceId: number) {
  return billingAction(['ADMIN', 'MANAGER'], actor => inventoryTransaction(prisma, tx => voidInvoice(tx, invoiceId, actor)))
}

export async function createCreditNote(data: unknown) {
  const parsed = createCreditNoteSchema.safeParse(data)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }
  return billingAction(['ADMIN', 'MANAGER'], () => inventoryTransaction(prisma, tx => creditInvoice(tx, parsed.data)))
}

export async function finalizeHeldInvoice(invoiceId: number) {
  return billingAction(['ADMIN', 'MANAGER', 'STAFF'], actor => inventoryTransaction(prisma, tx => finalizeInvoice(tx, invoiceId, actor)))
}

// ─── SEARCH CONTACTS (for auto-complete) ───────────────

export async function searchContacts(query: string) {
  await requireAuth()
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
      address: c.address,
      gstNumber: c.gstNumber,
    })),
  }
}

// ─── GET CUSTOMER PROFILE (returning customer detection) ──

export async function getCustomerProfile(phone: string, contactId?: number) {
  await requireAuth()
  const selectFields = {
    id: true,
    name: true,
    phone: true,
    email: true,
    address: true,
    gstNumber: true,
    invoices: {
      where: { invoiceStatus: 'ACTIVE' as const, heldAt: null },
      select: { total: true, date: true, creditNotes: { select: { amount: true } } },
      orderBy: { date: 'desc' as const },
    },
    orders: {
      where: { status: { not: 'CANCELLED' as const } },
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
    const canonical = normalizePhoneForMetaIndia(phone || '')
    if (canonical.length < 10 || canonical.length > 15) return { success: true, data: null }
    contact = await prisma.contact.findFirst({
      where: { phone: { in: [...new Set([phone, canonical, `+${canonical}`, canonical.startsWith('91') && canonical.length === 12 ? canonical.slice(2) : canonical])] } },
      select: selectFields,
    })
  }

  if (!contact) return { success: true, data: null }

  const totalInvoiceValue = contact.invoices.reduce((s, i) => s + Math.max(0, i.total - i.creditNotes.reduce((n, credit) => n + credit.amount, 0)), 0)
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
      gstNumber: contact.gstNumber,
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
  await requireAuth()
  const { day: today, todayStart, monthStart, lastMonthStart } = indiaBillingPeriods()
  const invoices = await prisma.invoice.findMany({
    where: { invoiceStatus: { not: 'CANCELLED' }, heldAt: null },
    include: { creditNotes: true, payments: true },
  })
  const net = (invoice: typeof invoices[number]) => Math.max(0, invoice.total - invoice.creditNotes.reduce((s, c) => s + c.amount, 0))
  const monthRevenue = invoices.filter(i => i.date >= monthStart).reduce((s, i) => s + net(i), 0)
  const lastMonthRevenue = invoices.filter(i => i.date >= lastMonthStart && i.date < monthStart).reduce((s, i) => s + net(i), 0)
  return {
    success: true,
    data: {
      totalBilled: invoices.reduce((s, i) => s + net(i), 0),
      totalCollected: invoices.reduce((s, i) => s + i.payments.reduce((n, p) => n + p.amount, 0), 0),
      totalPending: invoices.reduce((s, i) => s + i.balanceDue, 0),
      overdueCount: invoices.filter(i => i.balanceDue > 0 && i.dueDate && i.dueDate.toISOString().slice(0, 10) < today).length,
      todayRevenue: invoices.reduce((s, i) => s + i.payments.filter(p => p.date >= todayStart).reduce((n, p) => n + p.amount, 0), 0),
      todayCount: invoices.filter(i => i.date >= todayStart).length,
      monthRevenue,
      monthGrowth: lastMonthRevenue > 0 ? Math.round((monthRevenue - lastMonthRevenue) / lastMonthRevenue * 100) : 0,
      // Credits are liability adjustments, not bank refunds. Surface excess
      // collections so operators can reconcile refunds, never delete payments.
      refundDue: invoices.reduce((s, i) => s + Math.max(0, i.amountPaid - net(i)), 0),
    },
  }
}
