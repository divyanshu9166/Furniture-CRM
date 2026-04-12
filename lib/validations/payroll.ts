import { z } from 'zod'

export const generatePayrollSchema = z.object({
  period: z.string().regex(/^\d{4}-\d{2}$/, 'Period must be YYYY-MM format'),
  workingDays: z.number().min(1).max(31).default(26),
})

export const updateStaffPayrollSchema = z.object({
  staffId: z.number(),
  basicSalary: z.number().min(0),
  designation: z.string().optional(),
  panNumber: z.string().optional(),
  bankAccount: z.string().optional(),
  bankName: z.string().optional(),
  ifscCode: z.string().optional(),
  pfEnrolled: z.boolean().default(false),
  esiEnrolled: z.boolean().default(false),
  uanNumber: z.string().optional(),
  pfNumber: z.string().optional(),
  esiNumber: z.string().optional(),
  professionalTaxState: z.string().default('None'),
  tdsMonthly: z.number().min(0).default(0),
})
