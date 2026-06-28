import { z } from 'zod'
import { LEAD_SOURCE_OPTIONS } from '@/lib/lead-sources'

export const FOLLOW_UP_PRIORITIES = ['Low', 'Medium', 'High'] as const
export const FOLLOW_UP_STATUSES = ['PENDING', 'CONTACTED', 'CONVERTED', 'LOST'] as const

// Manual "Add Follow-up" form
export const createFollowUpSchema = z.object({
    name: z.string().min(1, 'Name is required'),
    phone: z.string().min(10, 'Valid phone number required'),
    email: z.string().email().optional().or(z.literal('')),
    source: z.enum(LEAD_SOURCE_OPTIONS).optional(),
    interest: z.string().optional(),
    budget: z.string().optional(),
    reason: z.string().optional(),
    followUpDate: z.string().min(1, 'Follow-up date is required'),
    priority: z.enum(FOLLOW_UP_PRIORITIES).default('Medium'),
    assignedToId: z.number().nullable().optional(),
    notes: z.string().optional(),
})

// Convert an existing lead into a follow-up
export const convertLeadToFollowUpSchema = z.object({
    leadId: z.number(),
    followUpDate: z.string().min(1, 'Follow-up date is required'),
    priority: z.enum(FOLLOW_UP_PRIORITIES).default('Medium'),
    reason: z.string().optional(),
})

export const updateFollowUpSchema = z.object({
    id: z.number(),
    followUpDate: z.string().optional(),
    priority: z.enum(FOLLOW_UP_PRIORITIES).optional(),
    reason: z.string().optional(),
    interest: z.string().optional(),
    budget: z.string().optional(),
    assignedToId: z.number().nullable().optional(),
    notes: z.string().optional(),
})

export const updateFollowUpStatusSchema = z.object({
    id: z.number(),
    status: z.enum(FOLLOW_UP_STATUSES),
})

export type CreateFollowUpInput = z.infer<typeof createFollowUpSchema>
export type ConvertLeadToFollowUpInput = z.infer<typeof convertLeadToFollowUpSchema>
