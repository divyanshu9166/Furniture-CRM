import { z } from 'zod'

export const calendarDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a valid calendar date')
  .refine(value => {
    const parsed = new Date(`${value}T00:00:00.000Z`)
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
  }, 'Use a valid calendar date')
