import { z } from 'zod'
import { calendarDate } from './calendar'
const money = z.number().int().min(0).max(2147483647)
const id = z.number().int().positive()

export const invoiceItemSchema = z.object({
  productId: id,
  name: z.string(),
  sku: z.string(),
  quantity: z.number().int().positive().max(1000000),
  price: money,
  hsnCode: z.string().trim().refine(v => !v || /^\d{4}(\d{2})?(\d{2})?$/.test(v), 'HSN must contain 4, 6 or 8 digits').optional(),
  gstRate: z.number().min(0).max(100).optional(),
})

export const paymentEntrySchema = z.object({
  amount: z.number().int().max(2147483647).min(1, 'Payment amount must be at least 1'),
  method: z.enum(['Cash', 'UPI', 'Card', 'EMI', 'Bank Transfer', 'Cheque']),
  reference: z.string().optional(),
  notes: z.string().optional(),
})

export const createInvoiceSchema = z.object({
  customer: z.string().trim().min(1).max(160),
  phone: z.string().trim().refine(v => /^\+?[\d\s()-]+$/.test(v) && v.replace(/\D/g, '').length >= 10 && v.replace(/\D/g, '').length <= 15, 'Valid phone required'),
  address: z.string().optional(),
  gstNumber: z.string().trim().toUpperCase().refine(v => !v || /^(0[1-9]|[12]\d|3[0-8])[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(v), 'GSTIN must have a valid 15-character format').optional(),
  deliveryAddress: z.string().trim().max(1000).optional(),
  items: z.array(invoiceItemSchema).min(1, 'At least one item required'),
  discount: money.default(0),
  discountType: z.enum(['none', 'flat', 'percent']).default('none'),
  payments: z.array(paymentEntrySchema).max(20).default([]),
  salespersonId: id.optional(),
  notes: z.string().optional(),
  dueDate: calendarDate.optional(), // ISO date string
  isHeld: z.boolean().optional(),  // park/hold the bill
  transportCost: money.default(0),
  supplyType: z.enum(['INTRASTATE', 'INTERSTATE']).optional(),
  placeOfSupply: z.string().optional(),
})

export const updateInvoiceSchema = createInvoiceSchema.omit({ payments: true }).extend({
  payments: z.array(paymentEntrySchema).optional(),
})

export const recordPaymentSchema = z.object({
  invoiceId: id,
  amount: z.number().int().max(2147483647).min(1),
  method: z.enum(['Cash', 'UPI', 'Card', 'EMI', 'Bank Transfer', 'Cheque']),
  reference: z.string().optional(),
  notes: z.string().optional(),
})

export const createCreditNoteSchema = z.object({
  invoiceId: id,
  amount: z.number().int().max(2147483647).min(1),
  reason: z.string().min(1, 'Reason is required'),
})

export type CreateInvoiceInput = z.infer<typeof createInvoiceSchema>
export type UpdateInvoiceInput = z.infer<typeof updateInvoiceSchema>
export type RecordPaymentInput = z.infer<typeof recordPaymentSchema>
export type CreateCreditNoteInput = z.infer<typeof createCreditNoteSchema>
export type PaymentEntry = z.infer<typeof paymentEntrySchema>

export const validateInvoiceIntent = (data: { isHeld?: boolean; payments?: { amount: number }[]; discountType: string; discount: number }) => {
  if (data.discountType === 'percent' && data.discount > 100) throw new Error('Percentage discount cannot exceed 100')
  if (data.isHeld && data.payments?.length) throw new Error('Held bills cannot collect payments')
}
