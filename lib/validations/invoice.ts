import { z } from 'zod'

export const invoiceItemSchema = z.object({
  productId: z.number(),
  name: z.string(),
  sku: z.string(),
  quantity: z.number().min(1),
  price: z.number().min(0),
  hsnCode: z.string().optional(),
})

export const paymentEntrySchema = z.object({
  amount: z.number().min(1, 'Payment amount must be at least 1'),
  method: z.enum(['Cash', 'UPI', 'Card', 'EMI', 'Bank Transfer', 'Cheque']),
  reference: z.string().optional(),
  notes: z.string().optional(),
})

export const createInvoiceSchema = z.object({
  customer: z.string().min(1),
  phone: z.string().min(10),
  items: z.array(invoiceItemSchema).min(1, 'At least one item required'),
  discount: z.number().min(0).default(0),
  discountType: z.enum(['none', 'flat', 'percent']).default('none'),
  payments: z.array(paymentEntrySchema).min(1, 'At least one payment required'),
  salespersonId: z.number().optional(),
  notes: z.string().optional(),
  dueDate: z.string().optional(), // ISO date string
  isHeld: z.boolean().optional(),  // park/hold the bill
  transportCost: z.number().min(0).default(0),
})

export const recordPaymentSchema = z.object({
  invoiceId: z.number(),
  amount: z.number().min(1),
  method: z.enum(['Cash', 'UPI', 'Card', 'EMI', 'Bank Transfer', 'Cheque']),
  reference: z.string().optional(),
  notes: z.string().optional(),
})

export const createCreditNoteSchema = z.object({
  invoiceId: z.number(),
  amount: z.number().min(1),
  reason: z.string().min(1, 'Reason is required'),
})

export type CreateInvoiceInput = z.infer<typeof createInvoiceSchema>
export type RecordPaymentInput = z.infer<typeof recordPaymentSchema>
export type CreateCreditNoteInput = z.infer<typeof createCreditNoteSchema>
export type PaymentEntry = z.infer<typeof paymentEntrySchema>
