import { z } from 'zod'
import { calendarDate } from './calendar'
const id = z.number().int().positive()
const money = z.number().int().min(0).max(2147483647)

export const createSupplierSchema = z.object({
  name: z.string().trim().min(1, 'Supplier name is required').max(160),
  gstNumber: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  address: z.string().optional(),
  contactPerson: z.string().optional(),
  paymentTerms: z.number().int().min(0).max(3650).default(30),
  openingBalance: money.default(0),
})

export const poItemSchema = z.object({
  productId: id,
  name: z.string(),
  sku: z.string(),
  hsnCode: z.string().optional(),
  quantity: z.number().int().positive().max(1000000),
  unitCost: money,
  gstRate: z.number().min(0).max(100).default(18),
})

export const createPurchaseOrderSchema = z.object({
  supplierId: id,
  expectedDate: calendarDate.optional(),
  notes: z.string().optional(),
  discount: money.default(0),
  isRCM: z.boolean().default(false),
  itcEligible: z.boolean().default(true),
  itcCategory: z.enum(['INPUTS', 'SERVICES', 'CAPITAL_GOODS', 'INELIGIBLE']).default('INPUTS'),
  items: z.array(poItemSchema).min(1, 'At least one item required').max(500),
}).refine(data => new Set(data.items.map(i => i.productId)).size === data.items.length, 'Each product can appear only once')

export const createPurchaseReturnSchema = z.object({
  supplierId: id,
  poId: id.optional(),
  reason: z.string().min(1, 'Reason is required'),
  notes: z.string().optional(),
  items: z.array(z.object({
    productId: id,
    name: z.string(),
    sku: z.string(),
    quantity: z.number().int().positive().max(1000000),
    unitCost: money,
  })).min(1).max(500),
}).refine(data => new Set(data.items.map(i => i.productId)).size === data.items.length, 'Each product can appear only once')
