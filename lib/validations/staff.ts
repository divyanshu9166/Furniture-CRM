import { z } from 'zod'

export const createStaffSchema = z.object({
  name: z.string().min(1),
  role: z.string().min(1),
  phone: z.string().min(10),
  email: z.string().email(),
  joinDate: z.string(),
  loginUsername: z.union([z.literal(''), z.string().email()]).optional(),
  loginPassword: z.union([z.literal(''), z.string().min(4)]).optional(),
})

export const updateStaffSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1),
  role: z.string().min(1),
  phone: z.string().min(10),
  email: z.string().email(),
  status: z.string().min(1),
  joinDate: z.string(),
  loginUsername: z.union([z.literal(''), z.string().email()]).optional(),
  loginPassword: z.union([z.literal(''), z.string().min(4)]).optional(),
})

export const clockInSchema = z.object({
  staffId: z.number(),
  time: z.string(),
})

export type CreateStaffInput = z.infer<typeof createStaffSchema>
export type UpdateStaffInput = z.infer<typeof updateStaffSchema>
