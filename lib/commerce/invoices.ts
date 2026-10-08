import type { Prisma } from '@prisma/client'
import { lockProducts, moveTotalStock } from '../inventory/stock'
import { validateSellableItems } from '../inventory/products'
import { activeStaff, assertId, billingContact, nextDocumentId } from './documents'
import { assertPayment, calculateBill, invoiceBalance, settleTender } from './rules'
import { validateInvoiceIntent, type CreateInvoiceInput, type UpdateInvoiceInput } from '../validations/invoice'

export async function lockedInvoice(tx: Prisma.TransactionClient, id: number) {
  assertId(id)
  await tx.$queryRaw`SELECT id FROM "Invoice" WHERE id = ${id} FOR UPDATE`
  const invoice = await tx.invoice.findUnique({ where: { id }, include: { items: true, payments: true, creditNotes: true } })
  if (!invoice) throw new Error('Invoice not found')
  if (invoice.invoiceStatus !== 'ACTIVE') throw new Error('Only active invoices can be changed')
  return invoice
}

export async function issueInvoiceStock(tx: Prisma.TransactionClient, invoice: { id: number; displayId: string; items: { productId: number; quantity: number }[] }, actor: string) {
  await lockProducts(tx, invoice.items.map(item => item.productId))
  const error = await validateSellableItems(tx, invoice.items.map(item => item.productId))
  if (error) throw new Error(error)
  for (const item of invoice.items) await moveTotalStock(tx, item.productId, -item.quantity, 'OUT', { referenceType: 'Invoice', referenceId: invoice.id, notes: invoice.displayId, createdBy: actor })
}

async function reverseInvoiceStock(tx: Prisma.TransactionClient, id: number, actor: string) {
  // Reverse only net, recorded movements. Never infer old invoices issued stock.
  const ledger = await tx.stockLedger.findMany({ where: { referenceType: 'Invoice', referenceId: id } })
  await lockProducts(tx, ledger.map(row => row.productId))
  const net = new Map<number, number>()
  for (const row of ledger) net.set(row.productId, (net.get(row.productId) || 0) + row.quantity)
  for (const [productId, quantity] of net) if (quantity < 0) await moveTotalStock(tx, productId, -quantity, 'RETURN', { referenceType: 'Invoice', referenceId: id, reverseBatches: true, notes: 'Invoice void/edited stock reversal', createdBy: actor })
}

export async function saveInvoice(tx: Prisma.TransactionClient, input: CreateInvoiceInput | UpdateInvoiceInput, actor: string, id?: number) {
  validateInvoiceIntent(input)
  const current = id ? await lockedInvoice(tx, id) : null
  if (current?.creditNotes.length) throw new Error('Invoices with credit notes cannot be edited; preserve the adjustment history')
  if (current && input.payments?.length) throw new Error('Use the payment action to record payments; invoice edits preserve payment history')
  if (current && input.isHeld && !current.heldAt) throw new Error('An issued invoice cannot become a held bill')
  await activeStaff(tx, input.salespersonId)
  await lockProducts(tx, [...input.items.map(item => item.productId), ...(current?.items.map(item => item.productId) || [])])
  const error = await validateSellableItems(tx, input.items.map(item => item.productId))
  if (error) throw new Error(error)
  const settings = await tx.storeSettings.findUnique({ where: { id: 1 } })
  const supplyType = input.supplyType || 'INTRASTATE'
  const products = await tx.product.findMany({ where: { id: { in: input.items.map(item => item.productId) } } })
  const authoritativeItems = input.items.map(item => {
    const product = products.find(row => row.id === item.productId)!
    return { ...item, name: product.name, sku: product.sku }
  })
  const bill = calculateBill(authoritativeItems, input.discount, input.discountType, settings?.gstRate ?? 18, supplyType === 'INTERSTATE', input.transportCost)
  const payments = current ? current.payments : settleTender(input.payments || [], bill.total)
  const paid = payments.reduce((sum, payment) => sum + payment.amount, 0)
  if (paid > bill.total) throw new Error('Payments exceed the invoice total; resolve payments before reducing the total')
  const contact = await billingContact(tx, input)
  const now = new Date()
  const displayId = current?.displayId ?? await nextDocumentId(tx, 'invoice', (settings?.invoicePrefix || 'INV-').trim() || 'INV-', settings?.invoicePadding ?? 4)
  const cashChange = current ? 0 : Math.max(0, (input.payments || []).reduce((sum, p) => sum + p.amount, 0) - bill.total)
  const data = {
    displayId, contactId: contact.id, subtotal: bill.subtotal, discount: bill.discount, discountType: input.discountType,
    gst: bill.gst, cgst: bill.cgst, sgst: bill.sgst, igst: bill.igst, transportCost: input.transportCost,
    total: bill.total, ...invoiceBalance(bill.total, paid), paymentMethod: current?.paymentMethod || payments[0]?.method || 'Cash',
    supplyType, placeOfSupply: input.placeOfSupply?.trim() || null, dueDate: input.dueDate ? new Date(input.dueDate) : null,
    salespersonId: input.salespersonId ?? null, notes: [input.notes, cashChange ? `POS cash change returned: ${cashChange}` : ''].filter(Boolean).join('\n') || null,
    items: { ...(current ? { deleteMany: {} } : {}), create: bill.rows.map(({ gstAmount: _gstAmount, ...item }) => item) },
  }
  let stockTracked = false
  if (current && !current.heldAt) stockTracked = !!await tx.stockLedger.count({ where: { referenceType: 'Invoice', referenceId: current.id } })
  if (stockTracked) await reverseInvoiceStock(tx, current!.id, actor)
  const invoice = current
    ? await tx.invoice.update({ where: { id: current.id }, data, include: { items: true, payments: true } })
    : await tx.invoice.create({ data: { ...data, date: now, time: now.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: true }), heldAt: input.isHeld ? now : null, payments: { create: payments.map(payment => ({ ...payment, date: now })) } }, include: { items: true, payments: true } })
  if ((!current && !input.isHeld) || stockTracked) await issueInvoiceStock(tx, invoice, actor)
  return invoice
}

export async function addInvoicePayment(tx: Prisma.TransactionClient, data: { invoiceId: number; amount: number; method: string; reference?: string; notes?: string }) {
  const invoice = await lockedInvoice(tx, data.invoiceId)
  if (invoice.heldAt) throw new Error('Finalize the held bill before collecting payment')
  const paid = invoice.payments.reduce((s, p) => s + p.amount, 0)
  const credited = invoice.creditNotes.reduce((s, c) => s + c.amount, 0)
  const balance = invoiceBalance(invoice.total, paid, credited)
  assertPayment(data.amount, balance.balanceDue)
  if (data.reference?.trim() && invoice.payments.some(p => p.method === data.method && p.reference === data.reference!.trim())) throw new Error('This payment reference was already recorded')
  await tx.payment.create({ data: { ...data, reference: data.reference?.trim() || null } })
  return tx.invoice.update({ where: { id: invoice.id }, data: invoiceBalance(invoice.total, paid + data.amount, credited) })
}

export async function voidInvoice(tx: Prisma.TransactionClient, id: number, actor: string) {
  const invoice = await lockedInvoice(tx, id)
  if (invoice.payments.length || invoice.creditNotes.length) throw new Error('A paid/credited invoice cannot be cancelled. Use a credit note to preserve financial history')
  await reverseInvoiceStock(tx, id, actor)
  return tx.invoice.update({ where: { id }, data: { invoiceStatus: 'CANCELLED', balanceDue: 0 } })
}

export async function creditInvoice(tx: Prisma.TransactionClient, data: { invoiceId: number; amount: number; reason: string }) {
  const invoice = await lockedInvoice(tx, data.invoiceId)
  if (invoice.heldAt) throw new Error('Held bills cannot have credit notes')
  const credited = invoice.creditNotes.reduce((sum, note) => sum + note.amount, 0)
  assertPayment(data.amount, invoice.total - credited)
  const displayId = await nextDocumentId(tx, 'creditNote', 'CN-')
  await tx.creditNote.create({ data: { ...data, displayId } })
  return tx.invoice.update({ where: { id: invoice.id }, data: { ...invoiceBalance(invoice.total, invoice.payments.reduce((s, p) => s + p.amount, 0), credited + data.amount), ...(credited + data.amount === invoice.total ? { invoiceStatus: 'REFUNDED' as const } : {}) } })
  // Credit adjusts financial liability only. It is not evidence that physical
  // goods returned; do not manufacture a stock receipt from a money amount.
}

export async function finalizeInvoice(tx: Prisma.TransactionClient, id: number, actor: string) {
  const invoice = await lockedInvoice(tx, id)
  if (!invoice.heldAt) throw new Error('Invoice is not held')
  if (await tx.stockLedger.count({ where: { referenceType: 'Invoice', referenceId: id } })) throw new Error('Held bill has unexpected stock history; review it before finalizing')
  await issueInvoiceStock(tx, invoice, actor)
  return tx.invoice.update({ where: { id }, data: { heldAt: null } })
}
