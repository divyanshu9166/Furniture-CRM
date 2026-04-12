import { z } from 'zod'

export const createBranchSchema = z.object({
  name: z.string().min(1, 'Branch name is required'),
  address: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  managerName: z.string().optional(),
  isHeadOffice: z.boolean().default(false),
})

export const createGodownSchema = z.object({
  name: z.string().min(1, 'Godown name is required'),
  address: z.string().optional(),
  branchId: z.number().optional(),
})

export const createTransferSchema = z.object({
  fromGodownId: z.number(),
  toGodownId: z.number(),
  notes: z.string().optional(),
  requestedBy: z.string().optional(),
  items: z.array(z.object({
    productId: z.number(),
    name: z.string(),
    sku: z.string(),
    quantity: z.number().min(1),
  })).min(1, 'At least one item required'),
})
