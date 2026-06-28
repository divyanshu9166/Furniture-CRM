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
    const endOfToday = new Date()
    endOfToday.setHours(23, 59, 59, 999)

    const due = await prisma.followUpEntry.findMany({
        where: { status: 'PENDING', followUpDate: { lte: endOfToday } },
        include: {
            contact: { select: { name: true, phone: true } },
            socialContact: { select: { id: true, user_id: true, platform: true, platform_id: true, name: true } },
        },
        orderBy: { followUpDate: 'asc' },
        take: 200,
    })

    let sent = 0
    let skipped = 0
    let failed = 0

    for (const f of due) {
        const name = f.contact?.name || f.socialContact?.name || f.displayName || 'there'
        const interest = f.interest ? ` in ${f.interest}` : ''
        const text = `Hi ${name}, just following up regarding your interest${interest}. Whenever you're ready, we're happy to help — reply here and our team will assist you.`

        let res: { sent: boolean; skipped?: boolean; error?: string }

        if (f.channel === 'facebook' || f.channel === 'instagram') {
            // ── Instagram / Facebook → chatbot message (Messenger, HUMAN_AGENT tag)
            const sc = f.socialContact
            if (!sc) { skipped++; continue }
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
            if (!phone) { skipped++; continue }
            res = await notifyContactByWhatsApp({
                phone,
                name,
                text,
                templateName: config.templateName,
                language: config.language,
                // Template body variable {{1}} = customer name.
                templateParams: [name],
            })
        }

        if (res.sent) {
            // Fire exactly once: move out of PENDING so it's never reminded again.
            await prisma.followUpEntry.update({
                where: { id: f.id },
                data: { status: 'REMINDED', lastContactedAt: new Date() },
            })
            sent++
        } else if (res.skipped) {
            // e.g. template/channel not configured yet — leave PENDING for later.
            skipped++
        } else {
            failed++
        }
    }

    return { enabled: true, processed: due.length, sent, skipped, failed }
}
