import { z } from 'zod'

export const createProductSchema = z.object({
  sku: z.string().min(1, 'SKU is required'),
  name: z.string().min(1, 'Product name is required'),
  category: z.string().min(1, 'Category is required'),
  price: z.number().min(0, 'Price must be positive'),
  costPrice: z.number().min(0).default(0),
  stock: z.number().min(0).default(0),
  reorderLevel: z.number().min(0).default(5),
  material: z.string().optional(),
  color: z.string().optional(),
  description: z.string().optional(),
  warehouse: z.string().optional(),
  image: z.string().optional(),
  unitOfMeasure: z.string().default('PCS'),
  godownId: z.number().optional(), // Which godown receives the initial stock
})

export const updateStockSchema = z.object({
  id: z.number(),
  stock: z.number().min(0),
  godownId: z.number().optional(), // Which godown to adjust
})

export type CreateProductInput = z.infer<typeof createProductSchema>
