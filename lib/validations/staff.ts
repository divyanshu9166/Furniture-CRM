import { z } from 'zod'

const emailSchema = z.string().email()
const loginUsernameSchema = z.union([
  z.literal(''),
  z
    .string()
    .trim()
    .min(3, 'Login username must be at least 3 characters')
    .max(64, 'Login username must be at most 64 characters')
    .refine((value) => {
      const isEmail = emailSchema.safeParse(value).success
      const isUsername = /^[A-Za-z0-9._-]+$/.test(value)
      return isEmail || isUsername
    }, 'Login username must be a valid email or username'),
])

export const createStaffSchema = z.object({
  name: z.string().min(1),
  role: z.string().min(1),
  phone: z.string().min(10),
  email: z.string().email(),
  joinDate: z.string(),
  loginUsername: loginUsernameSchema.optional(),
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
  loginUsername: loginUsernameSchema.optional(),
  loginPassword: z.union([z.literal(''), z.string().min(4)]).optional(),
})

export const clockInSchema = z.object({
  staffId: z.number(),
  time: z.string(),
})

export type CreateStaffInput = z.infer<typeof createStaffSchema>
export type UpdateStaffInput = z.infer<typeof updateStaffSchema>
