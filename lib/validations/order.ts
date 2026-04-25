import { z } from 'zod'

export const createOrderSchema = z.object({
  customer: z.string().min(1),
  phone: z.string().min(10),
  productId: z.number(),
  quantity: z.number().min(1).default(1),
  amount: z.number().min(0),
  source: z.enum(['STORE', 'AMAZON', 'FLIPKART', 'SHOPIFY']).default('STORE'),
  godownId: z.number().int().positive().optional(),
  payment: z.enum(['PAID', 'PARTIAL', 'PENDING']).default('PENDING'),
  notes: z.string().optional(),
})

export const updateOrderStatusSchema = z.object({
  id: z.number(),
  status: z.enum(['CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED']),
})

export type CreateOrderInput = z.infer<typeof createOrderSchema>
