import { z } from 'zod'

export const createBranchSchema = z.object({
  name: z.string().trim().min(1, 'Branch name is required').max(160),
  address: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  managerName: z.string().optional(),
  isHeadOffice: z.boolean().default(false),
})

export const createGodownSchema = z.object({
  name: z.string().trim().min(1, 'Godown name is required').max(160),
  address: z.string().optional(),
  type: z.enum(['Warehouse', 'Showroom', 'Factory']).default('Warehouse'),
  capacity: z.number().int().positive().nullable().optional(),
  isDefault: z.boolean().default(false),
  branchId: z.number().int().positive().nullable().optional(),
})

// Creation defaults must not reset fields omitted by a metadata-only edit.
export const updateBranchSchema = createBranchSchema.omit({ isHeadOffice: true })
  .extend({ isHeadOffice: z.boolean().optional() }).partial().strict()
  .refine(data => Object.values(data).some(value => value !== undefined), 'Provide at least one branch change')
export const updateGodownSchema = createGodownSchema.omit({ isDefault: true, type: true })
  .extend({ isDefault: z.boolean().optional(), type: z.enum(['Warehouse', 'Showroom', 'Factory']).optional() }).partial().strict()
  .refine(data => Object.values(data).some(value => value !== undefined), 'Provide at least one godown change')

export const createTransferSchema = z.object({
  fromGodownId: z.number().int().positive(),
  toGodownId: z.number().int().positive(),
  notes: z.string().trim().max(2000).optional(),
  requestedBy: z.string().optional(),
  items: z.array(z.object({
    productId: z.number().int().positive(),
    name: z.string().max(200).optional(), // Display metadata is resolved from Product, not trusted here.
    sku: z.string().max(100).optional(),
    quantity: z.number().min(0.000001, 'Quantity must be positive').max(1_000_000_000),
  })).min(1, 'At least one item required').max(200, 'Use up to 200 transfer lines'),
}).refine(data => new Set(data.items.map(item => item.productId)).size === data.items.length, 'Each product can appear only once in a transfer')
  .refine(data => data.fromGodownId !== data.toGodownId, 'Source and destination godown cannot be the same')
