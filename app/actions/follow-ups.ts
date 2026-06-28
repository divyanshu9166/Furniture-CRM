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
import { runFollowUpReminders, getFollowUpReminderConfig } from '@/lib/follow-up-reminders'

// Statuses that count as "still open" — block a duplicate follow-up for the
// same contact and keep the entry in the active list. REMINDED is included
// because a reminded follow-up is still awaiting the customer's reply.
const OPEN_STATUSES = ['PENDING', 'REMINDED', 'CONTACTED'] as const

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
    const parsed = createFollowUpSchema.safeParse(data)
    if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }

    const { name, phone, email, source, interest, budget, reason, followUpDate, priority, assignedToId, notes } =
        parsed.data

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
    const parsed = updateFollowUpSchema.safeParse(data)
    if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }

    const { id, followUpDate, priority, reason, interest, budget, assignedToId, notes } = parsed.data

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
        const current = await prisma.followUpEntry.findUnique({
            where: { id },
            select: { status: true },
        })
        if (current?.status === 'REMINDED') patch.status = 'PENDING'
    }

    const entry = await prisma.followUpEntry.update({ where: { id }, data: patch })

    revalidatePath('/follow-ups')
    return { success: true, data: entry }
}

export async function updateFollowUpStatus(data: unknown) {
    const parsed = updateFollowUpStatusSchema.safeParse(data)
    if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }

    const { id, status } = parsed.data
    const patch: Record<string, unknown> = { status }
    // Any move out of PENDING records an engagement timestamp.
    if (status !== 'PENDING') patch.lastContactedAt = new Date()

    const entry = await prisma.followUpEntry.update({ where: { id }, data: patch })

    revalidatePath('/follow-ups')
    return { success: true, data: entry }
}

export async function deleteFollowUp(id: number) {
    await prisma.followUpEntry.delete({ where: { id } })
    revalidatePath('/follow-ups')
    return { success: true }
}

// ─── Scheduled WhatsApp reminder config + manual run ───────────────

export async function getReminderConfig() {
    try { await requireRole('ADMIN', 'MANAGER') } catch { return { success: false, error: 'Access denied' } }
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

export async function updateReminderConfig(data: {
    enabled?: boolean
    templateName?: string
    language?: string
}) {
    try { await requireRole('ADMIN', 'MANAGER') } catch { return { success: false, error: 'Access denied' } }

    const patch: Record<string, unknown> = {}
    if (typeof data.enabled === 'boolean') patch.enabled = data.enabled
    if (data.templateName !== undefined) patch.templateName = data.templateName.trim() || null
    if (data.language !== undefined) patch.language = data.language.trim() || 'en_US'

    const config = await prisma.followUpReminderConfig.upsert({
        where: { id: 1 },
        update: patch,
        create: { id: 1, enabled: !!data.enabled, templateName: data.templateName?.trim() || null, language: data.language?.trim() || 'en_US' },
    })

    revalidatePath('/follow-ups')
    return {
        success: true,
        data: { enabled: config.enabled, templateName: config.templateName || '', language: config.language },
    }
}

export async function runFollowUpRemindersNow() {
    try { await requireRole('ADMIN', 'MANAGER') } catch { return { success: false, error: 'Access denied' } }
    const summary = await runFollowUpReminders()
    revalidatePath('/follow-ups')
    return { success: true, data: summary }
}
