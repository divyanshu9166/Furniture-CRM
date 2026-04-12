import { z } from 'zod'

export const dateRangeSchema = z.object({
  fromDate: z.string(),
  toDate: z.string(),
})

export const createJournalSchema = z.object({
  date: z.string(),
  narration: z.string().min(1),
  lines: z.array(z.object({
    accountId: z.number(),
    debit: z.number().min(0).default(0),
    credit: z.number().min(0).default(0),
    description: z.string().optional(),
  })).min(2, 'At least two journal lines required'),
})

export const createAccountSchema = z.object({
  code: z.string().min(1).max(10),
  name: z.string().min(1),
  groupId: z.number(),
  openingBalance: z.number().default(0),
})
