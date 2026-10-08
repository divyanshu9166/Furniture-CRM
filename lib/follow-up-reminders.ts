import { runReminderSweep } from './commerce/reminder-sweep'
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

export { isCompatibleReminderTemplate } from './commerce/reminders'
import { isCompatibleReminderTemplate } from './commerce/reminders'

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
        select: { name: true, language: true, body_text: true, category: true, header_type: true, header_content: true, buttons: true },
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

    return runReminderSweep({
        db: prisma, config, catalog: await getFollowUpReminderTemplates(),
        sendWhatsApp: notifyContactByWhatsApp, sendSocial: notifyContactBySocial,
    })
}
