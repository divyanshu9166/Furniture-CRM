import { z } from 'zod'
import { calendarDate } from './calendar'
import { validVisitTime } from '../commerce/rules'
const id = z.number().int().positive()
const money = z.number().int().min(0).max(2147483647)
export const photoUrlsSchema = z.array(z.string().max(2000).refine(v => /^\/api\/uploads\//.test(v) || /^https?:\/\//.test(v), 'Invalid image URL')).max(30)
const visitTime = z.string().refine(validVisitTime, 'Select a valid time slot or use HH:MM')

export const createCustomOrderSchema = z.object({
  customer: z.string().trim().min(1).max(500),
  phone: z.string().trim().refine(v => /^\+?[\d\s()-]+$/.test(v) && v.replace(/\D/g, '').length >= 10 && v.replace(/\D/g, '').length <= 15, 'Valid phone required'),
  address: z.string().trim().min(1).max(500),
  type: z.string().trim().min(1).max(500),
  assignedStaffId: id.optional(),
  estimatedDelivery: calendarDate.optional(),
  measurements: z.object({
    length: z.string().optional(),
    width: z.string().optional(),
    height: z.string().optional(),
    depth: z.string().optional(),
    countertop: z.string().optional(),
    notes: z.string().optional(),
  }).optional(),
  referenceProductId: id.optional(),
  referenceImages: photoUrlsSchema.optional(),
  materials: z.string().optional(),
  color: z.string().optional(),
  quotedPrice: money.optional(),
  advancePaid: money.default(0),
  productionNotes: z.string().optional(),
  // Visit scheduling
  scheduleVisit: z.boolean().optional(),
  visitDate: calendarDate.optional(),
  visitTime: visitTime.optional(),
  visitStaffId: id.optional(), // can differ from assignedStaffId
}).superRefine((data, ctx) => {
  if (data.quotedPrice !== undefined && data.advancePaid > data.quotedPrice) ctx.addIssue({ code: 'custom', message: 'Advance cannot exceed quoted price', path: ['advancePaid'] })
  if (data.scheduleVisit && (!data.visitDate || !data.visitTime || !(data.visitStaffId || data.assignedStaffId))) ctx.addIssue({ code: 'custom', message: 'Select visit date, time and active staff before scheduling', path: ['visitDate'] })
})

export const addTimelineEntrySchema = z.object({
  customOrderId: id,
  event: z.string().trim().min(1).max(500),
  date: calendarDate,
  notes: z.string().optional(),
  status: z.enum(['done', 'pending']).default('pending'),
  updatedBy: z.string().optional(),
})

export const scheduleVisitSchema = z.object({
  customOrderId: id,
  staffId: id,
  date: calendarDate,
  time: visitTime,
  notes: z.string().optional(),
})

export const updateVisitSchema = z.object({
  visitId: id,
  measurements: z.object({
    length: z.string().optional(),
    width: z.string().optional(),
    height: z.string().optional(),
    depth: z.string().optional(),
    countertop: z.string().optional(),
    notes: z.string().optional(),
  }).optional(),
  staffNotes: z.string().optional(),
  status: z.enum(['Scheduled', 'In Progress', 'Completed', 'Cancelled']).optional(),
  photoUrls: photoUrlsSchema.optional(),
})

export const updateMeasurementsSchema = z.object({
  customOrderId: id,
  measurements: z.object({
    length: z.string().optional(),
    width: z.string().optional(),
    height: z.string().optional(),
    depth: z.string().optional(),
    countertop: z.string().optional(),
    notes: z.string().optional(),
  }),
})

export type CreateCustomOrderInput = z.infer<typeof createCustomOrderSchema>
export type ScheduleVisitInput = z.infer<typeof scheduleVisitSchema>
export type UpdateVisitInput = z.infer<typeof updateVisitSchema>
export type UpdateMeasurementsInput = z.infer<typeof updateMeasurementsSchema>
