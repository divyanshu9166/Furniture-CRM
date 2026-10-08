'use server'

import { inventoryError, inventoryTransaction } from '@/lib/inventory/stock'
import { activeStaff, billingContact } from '@/lib/commerce/documents'
import { assertNoOpenFollowUp, lockedFollowUp, OPEN_FOLLOW_UPS } from '@/lib/commerce/follow-ups'
import { indiaDay } from '@/lib/commerce/rules'
import { shouldRearmReminder } from '@/lib/commerce/reminders'
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
const OPEN_STATUSES = OPEN_FOLLOW_UPS
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

    const today = new Date(`${indiaDay()}T00:00:00Z`)
    const todayMs = today.getTime()
    const dayMs = 86_400_000

    let overdue = 0
    let dueToday = 0
    let upcoming = 0
    for (const r of rows) {
        const d = new Date(r.followUpDate)
        d.setUTCHours(0, 0, 0, 0)
        const diff = Math.round((d.getTime() - todayMs) / dayMs)
        if (diff < 0) overdue++
        else if (diff === 0) dueToday++
        else upcoming++
    }

    const converted = await prisma.followUpEntry.count({ where: { status: 'CONVERTED' } })

    return { success: true, data: { overdue, dueToday, upcoming, converted } }
}

export async function createFollowUp(data: unknown) {
    try {
    if (!await canManageFollowUps()) return accessDenied()
    const parsed = createFollowUpSchema.safeParse(data)
    if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }

    const { name, phone, email, source, interest, budget, reason, followUpDate, priority, assignedToId, notes } =
        parsed.data

    const entry = await inventoryTransaction(prisma, async tx => {
        await activeStaff(tx, assignedToId)
        const contact = await billingContact(tx, { customer: name, phone }, false)
        await assertNoOpenFollowUp(tx, contact.id)
        if (email && !contact.email) await tx.contact.update({ where: { id: contact.id }, data: { email } })
        return tx.followUpEntry.create({ data: {
            contactId: contact.id, interest: interest || null, budget: budget || null, reason: reason || null,
            followUpDate: new Date(followUpDate), priority, source: source || null, status: 'PENDING',
            assignedToId: assignedToId ?? null, notes: notes || null,
        } })
    })

    revalidatePath('/follow-ups')
    return { success: true, data: entry }
    } catch (error) { return { success: false, error: inventoryError(error) } }
}

export async function convertLeadToFollowUp(data: unknown) {
    try {
    if (!await canManageFollowUps()) return accessDenied()
    const parsed = convertLeadToFollowUpSchema.safeParse(data)
    if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }

    const { leadId, followUpDate, priority, reason } = parsed.data

    const entry = await inventoryTransaction(prisma, async tx => {
        await tx.$queryRaw`SELECT id FROM "Lead" WHERE id = ${leadId} FOR UPDATE`
        const lead = await tx.lead.findUnique({ where: { id: leadId } })
        if (!lead) throw new Error('Lead not found')
        if (['CONVERTED', 'LOST'].includes(lead.status)) throw new Error('Resolve/reopen the lead before scheduling a follow-up')
        await assertNoOpenFollowUp(tx, lead.contactId)
        await activeStaff(tx, lead.assignedToId)
        const followUp = await tx.followUpEntry.create({ data: {
            contactId: lead.contactId, leadId, interest: lead.interest, budget: lead.budget, reason: reason || null,
            followUpDate: new Date(followUpDate), priority, source: lead.source, status: 'PENDING', assignedToId: lead.assignedToId,
        } })
        if (lead.status === 'NEW') await tx.lead.update({ where: { id: leadId }, data: { status: 'CONTACTED' } })
        return followUp
    })

    revalidatePath('/follow-ups')
    revalidatePath('/leads')
    return { success: true, data: entry }
    } catch (error) { return { success: false, error: inventoryError(error) } }
}

export async function updateFollowUp(data: unknown) {
    try {
    if (!await canManageFollowUps()) return accessDenied()
    const parsed = updateFollowUpSchema.safeParse(data)
    if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }

    const { id, followUpDate, priority, reason, interest, budget, assignedToId, notes } = parsed.data

    const entry = await inventoryTransaction(prisma, async tx => {
    await activeStaff(tx, assignedToId)
    const current = await lockedFollowUp(tx, id)
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
    if (shouldRearmReminder(current, followUpDate)) {
        patch.status = 'PENDING'
        patch.lastContactedAt = null
    }

    return tx.followUpEntry.update({ where: { id }, data: patch })
    })

    revalidatePath('/follow-ups')
    return { success: true, data: entry }
    } catch (error) { return { success: false, error: inventoryError(error) } }
}

export async function updateFollowUpStatus(data: unknown) {
    try {
    if (!await canManageFollowUps()) return accessDenied()
    const parsed = updateFollowUpStatusSchema.safeParse(data)
    if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }

    const { id, status } = parsed.data
    await inventoryTransaction(prisma, async tx => {
        const current = await lockedFollowUp(tx, id)
        if (OPEN_STATUSES.includes(status as any)) await assertNoOpenFollowUp(tx, current.contactId, current.socialContactId, id)
        await tx.followUpEntry.update({ where: { id }, data: { status, lastContactedAt: status === 'PENDING' ? null : new Date() } })
    })

    revalidatePath('/follow-ups')
    return { success: true }
    } catch (error) { return { success: false, error: inventoryError(error) } }
}

export async function deleteFollowUp(id: unknown) {
    try {
    if (!await canManageFollowUps()) return accessDenied()
    const parsed = followUpIdSchema.safeParse(id)
    if (!parsed.success) return { success: false, error: 'Invalid follow-up ID' }
    await inventoryTransaction(prisma, async tx => {
        await lockedFollowUp(tx, parsed.data)
        await tx.followUpEntry.delete({ where: { id: parsed.data } })
    })
    revalidatePath('/follow-ups')
    return { success: true }
    } catch (error) { return { success: false, error: inventoryError(error) } }
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
    try {
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
    } catch (error) { return { success: false, error: inventoryError(error) } }
}

export async function runFollowUpRemindersNow() {
    try {
    if (!await canManageFollowUps()) return accessDenied()
    const summary = await runFollowUpReminders()
    revalidatePath('/follow-ups')
    return { success: true, data: summary }
    } catch (error) { return { success: false, error: inventoryError(error) } }
}
