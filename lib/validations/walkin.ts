import { z } from 'zod'
import { requirementLabelSchema } from '../walkins/requirements'

export const createWalkinSchema = z.object({
  name: z.string().min(1),
  phone: z.string().min(10),
  email: z.string().email().optional().or(z.literal('')),
  requirement: requirementLabelSchema,
  assignedToId: z.number().optional(),
  budget: z.string().optional(),
  notes: z.string().optional(),
})

export type CreateWalkinInput = z.infer<typeof createWalkinSchema>
