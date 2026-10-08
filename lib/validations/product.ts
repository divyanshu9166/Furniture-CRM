import { z } from 'zod'
import { canonicalInventoryCategory } from '../inventory/category'

export const createProductSchema = z.object({
  sku: z.string().trim().min(1, 'SKU is required').max(100),
  name: z.string().trim().min(1, 'Product name is required').max(200),
  category: z.string().trim().min(1, 'Category is required').max(100).transform(canonicalInventoryCategory),
  price: z.number().int('Price must be in whole rupees').min(0, 'Price must be positive'),
  // Optional bulk / wholesale price. Independent of `price` — never used by
  // BOM, the price calculator, quotations, orders or invoices.
  bulkPrice: z.number().int().min(0).optional(),
  costPrice: z.number().int().min(0).default(0),
  stock: z.number().min(0).default(0),
  reorderLevel: z.number().int().min(0).default(5),
  material: z.string().optional(),
  brand: z.string().optional(),
  color: z.string().optional(),
  description: z.string().optional(),
  warehouse: z.string().optional(),
  image: z.string().optional(),
  stockGroupId: z.number().int().positive().nullable().optional(),
  unitOfMeasure: z.string().trim().min(1).max(20).default('PCS'),
  unitSize: z.number().positive().default(1),
  godownId: z.number().int().positive().optional(), // Which godown receives the initial stock
})

export const updateProductSchema = createProductSchema.omit({ sku: true, category: true, warehouse: true, stock: true, godownId: true })
  .extend({ bulkPrice: z.number().int().min(0).nullable().optional() }).partial().strict()

export const updateStockSchema = z.object({
  id: z.number().int().positive(),
  stock: z.number().min(0),
  godownId: z.number().int().positive().optional(), // Which godown to adjust
  mode: z.enum(['SET', 'ADD', 'REMOVE']).default('SET'),
  expectedStock: z.number().min(0).optional(),
  reason: z.string().trim().max(200).optional(),
  notes: z.string().trim().max(2000).optional(),
})

export type CreateProductInput = z.infer<typeof createProductSchema>
