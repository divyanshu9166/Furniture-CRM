import { z } from 'zod'
import { LEAD_SOURCE_OPTIONS } from '@/lib/lead-sources'

export const FOLLOW_UP_PRIORITIES = ['Low', 'Medium', 'High'] as const
export const FOLLOW_UP_STATUSES = ['PENDING', 'CONTACTED', 'CONVERTED', 'LOST'] as const

const followUpDate = z.string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Follow-up date must use YYYY-MM-DD')
    .refine((value) => {
        const [year, month, day] = value.split('-').map(Number)
        const date = new Date(Date.UTC(year, month - 1, day))
        return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
    }, 'Follow-up date is invalid')

// Manual "Add Follow-up" form
export const createFollowUpSchema = z.object({
    name: z.string().trim().min(1, 'Name is required').max(160),
    phone: z.string().trim().refine((value) => {
        const digits = value.replace(/\D/g, '')
        return digits.length >= 10 && digits.length <= 15
    }, 'Valid phone number required'),
    email: z.string().email().optional().or(z.literal('')),
    source: z.enum(LEAD_SOURCE_OPTIONS).optional(),
    interest: z.string().trim().max(500).optional(),
    budget: z.string().trim().max(200).optional(),
    reason: z.string().trim().max(1_000).optional(),
    followUpDate,
    priority: z.enum(FOLLOW_UP_PRIORITIES).default('Medium'),
    assignedToId: z.number().nullable().optional(),
    notes: z.string().trim().max(5_000).optional(),
})

// Convert an existing lead into a follow-up
export const convertLeadToFollowUpSchema = z.object({
    leadId: z.number().int().positive(),
    followUpDate,
    priority: z.enum(FOLLOW_UP_PRIORITIES).default('Medium'),
    reason: z.string().trim().max(1_000).optional(),
})

export const updateFollowUpSchema = z.object({
    id: z.number().int().positive(),
    followUpDate: followUpDate.optional(),
    priority: z.enum(FOLLOW_UP_PRIORITIES).optional(),
    reason: z.string().trim().max(1_000).optional(),
    interest: z.string().trim().max(500).optional(),
    budget: z.string().trim().max(200).optional(),
    assignedToId: z.number().int().positive().nullable().optional(),
    notes: z.string().trim().max(5_000).optional(),
})

export const updateFollowUpStatusSchema = z.object({
    id: z.number().int().positive(),
    status: z.enum(FOLLOW_UP_STATUSES),
})

export type CreateFollowUpInput = z.infer<typeof createFollowUpSchema>
export type ConvertLeadToFollowUpInput = z.infer<typeof convertLeadToFollowUpSchema>
