import { z } from 'zod'

export const quotationItemSchema = z.object({
  productId: z.number().optional(),
  name: z.string().min(1, 'Item name is required'),
  sku: z.string().optional(),
  description: z.string().optional(),
  quantity: z.number().int().min(1, 'Quantity must be at least 1'),
  rate: z.number().min(0, 'Rate cannot be negative'),
  referenceImage: z.string().optional(),
})

export const createQuotationSchema = z.object({
  customer: z.string().min(1, 'Customer name is required'),
  phone: z.string().min(10, 'Phone must be at least 10 digits'),
  email: z.string().email('Invalid email').optional().or(z.literal('')),
  dispatchAddress: z.string().optional(),
  date: z.string().optional(),
  validUntil: z.string().optional(),
  projectName: z.string().optional(),
  deliveryMode: z.string().optional(),
  roadPermit: z.string().optional(),
  contactPerson: z.string().optional(),
  installationPercent: z.number().min(0).max(100).default(5),
  freightCharge: z.number().min(0).default(0),
  loadingCharge: z.number().min(0).default(0),
  gstPercent: z.number().min(0).max(100).default(18),
  notes: z.string().optional(),
  termsAndConditions: z.array(z.string()).default([]),
  items: z.array(quotationItemSchema).min(1, 'At least one item is required'),
})

export const updateQuotationSchema = createQuotationSchema.extend({
  id: z.number(),
})

export const updateQuotationStatusSchema = z.object({
  id: z.number(),
  status: z.enum(['DRAFT', 'SENT', 'APPROVED', 'REJECTED']),
})

export type CreateQuotationInput = z.infer<typeof createQuotationSchema>
export type QuotationItemInput = z.infer<typeof quotationItemSchema>
