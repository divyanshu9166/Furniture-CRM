import { z } from 'zod'

export const createCustomOrderSchema = z.object({
  customer: z.string().min(1),
  phone: z.string().min(10),
  address: z.string().min(1),
  type: z.string().min(1),
  assignedStaffId: z.number().optional(),
  estimatedDelivery: z.string().optional(),
  measurements: z.object({
    length: z.string().optional(),
    width: z.string().optional(),
    height: z.string().optional(),
    depth: z.string().optional(),
    countertop: z.string().optional(),
    notes: z.string().optional(),
  }).optional(),
  referenceProductId: z.number().optional(),
  referenceImages: z.array(z.string()).optional(),
  materials: z.string().optional(),
  color: z.string().optional(),
  quotedPrice: z.number().optional(),
  advancePaid: z.number().default(0),
  productionNotes: z.string().optional(),
  // Visit scheduling
  scheduleVisit: z.boolean().optional(),
  visitDate: z.string().optional(),
  visitTime: z.string().optional(),
  visitStaffId: z.number().optional(), // can differ from assignedStaffId
})

export const addTimelineEntrySchema = z.object({
  customOrderId: z.number(),
  event: z.string().min(1),
  date: z.string(),
  notes: z.string().optional(),
  status: z.enum(['done', 'pending']).default('pending'),
  updatedBy: z.string().optional(),
})

export const scheduleVisitSchema = z.object({
  customOrderId: z.number(),
  staffId: z.number(),
  date: z.string().min(1, 'Visit date is required'),
  time: z.string().min(1, 'Visit time is required'),
  notes: z.string().optional(),
})

export const updateVisitSchema = z.object({
  visitId: z.number(),
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
  photoUrls: z.array(z.string()).optional(),
})

export const updateMeasurementsSchema = z.object({
  customOrderId: z.number(),
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
