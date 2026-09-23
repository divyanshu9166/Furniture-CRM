'use server'

import { prisma } from '@/lib/db'
import { revalidatePath } from 'next/cache'
import {
    createFollowUpSchema,
    convertLeadToFollowUpSchema,
    updateFollowUpSchema,
    updateFollowUpStatusSchema,
} from '@/lib/validations/follow-up'
import { requireRole } from '@/lib/auth-helpers'
import { z } from 'zod'
import {
    runFollowUpReminders,
    getFollowUpReminderConfig,
    getFollowUpReminderTemplates as getReminderTemplateCatalog,
} from '@/lib/follow-up-reminders'

// Statuses that count as "still open" — block a duplicate follow-up for the
// same contact and keep the entry in the active list. REMINDED is included
// because a reminded follow-up is still awaiting the customer's reply.
const OPEN_STATUSES = ['PENDING', 'REMINDED', 'CONTACTED'] as const
const followUpIdSchema = z.number().int().positive()
const reminderConfigSchema = z.object({
    enabled: z.boolean().optional(),
    templateName: z.string().max(512).optional(),
    language: z.string().trim().min(2).max(32).optional(),
}).strict()

async function canManageFollowUps() {
    try {
        await requireRole('ADMIN', 'MANAGER')
        return true
    } catch {
        return false
    }
}

const accessDenied = () => ({ success: false as const, error: 'Access denied' })

async function hasActiveStaffAssignment(staffId: number | null | undefined) {
    if (!staffId) return true
    const staff = await prisma.staff.findUnique({ where: { id: staffId }, select: { status: true } })
    return staff?.status === 'Active'
}

function serialize(f: any) {
    return {
        id: f.id,
        channel: f.channel ?? 'whatsapp',
        name: f.contact?.name ?? f.socialContact?.name ?? f.displayName ?? '',
        phone: f.contact?.phone ?? '',
        email: f.contact?.email ?? null,
        interest: f.interest,
        budget: f.budget,
        reason: f.reason,
        followUpDate: f.followUpDate.toISOString().split('T')[0],
        priority: f.priority,
        source: f.source,
        status: f.status,
        assignedToId: f.assignedToId,
        assignedTo: f.assignedTo?.name ?? null,
        leadId: f.leadId,
        fromLead: !!f.leadId,
        lastContactedAt: f.lastContactedAt ? f.lastContactedAt.toISOString() : null,
        notes: f.notes,
        createdAt: f.createdAt.toISOString(),
    }
}

export async function getFollowUps(status?: string) {
    if (!await canManageFollowUps()) return accessDenied()
    const where =
        status && ['PENDING', 'REMINDED', 'CONTACTED', 'CONVERTED', 'LOST'].includes(status)
            ? { status: status as any }
            : status === 'OPEN'
                ? { status: { in: OPEN_STATUSES as unknown as any[] } }
                : {}

    const rows = await prisma.followUpEntry.findMany({
        where,
        include: { contact: true, socialContact: true, assignedTo: true },
        orderBy: { followUpDate: 'asc' },
    })

    return { success: true, data: rows.map(serialize) }
}

export async function getFollowUpCounts() {
    if (!await canManageFollowUps()) return accessDenied()
    // Due buckets only consider PENDING (un-reminded) entries — once a
    // reminder has fired (REMINDED) the date is no longer "due".
    const rows = await prisma.followUpEntry.findMany({
        where: { status: 'PENDING' },
        select: { followUpDate: true },
    })

    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const todayMs = today.getTime()
    const dayMs = 86_400_000

    let overdue = 0
    let dueToday = 0
    let upcoming = 0
    for (const r of rows) {
        const d = new Date(r.followUpDate)
        d.setHours(0, 0, 0, 0)
        const diff = Math.round((d.getTime() - todayMs) / dayMs)
        if (diff < 0) overdue++
        else if (diff === 0) dueToday++
        else upcoming++
    }

    const converted = await prisma.followUpEntry.count({ where: { status: 'CONVERTED' } })

    return { success: true, data: { overdue, dueToday, upcoming, converted } }
}

export async function createFollowUp(data: unknown) {
    if (!await canManageFollowUps()) return accessDenied()
    const parsed = createFollowUpSchema.safeParse(data)
    if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }

    const { name, phone, email, source, interest, budget, reason, followUpDate, priority, assignedToId, notes } =
        parsed.data

    if (!await hasActiveStaffAssignment(assignedToId)) {
        return { success: false, error: 'Choose an active salesperson.' }
    }

    // Find or create the contact by phone (same dedup rule as leads).
    let contact = await prisma.contact.findFirst({ where: { phone } })
    if (!contact) {
        contact = await prisma.contact.create({
            data: { name, phone, email: email || null, source: source || null },
        })
    }

    // Guard: never keep two open follow-ups for the same contact.
    const existingOpen = await prisma.followUpEntry.findFirst({
        where: { contactId: contact.id, status: { in: OPEN_STATUSES as unknown as any[] } },
    })
    if (existingOpen) {
        return { success: false, error: 'An open follow-up already exists for this contact.' }
    }

    const entry = await prisma.followUpEntry.create({
        data: {
            contactId: contact.id,
            interest: interest || null,
            budget: budget || null,
            reason: reason || null,
            followUpDate: new Date(followUpDate),
            priority,
            source: source || null,
            status: 'PENDING',
            assignedToId: assignedToId ?? null,
            notes: notes || null,
        },
    })

    revalidatePath('/follow-ups')
    return { success: true, data: entry }
}

export async function convertLeadToFollowUp(data: unknown) {
    if (!await canManageFollowUps()) return accessDenied()
    const parsed = convertLeadToFollowUpSchema.safeParse(data)
    if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }

    const { leadId, followUpDate, priority, reason } = parsed.data

    const lead = await prisma.lead.findUnique({
        where: { id: leadId },
        include: { contact: true },
    })
    if (!lead) return { success: false, error: 'Lead not found' }

    // Guard: don't create a second open follow-up for the same contact/lead.
    const existingOpen = await prisma.followUpEntry.findFirst({
        where: {
            status: { in: OPEN_STATUSES as unknown as any[] },
            OR: [{ leadId: lead.id }, { contactId: lead.contactId }],
        },
    })
    if (existingOpen) {
        return { success: false, error: 'This lead already has an open follow-up.' }
    }

    const entry = await prisma.followUpEntry.create({
        data: {
            contactId: lead.contactId,
            leadId: lead.id,
            interest: lead.interest,
            budget: lead.budget,
            reason: reason || null,
            followUpDate: new Date(followUpDate),
            priority,
            source: lead.source,
            status: 'PENDING',
            assignedToId: lead.assignedToId ?? null,
        },
    })

    // Reflect engagement: a still-NEW lead becomes Contacted (history preserved).
    if (lead.status === 'NEW') {
        await prisma.lead.update({ where: { id: lead.id }, data: { status: 'CONTACTED' } })
    }

    revalidatePath('/follow-ups')
    revalidatePath('/leads')
    return { success: true, data: entry }
}

export async function updateFollowUp(data: unknown) {
    if (!await canManageFollowUps()) return accessDenied()
    const parsed = updateFollowUpSchema.safeParse(data)
    if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }

    const { id, followUpDate, priority, reason, interest, budget, assignedToId, notes } = parsed.data

    if (!await hasActiveStaffAssignment(assignedToId)) {
        return { success: false, error: 'Choose an active salesperson.' }
    }

    const current = await prisma.followUpEntry.findUnique({
        where: { id },
        select: { status: true },
    })
    if (!current) return { success: false, error: 'Follow-up not found' }

    const patch: Record<string, unknown> = {}
    if (followUpDate !== undefined) patch.followUpDate = new Date(followUpDate)
    if (priority !== undefined) patch.priority = priority
    if (reason !== undefined) patch.reason = reason
    if (interest !== undefined) patch.interest = interest
    if (budget !== undefined) patch.budget = budget
    if (assignedToId !== undefined) patch.assignedToId = assignedToId
    if (notes !== undefined) patch.notes = notes

    // Rescheduling a REMINDED follow-up re-arms it so the reminder fires
    // once more on the new date.
    if (followUpDate !== undefined) {
        if (current.status === 'REMINDED') {
            patch.status = 'PENDING'
            patch.lastContactedAt = null
        }
    }

    const entry = await prisma.followUpEntry.update({ where: { id }, data: patch })

    revalidatePath('/follow-ups')
    return { success: true, data: entry }
}

export async function updateFollowUpStatus(data: unknown) {
    if (!await canManageFollowUps()) return accessDenied()
    const parsed = updateFollowUpStatusSchema.safeParse(data)
    if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }

    const { id, status } = parsed.data
    const patch: Record<string, unknown> = { status }
    // Any move out of PENDING records an engagement timestamp.
    if (status !== 'PENDING') patch.lastContactedAt = new Date()
    else patch.lastContactedAt = null

    const result = await prisma.followUpEntry.updateMany({ where: { id }, data: patch })
    if (!result.count) return { success: false, error: 'Follow-up not found' }

    revalidatePath('/follow-ups')
    return { success: true }
}

export async function deleteFollowUp(id: unknown) {
    if (!await canManageFollowUps()) return accessDenied()
    const parsed = followUpIdSchema.safeParse(id)
    if (!parsed.success) return { success: false, error: 'Invalid follow-up ID' }
    const result = await prisma.followUpEntry.deleteMany({ where: { id: parsed.data } })
    if (!result.count) return { success: false, error: 'Follow-up not found' }
    revalidatePath('/follow-ups')
    return { success: true }
}

// ─── Scheduled WhatsApp reminder config + manual run ───────────────

export async function getReminderConfig() {
    if (!await canManageFollowUps()) return accessDenied()
    const config = await getFollowUpReminderConfig()
    return {
        success: true,
        data: {
            enabled: config.enabled,
            templateName: config.templateName || '',
            language: config.language || 'en_US',
        },
    }
}

export async function getFollowUpReminderTemplates() {
    if (!await canManageFollowUps()) return accessDenied()
    const catalog = await getReminderTemplateCatalog()
    return { success: true, data: catalog.templates, reason: catalog.reason }
}

export async function updateReminderConfig(data: unknown) {
    if (!await canManageFollowUps()) return accessDenied()
    const parsed = reminderConfigSchema.safeParse(data)
    if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }

    const current = await getFollowUpReminderConfig()
    const requested = parsed.data
    const nextEnabled = requested.enabled ?? current.enabled
    const nextTemplateName = requested.templateName === undefined
        ? current.templateName
        : requested.templateName.trim() || null
    const nextLanguage = requested.language === undefined
        ? current.language
        : requested.language.trim() || 'en_US'

    if (nextEnabled) {
        if (!nextTemplateName) {
            return { success: false, error: 'Select an approved Meta template before enabling reminders.' }
        }
        const catalog = await getReminderTemplateCatalog()
        const isApproved = catalog.templates.some((template) =>
            template.name === nextTemplateName && template.language === nextLanguage,
        )
        if (!isApproved) {
            return { success: false, error: catalog.reason || 'Select an approved Meta template with exactly one customer-name body variable.' }
        }
    }

    const patch: Record<string, unknown> = {}
    if (requested.enabled !== undefined) patch.enabled = requested.enabled
    if (requested.templateName !== undefined) patch.templateName = nextTemplateName
    if (requested.language !== undefined) patch.language = nextLanguage

    const config = await prisma.followUpReminderConfig.upsert({
        where: { id: 1 },
        update: patch,
        create: { id: 1, enabled: nextEnabled, templateName: nextTemplateName, language: nextLanguage },
    })

    revalidatePath('/follow-ups')
    return {
        success: true,
        data: { enabled: config.enabled, templateName: config.templateName || '', language: config.language },
    }
}

export async function runFollowUpRemindersNow() {
    if (!await canManageFollowUps()) return accessDenied()
    const summary = await runFollowUpReminders()
    revalidatePath('/follow-ups')
    return { success: true, data: summary }
}
