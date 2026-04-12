import { z } from 'zod'

export const createSupplierSchema = z.object({
  name: z.string().min(1, 'Supplier name is required'),
  gstNumber: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  address: z.string().optional(),
  contactPerson: z.string().optional(),
  paymentTerms: z.number().min(0).default(30),
  openingBalance: z.number().default(0),
})

export const poItemSchema = z.object({
  productId: z.number(),
  name: z.string(),
  sku: z.string(),
  hsnCode: z.string().optional(),
  quantity: z.number().min(1),
  unitCost: z.number().min(0),
  gstRate: z.number().default(18),
})

export const createPurchaseOrderSchema = z.object({
  supplierId: z.number(),
  expectedDate: z.string().optional(),
  notes: z.string().optional(),
  discount: z.number().min(0).default(0),
  items: z.array(poItemSchema).min(1, 'At least one item required'),
})

export const createPurchaseReturnSchema = z.object({
  supplierId: z.number(),
  poId: z.number().optional(),
  reason: z.string().min(1, 'Reason is required'),
  notes: z.string().optional(),
  items: z.array(z.object({
    productId: z.number(),
    name: z.string(),
    sku: z.string(),
    quantity: z.number().min(1),
    unitCost: z.number().min(0),
  })).min(1),
})
