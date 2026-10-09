import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Prisma, PrismaClient } from '@prisma/client'
import { assertCustomTransition, assertPayment, assertReturn, calculateBill, dueCalendarCutoff, indiaBillingPeriods, indiaDay, invoiceBalance, settleTender, validVisitTime } from './rules'
import { nextDocumentId } from './documents'
import { addInvoicePayment, creditInvoice, finalizeInvoice, saveInvoice, voidInvoice } from './invoices'
import { cancelPurchase, payPurchase, validateLinkedReturn } from './purchases'
import { changeVisit, createCustom, transitionCustom } from './custom-orders'
import { assertNoOpenFollowUp, lockedFollowUp } from './follow-ups'
import { inventoryTransaction } from '../inventory/stock'
import { parseFollowUpIntent } from '../follow-up-intent'
import { daysUntil } from '../follow-ups'
import { isCompatibleReminderTemplate, shouldRearmReminder } from './reminders'
import { runReminderSweep } from './reminder-sweep'
import { createInvoiceSchema, recordPaymentSchema, validateInvoiceIntent } from '../validations/invoice'
import { createPurchaseOrderSchema } from '../validations/purchase'
import { createCustomOrderSchema } from '../validations/custom-order'
import type { InvoiceSnapshot } from '../billing/invoice-document'

// In-memory transaction fixture only. Never imports lib/db or connects to a
// DATABASE_URL, Redis, Meta, SMTP or a live customer account.
function fixture(stock = 10) {
  const tables: Record<string, any[]> = {
    invoice: [], invoiceItem: [], payment: [], creditNote: [], contact: [],
    purchaseOrder: [], purchaseOrderItem: [], purchasePayment: [], purchaseReturn: [], purchaseReturnItem: [],
    customOrder: [], customOrderTimeline: [], customOrderInventory: [], productionOrder: [], fieldVisit: [],
    followUpEntry: [], stockLedger: [], batchMovement: [], productBatch: [],
    product: [{ id: 1, name: 'Chair', sku: 'C1', stock, costPrice: 50, category: { name: 'Furniture' } }],
    godown: [{ id: 1, name: 'Main', isDefault: true }], godownStock: [{ id: 1, productId: 1, godownId: 1, quantity: stock }],
    hsnCode: [], staff: [{ id: 1, name: 'Worker', status: 'Active' }], storeSettings: [{ id: 1, gstRate: 0, invoicePrefix: 'INV-', invoicePadding: 4 }],
  }
  let state = tables
  let failTimeline = false
  const modelNames = Object.keys(tables)
  const relations = (model: string, row: any) => {
    if (model === 'invoice') return { ...row, items: state.invoiceItem.filter(i => i.invoiceId === row.id), payments: state.payment.filter(i => i.invoiceId === row.id), creditNotes: state.creditNote.filter(i => i.invoiceId === row.id) }
    if (model === 'purchaseOrder') return { ...row, items: state.purchaseOrderItem.filter(i => i.poId === row.id), payments: state.purchasePayment.filter(i => i.poId === row.id) }
    if (model === 'purchaseReturn') return { ...row, items: state.purchaseReturnItem.filter(i => i.returnId === row.id) }
    if (model === 'batchMovement') return { ...row, batch: state.productBatch.find(i => i.id === row.batchId), stockLedger: state.stockLedger.find(i => i.id === row.stockLedgerId) }
    return row
  }
  const match = (row: any, where: any = {}): boolean => Object.entries(where).every(([key, value]: [string, any]) => {
    if (key === 'OR') return value.some((w: any) => match(row, w))
    if (key === 'AND') return value.every((w: any) => match(row, w))
    if (key === 'productId_godownId') return match(row, value)
    if (value && typeof value === 'object' && !(value instanceof Date)) {
      if ('in' in value) return value.in.includes(row[key])
      if ('not' in value) return row[key] !== value.not
      if ('gt' in value) return row[key] > value.gt
      if ('lt' in value) return row[key] < value.lt
      if ('lte' in value) return row[key] <= value.lte
      if ('startsWith' in value) return row[key]?.startsWith(value.startsWith)
      return match(row[key] || {}, value)
    }
    return value instanceof Date ? row[key] instanceof Date && row[key].getTime() === value.getTime() : row[key] === value
  })
  const api: any = { $queryRaw: async () => [] }
  const defaults = (model: string) => model === 'invoice' ? { invoiceStatus: 'ACTIVE', heldAt: null } : model === 'customOrder' ? { status: 'MEASUREMENT_SCHEDULED', photos: [], referenceImages: [] } : model === 'fieldVisit' ? { photoUrls: [], photos: 0, completedAt: null, customOrderId: null } : {}
  const apply = (row: any, data: any, model: string) => {
    for (const [key, value] of Object.entries(data) as [string, any][]) {
      if (key === 'items' && model === 'invoice') {
        if (value.deleteMany) state.invoiceItem = state.invoiceItem.filter(i => i.invoiceId !== row.id)
        for (const item of value.create || []) api.invoiceItem.create({ data: { ...item, invoiceId: row.id } })
      } else if (key === 'payments' && model === 'invoice') {
        for (const payment of value.create || []) api.payment.create({ data: { ...payment, invoiceId: row.id } })
      } else if (key === 'timeline' && model === 'customOrder') {
        for (const entry of Array.isArray(value.create) ? value.create : [value.create]) api.customOrderTimeline.create({ data: { ...entry, customOrderId: row.id } })
      } else if (value && typeof value === 'object' && ('increment' in value || 'decrement' in value)) row[key] = (row[key] || 0) + (value.increment || 0) - (value.decrement || 0)
      else row[key] = value
    }
    return structuredClone(relations(model, row))
  }
  for (const model of modelNames) api[model] = {
    findMany: async ({ where }: any = {}) => structuredClone(state[model].map(row => relations(model, row)).filter(row => match(row, where))),
    findFirst: async ({ where }: any = {}) => structuredClone(state[model].map(row => relations(model, row)).find(row => match(row, where)) || null),
    findUnique: async ({ where }: any) => structuredClone(state[model].map(row => relations(model, row)).find(row => match(row, where)) || null),
    findUniqueOrThrow: async ({ where }: any) => { const row = state[model].map(row => relations(model, row)).find(row => match(row, where)); if (!row) throw new Error('Not found'); return structuredClone(row) },
    count: async ({ where }: any = {}) => state[model].map(row => relations(model, row)).filter(row => match(row, where)).length,
    aggregate: async ({ where, _sum }: any) => ({ _sum: Object.fromEntries(Object.keys(_sum).map(key => [key, state[model].filter(row => match(row, where)).reduce((sum, row) => sum + (row[key] || 0), 0)])) }),
    create: ({ data }: any) => { if (model === 'customOrderTimeline' && failTimeline) throw new Error('Simulated timeline failure'); const row = { id: Math.max(0, ...state[model].map(r => r.id)) + 1, ...defaults(model) }; state[model].push(row); return apply(row, data, model) },
    update: async ({ where, data }: any) => { const row = state[model].find(row => match(row, where)); if (!row) throw new Error('Not found'); return apply(row, data, model) },
    updateMany: async ({ where, data }: any) => { const rows = state[model].filter(row => match(row, where)); for (const row of rows) apply(row, data, model); return { count: rows.length } },
    upsert: async ({ where, create, update }: any) => { const row = state[model].find(row => match(row, where)); return row ? apply(row, update, model) : api[model].create({ data: create }) },
  }
  const db = { $transaction: async (operation: (tx: Prisma.TransactionClient) => Promise<any>) => { const backup = structuredClone(state); try { return await operation(api) } catch (error) { state = backup; throw error } } } as unknown as PrismaClient
  return { db, tx: api as Prisma.TransactionClient, state: () => state, failTimeline: () => { failTimeline = true } }
}

const billInput = (extra: Record<string, unknown> = {}) => createInvoiceSchema.parse({ customer: 'Buyer', phone: '9876543210', items: [{ productId: 1, name: 'Client supplied name', sku: 'Client SKU', quantity: 2, price: 100 }], payments: [], ...extra })
const purchase = (extra: Record<string, unknown> = {}) => ({ id: 1, displayId: 'PO-0001', status: 'APPROVED', supplierId: 1, total: 100, amountPaid: 0, balanceDue: 100, ...extra })

test('discount allocation reconciles tiny lines without negative taxable amounts', () => {
  for (let count = 1; count <= 20; count++) for (let discount = 0; discount <= count; discount++) {
    const bill = calculateBill(Array.from({ length: count }, () => ({ quantity: 1, price: 1, gstRate: 18 })), discount, 'flat')
    assert.equal(bill.rows.reduce((s, r) => s + r.taxableAmount, 0), count - discount)
    assert.ok(bill.rows.every(row => row.taxableAmount >= 0 && row.taxableAmount <= 1))
  }
  assert.throws(() => calculateBill([{ quantity: 1, price: 100 }], 101, 'percent'), /100/)
})

test('mixed GST, zero GST, interstate and freight share the same rounding', () => {
  const bill = calculateBill([{ quantity: 1, price: 100, gstRate: 0 }, { quantity: 1, price: 100, gstRate: 18 }], 20, 'flat', 18, true, 10)
  assert.equal(bill.total, 206); assert.equal(bill.igst, 16); assert.equal(bill.cgst + bill.sgst, 0)
  const full = calculateBill([{ quantity: 2, price: 100 }], 100, 'percent')
  assert.equal(full.total, 0)
})

test('financial totals preserve actual payments, net credits, and reject overpayment', () => {
  assert.deepEqual(invoiceBalance(100, 30, 20), { amountPaid: 30, balanceDue: 50, paymentStatus: 'PARTIAL' })
  assert.equal(invoiceBalance(100, 100, 50).amountPaid, 100)
  assert.equal(invoiceBalance(100, 100, 50).balanceDue, 0)
  assert.throws(() => invoiceBalance(100, 0, 101))
  for (const amount of [0, -1, 1.5, Infinity, 101]) assert.throws(() => assertPayment(amount, 100))
})

test('schemas reject fractional quantities/money/IDs and impossible dates', () => {
  assert.equal(recordPaymentSchema.safeParse({ invoiceId: 1, amount: 1.5, method: 'Cash' }).success, false)
  assert.equal(createInvoiceSchema.safeParse({ ...billInput(), dueDate: '2026-02-30' }).success, false)
  assert.equal(createInvoiceSchema.safeParse({ ...billInput(), items: [{ productId: 0.5, name: 'X', sku: 'X', quantity: 1, price: 10 }] }).success, false)
  const item = { productId: 1, name: 'Chair', sku: 'C1', quantity: 1, unitCost: 10 }
  assert.equal(createPurchaseOrderSchema.safeParse({ supplierId: 1, items: [item, item] }).success, false)
  assert.equal(createPurchaseOrderSchema.safeParse({ supplierId: 1, items: [{ ...item, gstRate: 101 }] }).success, false)
})

test('held bill intent requires no fake zero or actual payment', () => {
  assert.doesNotThrow(() => validateInvoiceIntent(billInput({ isHeld: true })))
  assert.throws(() => validateInvoiceIntent(billInput({ isHeld: true, payments: [{ amount: 10, method: 'Cash' }] })), /Held/)
})

test('India business dates and billing month boundaries are independent of host timezone', () => {
  const now = new Date('2026-09-30T19:00:00Z')
  assert.equal(indiaDay(now), '2026-10-01')
  assert.equal(dueCalendarCutoff(now).toISOString(), '2026-10-01T23:59:59.999Z')
  const periods = indiaBillingPeriods(now)
  assert.equal(periods.monthStart.toISOString(), '2026-09-30T18:30:00.000Z')
  assert.equal(periods.lastMonthStart.toISOString(), '2026-08-31T18:30:00.000Z')
  assert.equal(daysUntil(new Date('2026-10-01'), now), 0)
})

test('chat follow-up intent resolves UTC calendar dates using India today and clamped months', () => {
  assert.equal(parseFollowUpIntent('call tomorrow', new Date('2026-09-30T19:00:00Z')).date?.toISOString(), '2026-10-02T00:00:00.000Z')
  assert.equal(parseFollowUpIntent('contact next month', new Date('2028-01-31T10:00:00Z')).date?.toISOString(), '2028-02-29T00:00:00.000Z')
  assert.equal(parseFollowUpIntent('I called yesterday').matched, false)
})

test('numbering uses maximum suffix rather than row ID/count and accepts nonnumeric legacy IDs', async () => {
  const f = fixture(); f.state().invoice.push({ id: 1, displayId: 'INV-0100' }, { id: 20, displayId: 'INV-0002' }, { id: 21, displayId: 'INV-archived' })
  assert.equal(await nextDocumentId(f.tx, 'invoice', 'INV-'), 'INV-0101')
})

test('new POS sale persists authoritative item identities and deducts physical stock atomically', async () => {
  const f = fixture()
  const invoice = await inventoryTransaction(f.db, tx => saveInvoice(tx, billInput(), 'Cashier'))
  assert.equal(invoice.items[0].name, 'Chair'); assert.equal(invoice.items[0].sku, 'C1')
  assert.equal(f.state().product[0].stock, 8)
  assert.equal(f.state().stockLedger[0].quantity, -2)
  assert.equal(f.state().invoice[0].balanceDue, 200)
  assert.equal(f.state().payment.length, 0)
})

test('new invoice snapshots preserve buyer/seller/units without copying SMTP secrets', async () => {
  const f = fixture(); Object.assign(f.state().storeSettings[0], { storeName: 'Original Seller', smtpPass: 'secret-not-for-invoices' });
  f.state().product[0].unitOfMeasure = 'PCS';
  const inv = await inventoryTransaction(f.db, tx => saveInvoice(tx, billInput({ deliveryAddress: 'Delivery location' }), 'Cashier'));
  const snapshot = inv.documentSnapshot as unknown as InvoiceSnapshot;
  assert.equal(snapshot.buyer.customer, 'Buyer');
  assert.deepEqual(snapshot.units, ['PCS']);
  assert.equal(snapshot.deliveryAddress, 'Delivery location');
  assert.ok(!JSON.stringify(inv.documentSnapshot).includes('secret-not-for-invoices'));
  f.state().storeSettings[0].storeName = 'Changed Seller';
  await inventoryTransaction(f.db, tx => saveInvoice(tx, billInput({ customer: 'Updated buyer' }), 'Cashier', inv.id));
  assert.equal(f.state().invoice[0].documentSnapshot.seller.storeName, 'Original Seller');
  assert.equal(f.state().invoice[0].documentSnapshot.buyer.customer, 'Updated buyer');
});

test('registered seller supply-state mismatches roll back without touching existing records', async () => {
  const f = fixture(); f.state().storeSettings[0].gstNumber = '10ABCDE1234F1Z5';
  await assert.rejects(inventoryTransaction(f.db, tx => saveInvoice(tx, billInput({ supplyType: 'INTRASTATE', placeOfSupply: 'Maharashtra' }), 'Cashier')), /Supply type/);
  assert.equal(f.state().invoice.length, 0); assert.equal(f.state().contact.length, 0); assert.equal(f.state().product[0].stock, 10);
  await assert.rejects(inventoryTransaction(f.db, tx => saveInvoice(tx, billInput(), 'Cashier')), /place-of-supply/);
});

test('missing item HSN/rate uses the product and HSN master without replacing explicit zero GST', async () => {
  const f = fixture(); f.state().product[0].hsnCode = '9401'; f.state().hsnCode.push({ code: '9401', gstRate: 12 });
  const inv = await inventoryTransaction(f.db, tx => saveInvoice(tx, billInput(), 'Cashier'));
  assert.equal(inv.items[0].hsnCode, '9401'); assert.equal(inv.items[0].gstRate, 12); assert.equal(inv.gst, 24);
  const zero = await inventoryTransaction(f.db, tx => saveInvoice(tx, billInput({ items: [{ productId: 1, name: 'X', sku: 'X', quantity: 1, price: 100, gstRate: 0 }] }), 'Cashier'));
  assert.equal(zero.gst, 0); assert.equal(zero.items[0].gstRate, 0);
});

test('cess-bearing HSN cannot silently create an invoice without its tax', async () => {
  const f = fixture(); f.state().product[0].hsnCode = '9401'; f.state().hsnCode.push({ code: '9401', gstRate: 18, cessRate: 1 });
  await assert.rejects(inventoryTransaction(f.db, tx => saveInvoice(tx, billInput(), 'Cashier')), /requires cess/);
  assert.equal(f.state().invoice.length, 0); assert.equal(f.state().product[0].stock, 10);
});

test('specialised legacy taxes are preserved instead of rewritten through standard POS', async () => {
  const f = fixture(); const inv = await inventoryTransaction(f.db, tx => saveInvoice(tx, billInput(), 'Cashier'));
  f.state().invoice[0].isRCM = true;
  const before = structuredClone(f.state());
  await assert.rejects(inventoryTransaction(f.db, tx => saveInvoice(tx, billInput(), 'Cashier', inv.id)), /specialised GST invoice/);
  assert.deepEqual(f.state(), before);
});

test('registered held bill needs its supply-state details before final stock issue', async () => {
  const f = fixture(); f.state().storeSettings[0].gstNumber = '10ABCDE1234F1Z5';
  const inv = await inventoryTransaction(f.db, tx => saveInvoice(tx, billInput({ isHeld: true }), 'Cashier'));
  await assert.rejects(inventoryTransaction(f.db, tx => finalizeInvoice(tx, inv.id, 'Cashier')), /place of supply/);
  assert.equal(f.state().product[0].stock, 10); assert.equal(f.state().stockLedger.length, 0);
});

test('insufficient POS stock rolls back invoice, contacts, payments and ledger', async () => {
  const f = fixture(1)
  await assert.rejects(inventoryTransaction(f.db, tx => saveInvoice(tx, billInput({ payments: [{ amount: 100, method: 'Cash' }] }), 'Cashier')), /Insufficient/)
  assert.equal(f.state().invoice.length, 0); assert.equal(f.state().contact.length, 0); assert.equal(f.state().payment.length, 0); assert.equal(f.state().stockLedger.length, 0)
  assert.equal(f.state().product[0].stock, 1)
})

test('initial split overpayment fails without committing a contact or invoice', async () => {
  const f = fixture()
  await assert.rejects(inventoryTransaction(f.db, tx => saveInvoice(tx, billInput({ payments: [{ amount: 150, method: 'Card' }, { amount: 100, method: 'UPI' }] }), 'Cashier')), /exceed/)
  assert.equal(f.state().invoice.length, 0); assert.equal(f.state().contact.length, 0)
})

test('held bills neither issue stock nor collect payments; finalization issues once', async () => {
  const f = fixture()
  const held = await inventoryTransaction(f.db, tx => saveInvoice(tx, billInput({ isHeld: true }), 'Cashier'))
  assert.equal(f.state().product[0].stock, 10)
  await assert.rejects(addInvoicePayment(f.tx, { invoiceId: held.id, amount: 100, method: 'Cash' }), /Finalize/)
  await inventoryTransaction(f.db, tx => finalizeInvoice(tx, held.id, 'Cashier'))
  assert.equal(f.state().product[0].stock, 8)
  await assert.rejects(inventoryTransaction(f.db, tx => finalizeInvoice(tx, held.id, 'Cashier')), /not held/)
  assert.equal(f.state().product[0].stock, 8)
})

test('invoice payment recalculates under lock and duplicate references or overbalance fail', async () => {
  const f = fixture(); f.state().invoice.push({ id: 1, invoiceStatus: 'ACTIVE', heldAt: null, total: 100, amountPaid: 0, balanceDue: 100 })
  await inventoryTransaction(f.db, tx => addInvoicePayment(tx, { invoiceId: 1, amount: 60, method: 'UPI', reference: 'TX1' }))
  await assert.rejects(inventoryTransaction(f.db, tx => addInvoicePayment(tx, { invoiceId: 1, amount: 20, method: 'UPI', reference: 'TX1' })), /already recorded/)
  await assert.rejects(inventoryTransaction(f.db, tx => addInvoicePayment(tx, { invoiceId: 1, amount: 60, method: 'Cash' })), /pending balance/)
  assert.equal(f.state().payment.length, 1); assert.equal(f.state().invoice[0].balanceDue, 40)
})

test('credit notes reduce debt, preserve payments and reject cumulative over-credit', async () => {
  const f = fixture(); f.state().invoice.push({ id: 1, invoiceStatus: 'ACTIVE', heldAt: null, total: 100, amountPaid: 20, balanceDue: 80 }); f.state().payment.push({ id: 1, invoiceId: 1, amount: 20 })
  await inventoryTransaction(f.db, tx => creditInvoice(tx, { invoiceId: 1, amount: 40, reason: 'Adjustment' }))
  assert.equal(f.state().invoice[0].balanceDue, 40)
  await assert.rejects(inventoryTransaction(f.db, tx => creditInvoice(tx, { invoiceId: 1, amount: 70, reason: 'Too much' })), /pending balance/)
  await inventoryTransaction(f.db, tx => creditInvoice(tx, { invoiceId: 1, amount: 60, reason: 'Final adjustment' }))
  assert.equal(f.state().invoice[0].invoiceStatus, 'REFUNDED'); assert.equal(f.state().payment[0].amount, 20)
})

test('unpaid invoice cancellation reverses net recorded stock once; paid invoices cannot vanish', async () => {
  const f = fixture()
  const invoice = await inventoryTransaction(f.db, tx => saveInvoice(tx, billInput(), 'Cashier'))
  await inventoryTransaction(f.db, tx => voidInvoice(tx, invoice.id, 'Manager'))
  assert.equal(f.state().product[0].stock, 10)
  await assert.rejects(voidInvoice(f.tx, invoice.id, 'Manager'), /Only active/)
  f.state().invoice.push({ id: 2, invoiceStatus: 'ACTIVE', heldAt: null, total: 100 }); f.state().payment.push({ id: 1, invoiceId: 2, amount: 1 })
  await assert.rejects(voidInvoice(f.tx, 2, 'Manager'), /paid\/credited/)
})

test('legacy invoices without stock provenance cancel without fabricating returns', async () => {
  const f = fixture(); f.state().invoice.push({ id: 1, invoiceStatus: 'ACTIVE', heldAt: null, total: 100 })
  await voidInvoice(f.tx, 1, 'Manager')
  assert.equal(f.state().product[0].stock, 10); assert.equal(f.state().stockLedger.length, 0)
})

test('stock-tracked invoice edit adjusts quantity and a shortage rolls back reversal and edit', async () => {
  const f = fixture(4)
  const invoice = await inventoryTransaction(f.db, tx => saveInvoice(tx, billInput(), 'Cashier'))
  await inventoryTransaction(f.db, tx => saveInvoice(tx, billInput({ items: [{ productId: 1, name: 'Chair', sku: 'C1', quantity: 3, price: 100 }] }), 'Admin', invoice.id))
  assert.equal(f.state().product[0].stock, 1)
  await assert.rejects(inventoryTransaction(f.db, tx => saveInvoice(tx, billInput({ items: [{ productId: 1, name: 'Chair', sku: 'C1', quantity: 5, price: 100 }] }), 'Admin', invoice.id)), /Insufficient/)
  assert.equal(f.state().product[0].stock, 1); assert.equal(f.state().invoiceItem[0].quantity, 3)
})

test('PO payments reject overbalance/replayed references; received or paid orders cannot cancel', async () => {
  const f = fixture(); f.state().purchaseOrder.push(purchase())
  await payPurchase(f.tx, { id: 1, amount: 60, method: 'UPI', reference: 'TX1', paidAt: new Date() })
  await assert.rejects(payPurchase(f.tx, { id: 1, amount: 50, method: 'Cash', paidAt: new Date() }), /pending balance/)
  await assert.rejects(payPurchase(f.tx, { id: 1, amount: 10, method: 'UPI', reference: 'TX1', paidAt: new Date() }), /already recorded/)
  await assert.rejects(cancelPurchase(f.tx, 1), /advances/)
  f.state().purchaseOrder[0].status = 'PARTIALLY_RECEIVED'
  await assert.rejects(cancelPurchase(f.tx, 1), /unreceived/)
  assert.equal(f.state().purchaseOrder[0].balanceDue, 40)
})

test('linked returns validate supplier, original costs and received-minus-returned cap', async () => {
  const f = fixture(); f.state().purchaseOrder.push(purchase({ status: 'RECEIVED' })); f.state().purchaseOrderItem.push({ id: 1, poId: 1, productId: 1, receivedQty: 4, unitCost: 10 }); f.state().purchaseReturn.push({ id: 1, poId: 1 }); f.state().purchaseReturnItem.push({ id: 1, returnId: 1, productId: 1, quantity: 3 })
  const item = { productId: 1, quantity: 1, unitCost: 10 }
  await validateLinkedReturn(f.tx, 1, 1, [item])
  await assert.rejects(validateLinkedReturn(f.tx, 2, 1, [item]), /supplier/)
  await assert.rejects(validateLinkedReturn(f.tx, 1, 1, [{ ...item, quantity: 2 }]), /Return quantity/)
  await assert.rejects(validateLinkedReturn(f.tx, 1, 1, [{ ...item, unitCost: 11 }]), /unit cost/)
  assert.throws(() => assertReturn(1, 1, 1))
})

test('custom-order schemas validate scheduled details, calendar dates and advance limits', () => {
  const input = { customer: 'Buyer', phone: '9876543210', address: 'Main street', type: 'Desk', quotedPrice: 100 }
  assert.equal(createCustomOrderSchema.safeParse({ ...input, advancePaid: 101 }).success, false)
  assert.equal(createCustomOrderSchema.safeParse({ ...input, scheduleVisit: true }).success, false)
  assert.equal(createCustomOrderSchema.safeParse({ ...input, scheduleVisit: true, visitDate: '2026-02-30', visitTime: '15:00', visitStaffId: 1 }).success, false)
})

test('custom order, visit and timeline creation roll back together on failure', async () => {
  const f = fixture(); f.failTimeline()
  const input = createCustomOrderSchema.parse({ customer: 'Buyer', phone: '9876543210', address: 'Main street', type: 'Desk', scheduleVisit: true, visitDate: '2026-10-09', visitTime: '15:00', visitStaffId: 1 })
  await assert.rejects(inventoryTransaction(f.db, tx => createCustom(tx, input, 'Manager')), /timeline/)
  assert.equal(f.state().customOrder.length, 0); assert.equal(f.state().contact.length, 0); assert.equal(f.state().fieldVisit.length, 0)
})

test('custom-order delivery requires terminal production/QC and updates ready inventory atomically', async () => {
  const f = fixture(); f.state().customOrder.push({ id: 1, status: 'QUALITY_CHECK' }); f.state().productionOrder.push({ id: 1, customOrderId: 1, status: 'COMPLETED', qualityStatus: 'PASSED' }); f.state().customOrderInventory.push({ id: 1, customOrderId: 1, quantity: 2, status: 'READY' })
  await transitionCustom(f.tx, 1, 'DELIVERED', 'Manager')
  assert.equal(f.state().customOrderInventory[0].status, 'DELIVERED')
  await assert.rejects(transitionCustom(f.tx, 1, 'IN_PRODUCTION', 'Manager'), /Delivered/)
  assert.throws(() => assertCustomTransition('QUALITY_CHECK', 'DELIVERED', [{ status: 'IN_PROGRESS', qualityStatus: null }], []), /production jobs/)
  assert.throws(() => assertCustomTransition('QUALITY_CHECK', 'DELIVERED', [{ status: 'COMPLETED', qualityStatus: 'FAILED' }], [{ status: 'READY', quantity: 1 }]), /quality control/)
})

test('visit completion honors assigned ownership, merges photos/measurements, and prevents repeat completion', async () => {
  const f = fixture(); f.state().customOrder.push({ id: 1, status: 'MEASUREMENT_SCHEDULED', photos: [] }); f.state().fieldVisit.push({ id: 1, staffId: 1, customOrderId: 1, status: 'Scheduled', photoUrls: ['/api/uploads/a.jpg'], photos: 1 })
  await assert.rejects(changeVisit(f.tx, { visitId: 1, status: 'Completed' }, 'Other', 2), /another staff/)
  await changeVisit(f.tx, { visitId: 1, status: 'Completed', measurements: { width: '100 cm' }, photoUrls: ['/api/uploads/b.jpg'] }, 'Worker', 1)
  assert.deepEqual(f.state().customOrder[0].measurements, { width: '100 cm' })
  assert.equal(f.state().customOrder[0].photos.length, 2)
  await assert.rejects(changeVisit(f.tx, { visitId: 1, status: 'Completed' }, 'Worker', 1), /cannot be reopened/)
  assert.equal(f.state().customOrderTimeline.length, 1)
})

test('follow-up reopen detects another active entry and active send leases cannot be edited', async () => {
  const f = fixture(); f.state().followUpEntry.push({ id: 1, contactId: 1, status: 'PENDING', lastContactedAt: new Date() })
  await assert.rejects(assertNoOpenFollowUp(f.tx, 1, null, 2), /already exists/)
  await assert.rejects(lockedFollowUp(f.tx, 1), /currently sending/)
  f.state().followUpEntry[0].lastContactedAt = new Date(Date.now() - 16 * 60 * 1000)
  assert.equal((await lockedFollowUp(f.tx, 1)).id, 1)
})

test('cash tender/change is explicitly audited without over-stating received revenue', () => {
  const payments = settleTender([{ amount: 150, method: 'Cash' }, { amount: 100, method: 'UPI' }], 200)
  assert.equal(payments.reduce((sum, p) => sum + p.amount, 0), 200)
  assert.match(payments[0].notes || '', /change returned: 50/)
  assert.throws(() => settleTender([{ amount: 201, method: 'UPI' }], 200), /Non-cash/)
  assert.throws(() => settleTender([{ amount: 1, method: 'UPI', reference: 'A' }, { amount: 1, method: 'UPI', reference: 'A' }], 100), /Duplicate/)
})

test('existing showroom visit-slot labels remain valid while malformed/reversed times fail', () => {
  for (const value of ['09:00 AM - 11:00 AM', '11:00 AM - 01:00 PM', '02:00 PM - 04:00 PM', '04:00 PM - 06:00 PM', '15:00']) assert.equal(validVisitTime(value), true)
  for (const value of ['25:00', '13:00 PM - 04:00 PM', '04:00 PM - 02:00 PM', 'any time']) assert.equal(validVisitTime(value), false)
})

test('reminder templates require one positional name value, no named/OTP/media/dynamic button parameters', () => {
  const template = { body_text: 'Hello {{1}}', header_type: null, header_content: null, buttons: null }
  assert.equal(isCompatibleReminderTemplate(template), true)
  for (const patch of [{ body_text: 'Hello {{customer}}' }, { body_text: 'Hello {{1}} {{name}}' }, { body_text: 'Hello {{1}} {{2}}' }, { header_type: 'image' }, { header_type: 'text', header_content: '{{name}}' }, { buttons: [{ type: 'URL', url: 'https://example.com/{{id}}' }] }, { buttons: [{ type: 'COPY_CODE' }] }, { category: 'AUTHENTICATION' }]) assert.equal(isCompatibleReminderTemplate({ ...template, ...patch }), false)
})

test('only genuine rescheduling re-arms reminded/contacted entries, not unchanged edits or closed entries', () => {
  assert.equal(shouldRearmReminder({ status: 'REMINDED', followUpDate: new Date('2026-10-08') }, '2026-10-08'), false)
  assert.equal(shouldRearmReminder({ status: 'REMINDED', followUpDate: new Date('2026-10-08') }, '2026-10-09'), true)
  assert.equal(shouldRearmReminder({ status: 'CONTACTED', followUpDate: new Date('2026-10-08') }, '2026-10-09'), true)
  assert.equal(shouldRearmReminder({ status: 'LOST', followUpDate: new Date('2026-10-08') }, '2026-10-09'), false)
})

const reminderEntry = (id: number, channel = 'whatsapp') => ({ id, channel, status: 'PENDING', followUpDate: new Date('2026-10-08'), updatedAt: new Date('2026-10-01'), lastContactedAt: null, contact: { name: 'Buyer', phone: '919876543210' }, socialContact: { id: 'SC1', user_id: 'U1', platform_id: 'P1' } })
const reminderDeps = (f: ReturnType<typeof fixture>) => ({ db: f.tx as unknown as PrismaClient, config: { enabled: true, templateName: 'reminder', language: 'en_US' }, catalog: { templates: [{ name: 'reminder', language: 'en_US', bodyText: 'Hi {{1}}' }] }, now: new Date('2026-10-08T06:00:00Z'), sendWhatsApp: async () => ({ sent: true }), sendSocial: async () => ({ sent: true }) })

test('reminder sweeps page beyond skipped rows and mark actual sends, not skipped entries', async () => {
  const f = fixture(); f.state().followUpEntry.push(...Array.from({ length: 105 }, (_, index) => reminderEntry(index + 1)), reminderEntry(106, 'instagram'))
  const summary = await runReminderSweep({ ...reminderDeps(f), catalog: { templates: [] } })
  assert.equal(summary.skipped, 105); assert.equal(summary.sent, 1); assert.equal(summary.processed, 106)
  assert.equal(f.state().followUpEntry[0].status, 'PENDING'); assert.equal(f.state().followUpEntry[105].status, 'REMINDED')
})

test('concurrent reminder sweeps share one atomic claim and cannot send the same pending entry twice', async () => {
  const f = fixture(); f.state().followUpEntry.push(reminderEntry(1))
  let sends = 0
  const deps = { ...reminderDeps(f), sendWhatsApp: async () => { sends++; return { sent: true } } }
  await Promise.all([runReminderSweep(deps), runReminderSweep(deps)])
  assert.equal(sends, 1); assert.equal(f.state().followUpEntry[0].status, 'REMINDED')
})

test('failed reminder sends release the lease while future/closed entries are not sent', async () => {
  const f = fixture(); f.state().followUpEntry.push(reminderEntry(1), { ...reminderEntry(2), followUpDate: new Date('2026-10-09') }, { ...reminderEntry(3), status: 'LOST' })
  const summary = await runReminderSweep({ ...reminderDeps(f), sendWhatsApp: async () => ({ sent: false, error: 'Provider unavailable' }) })
  assert.equal(summary.failed, 1); assert.equal(summary.processed, 1)
  assert.equal(f.state().followUpEntry[0].lastContactedAt, null)
})
