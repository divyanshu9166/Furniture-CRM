import { prisma } from '@/lib/db'
import { notifyContactByWhatsApp } from '@/lib/whatsapp/crm-notify'
import { notifyContactBySocial } from '@/lib/social/social-notify'

// ------------------------------------------------------------
// Scheduled WhatsApp follow-up reminders.
//
// Flow: when a follow-up's date arrives (due today or overdue), send ONE
// approved WhatsApp template to the contact, then flip the entry to
// REMINDED so it never fires again. The customer's reply re-opens the 24h
// window and the chatbot / agent takes over; an admin then resolves the
// follow-up to Converted or Lost.
//
// Only PENDING entries are picked up, so this is idempotent by design.
// ------------------------------------------------------------

export interface ReminderRunSummary {
    enabled: boolean
    processed: number
    sent: number
    skipped: number
    failed: number
    reason?: string
}

export interface ReminderTemplateOption {
    name: string
    language: string
    bodyText: string
}

const TEMPLATE_VARIABLE = /{{\s*(\d+)\s*}}/g
const REMINDER_LEASE_MS = 15 * 60 * 1000

function variableIndexes(text: string | null | undefined) {
    return Array.from(text?.matchAll(TEMPLATE_VARIABLE) ?? [], (match) => Number(match[1]))
}

function hasDynamicTemplateValue(value: unknown): boolean {
    if (typeof value === 'string') return /{{\s*\d+\s*}}/.test(value)
    if (Array.isArray(value)) return value.some(hasDynamicTemplateValue)
    if (value && typeof value === 'object') return Object.values(value).some(hasDynamicTemplateValue)
    return false
}

/**
 * The reminder engine supplies exactly one body parameter: the customer name.
 * Keep templates with incompatible header or button variables out of the
 * selector so Meta never rejects an automatic reminder at send time.
 */
export function isCompatibleReminderTemplate(template: {
    body_text: string
    header_type: string | null
    header_content: string | null
    buttons: unknown
}) {
    const bodyVariables = [...new Set(variableIndexes(template.body_text))]
    return bodyVariables.length === 1 && bodyVariables[0] === 1 &&
        (template.header_type === null || template.header_type === 'text') &&
        variableIndexes(template.header_content).length === 0 &&
        !hasDynamicTemplateValue(template.buttons)
}

/** Uses the same connected WhatsApp account that the reminder sender uses. */
export async function getFollowUpReminderTemplates(): Promise<{
    templates: ReminderTemplateOption[]
    reason?: string
}> {
    const account =
        await prisma.waWhatsappConfig.findFirst({ where: { status: 'connected' }, select: { user_id: true } }) ??
        await prisma.waWhatsappConfig.findFirst({ select: { user_id: true } })

    if (!account) return { templates: [], reason: 'WhatsApp is not configured yet.' }

    const templates = await prisma.waMessageTemplate.findMany({
        where: { user_id: account.user_id, status: 'Approved' },
        select: { name: true, language: true, body_text: true, header_type: true, header_content: true, buttons: true },
        orderBy: [{ name: 'asc' }, { language: 'asc' }],
    })

    const compatibleTemplates = templates
        .filter(isCompatibleReminderTemplate)
        .map((template) => ({ name: template.name, language: template.language, bodyText: template.body_text }))

    return {
        templates: compatibleTemplates,
        reason: compatibleTemplates.length
            ? undefined
            : templates.length
                ? 'No approved Meta template is compatible. It must use only body variable {{1}} and no dynamic header or button variables.'
                : 'No approved Meta templates were found. Sync them from WhatsApp settings first.',
    }
}

export async function getFollowUpReminderConfig() {
    return prisma.followUpReminderConfig.upsert({
        where: { id: 1 },
        update: {},
        create: { id: 1, enabled: false, language: 'en_US' },
    })
}

export async function runFollowUpReminders(): Promise<ReminderRunSummary> {
    const config = await getFollowUpReminderConfig()

    if (!config.enabled) {
        return { enabled: false, processed: 0, sent: 0, skipped: 0, failed: 0, reason: 'reminders disabled' }
    }

    // Due = scheduled for today or earlier (end of today, local time).
    const now = new Date()
    const endOfToday = new Date(now)
    endOfToday.setHours(23, 59, 59, 999)
    const expiredLeaseAt = new Date(now.getTime() - REMINDER_LEASE_MS)

    const due = await prisma.followUpEntry.findMany({
        where: {
            status: 'PENDING',
            followUpDate: { lte: endOfToday },
            OR: [{ lastContactedAt: null }, { lastContactedAt: { lt: expiredLeaseAt } }],
        },
        include: {
            contact: { select: { name: true, phone: true } },
            socialContact: { select: { id: true, user_id: true, platform: true, platform_id: true, name: true } },
        },
        orderBy: { followUpDate: 'asc' },
        take: 200,
    })

    const templateCatalog = await getFollowUpReminderTemplates()
    const selectedTemplate = config.templateName
        ? templateCatalog.templates.find((template) => template.name === config.templateName && template.language === config.language)
        : undefined

    let sent = 0
    let skipped = 0
    let failed = 0

    for (const f of due) {
        // A short lease makes concurrent manual, cron and BullMQ runs safe.
        // If a worker dies, another run can retry after the lease expires.
        const leaseStartedAt = new Date()
        const claim = await prisma.followUpEntry.updateMany({
            where: {
                id: f.id,
                status: 'PENDING',
                OR: [{ lastContactedAt: null }, { lastContactedAt: { lt: expiredLeaseAt } }],
            },
            data: { lastContactedAt: leaseStartedAt },
        })
        if (claim.count === 0) continue

        const name = f.contact?.name || f.socialContact?.name || f.displayName || 'there'
        const interest = f.interest ? ` in ${f.interest}` : ''
        const text = `Hi ${name}, just following up regarding your interest${interest}. Whenever you're ready, we're happy to help — reply here and our team will assist you.`

        let res: { sent: boolean; skipped?: boolean; error?: string }

        try {
        if (f.channel === 'facebook' || f.channel === 'instagram') {
            // ── Instagram / Facebook → chatbot message (Messenger, HUMAN_AGENT tag)
            const sc = f.socialContact
            if (!sc) {
                skipped++
                await prisma.followUpEntry.updateMany({ where: { id: f.id, status: 'PENDING', lastContactedAt: leaseStartedAt }, data: { lastContactedAt: null } })
                continue
            }
            res = await notifyContactBySocial({
                userId: sc.user_id,
                platform: f.channel,
                platformId: sc.platform_id,
                socialContactId: sc.id,
                text,
            })
        } else {
            // ── WhatsApp → approved template (or free-form text inside 24h) ──
            const phone = f.contact?.phone
            if (!phone || !selectedTemplate) {
                skipped++
                await prisma.followUpEntry.updateMany({ where: { id: f.id, status: 'PENDING', lastContactedAt: leaseStartedAt }, data: { lastContactedAt: null } })
                continue
            }
            res = await notifyContactByWhatsApp({
                phone,
                name,
                text,
                templateName: selectedTemplate.name,
                language: selectedTemplate.language,
                // Template body variable {{1}} = customer name.
                templateParams: [name],
            })
        }

        if (res.sent) {
            // Fire exactly once: move out of PENDING so it's never reminded again.
            await prisma.followUpEntry.updateMany({
                where: { id: f.id, status: 'PENDING', lastContactedAt: leaseStartedAt },
                data: { status: 'REMINDED', lastContactedAt: new Date() },
            })
            sent++
        } else if (res.skipped) {
            // e.g. template/channel not configured yet — leave PENDING for later.
            skipped++
            await prisma.followUpEntry.updateMany({ where: { id: f.id, status: 'PENDING', lastContactedAt: leaseStartedAt }, data: { lastContactedAt: null } })
        } else {
            failed++
            await prisma.followUpEntry.updateMany({ where: { id: f.id, status: 'PENDING', lastContactedAt: leaseStartedAt }, data: { lastContactedAt: null } })
        }
        } catch {
            failed++
            await prisma.followUpEntry.updateMany({ where: { id: f.id, status: 'PENDING', lastContactedAt: leaseStartedAt }, data: { lastContactedAt: null } })
        }
    }

    return {
        enabled: true,
        processed: due.length,
        sent,
        skipped,
        failed,
        reason: selectedTemplate || !due.some((entry) => entry.channel === 'whatsapp')
            ? undefined
            : templateCatalog.reason || 'The configured Meta template is no longer approved or compatible.',
    }
}
