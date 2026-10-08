import type { Prisma, PrismaClient } from '@prisma/client'
import { dueCalendarCutoff } from './rules'
import { REMINDER_LEASE_MS } from './follow-ups'

type Summary = { enabled: boolean; processed: number; sent: number; skipped: number; failed: number; reason?: string }
type SendResult = { sent: boolean; skipped?: boolean; error?: string; reason?: string }
type Template = { name: string; language: string; bodyText: string }
type Dependencies = {
    db: Pick<PrismaClient, 'followUpEntry'>
    config: { enabled: boolean; templateName: string | null; language: string }
    catalog: { templates: Template[]; reason?: string }
    now?: Date
    sendWhatsApp: (args: { phone: string; name: string; text: string; templateName: string; language: string; templateParams: string[] }) => Promise<SendResult>
    sendSocial: (args: { userId: string; platform: 'facebook' | 'instagram'; platformId: string; socialContactId: string; text: string }) => Promise<SendResult>
}

// Injected dependencies permit testing claims, pagination and send outcomes
// without importing database credentials or contacting a provider.
export async function runReminderSweep(deps: Dependencies): Promise<Summary> {
    const config = deps.config
    if (!config.enabled) return { enabled: false, processed: 0, sent: 0, skipped: 0, failed: 0, reason: 'reminders disabled' }
    // Due = scheduled for today or earlier (end of today, local time).
    const now = deps.now ?? new Date()
    const endOfToday = dueCalendarCutoff(now)
    const expiredLeaseAt = new Date(now.getTime() - REMINDER_LEASE_MS)

    const query = {
        where: {
            status: 'PENDING',
            followUpDate: { lte: endOfToday },
            OR: [{ lastContactedAt: null }, { lastContactedAt: { lt: expiredLeaseAt } }],
        },
        include: {
            contact: { select: { name: true, phone: true } },
            socialContact: { select: { id: true, user_id: true, platform: true, platform_id: true, name: true } },
        },
    } satisfies Prisma.FollowUpEntryFindManyArgs

    const templateCatalog = deps.catalog
    const selectedTemplate = config.templateName
        ? templateCatalog.templates.find((template) => template.name === config.templateName && template.language === config.language)
        : undefined

    let sent = 0
    let skipped = 0
    let failed = 0
    const skipReasons = new Set<string>()

    let cursor = 0
    let processed = 0
    let whatsappDue = false
    for (;;) {
    const due = await deps.db.followUpEntry.findMany({ ...query, where: { ...query.where, id: { gt: cursor } }, orderBy: { id: 'asc' }, take: 100 })
    if (!due.length) break
    cursor = due[due.length - 1].id
    whatsappDue ||= due.some(entry => entry.channel === 'whatsapp')
    for (const f of due) {
        // A short lease makes concurrent manual, cron and BullMQ runs safe.
        // If a worker dies, another run can retry after the lease expires.
        const leaseStartedAt = deps.now ? new Date(deps.now) : new Date()
        const claim = await deps.db.followUpEntry.updateMany({
            where: {
                id: f.id,
                status: 'PENDING',
                updatedAt: f.updatedAt,
                followUpDate: { lte: endOfToday },
                OR: [{ lastContactedAt: null }, { lastContactedAt: { lt: expiredLeaseAt } }],
            },
            data: { lastContactedAt: leaseStartedAt },
        })
        if (claim.count === 0) continue
        processed++

        if (!['whatsapp', 'facebook', 'instagram'].includes(f.channel)) {
            skipped++
            skipReasons.add('A follow-up has an unsupported channel')
            await deps.db.followUpEntry.updateMany({ where: { id: f.id, status: 'PENDING', lastContactedAt: leaseStartedAt }, data: { lastContactedAt: null } })
            continue
        }

        const name = f.contact?.name || f.socialContact?.name || f.displayName || 'there'
        const interest = f.interest ? ` in ${f.interest}` : ''
        const text = `Hi ${name}, just following up regarding your interest${interest}. Whenever you're ready, we're happy to help — reply here and our team will assist you.`

        let res: SendResult
        let remoteAccepted = false

        try {
        if (f.channel === 'facebook' || f.channel === 'instagram') {
            // ── Instagram / Facebook → automated reply inside the 24h window
            const sc = f.socialContact
            if (!sc) {
                skipped++
                skipReasons.add('A social follow-up has no linked social contact')
                await deps.db.followUpEntry.updateMany({ where: { id: f.id, status: 'PENDING', lastContactedAt: leaseStartedAt }, data: { lastContactedAt: null } })
                continue
            }
            res = await deps.sendSocial({
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
                skipReasons.add(!phone ? 'A WhatsApp follow-up has no phone' : templateCatalog.reason || 'The configured reminder template is unavailable')
                await deps.db.followUpEntry.updateMany({ where: { id: f.id, status: 'PENDING', lastContactedAt: leaseStartedAt }, data: { lastContactedAt: null } })
                continue
            }
            res = await deps.sendWhatsApp({
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
            remoteAccepted = true
            // Fire exactly once: move out of PENDING so it's never reminded again.
            await deps.db.followUpEntry.updateMany({
                where: { id: f.id, status: 'PENDING', lastContactedAt: leaseStartedAt },
                data: { status: 'REMINDED', lastContactedAt: deps.now ? new Date(deps.now) : new Date() },
            })
            sent++
        } else if (res.skipped) {
            // e.g. template/channel not configured yet — leave PENDING for later.
            skipped++
            if (res.reason) skipReasons.add(res.reason)
            await deps.db.followUpEntry.updateMany({ where: { id: f.id, status: 'PENDING', lastContactedAt: leaseStartedAt }, data: { lastContactedAt: null } })
        } else {
            failed++
            console.warn('[follow-up-reminders] send failed', { id: f.id, channel: f.channel })
            await deps.db.followUpEntry.updateMany({ where: { id: f.id, status: 'PENDING', lastContactedAt: leaseStartedAt }, data: { lastContactedAt: null } })
        }
        } catch {
            failed++
            console.warn('[follow-up-reminders] unexpected failure', { id: f.id, channel: f.channel, remoteAccepted })
            // A successful external send followed by a DB failure is ambiguous.
            // Keep its lease; do not immediately allow a concurrent resend.
            if (remoteAccepted) continue
            await deps.db.followUpEntry.updateMany({ where: { id: f.id, status: 'PENDING', lastContactedAt: leaseStartedAt }, data: { lastContactedAt: null } })
        }
    }

    }
    return {
        enabled: true,
        processed,
        sent,
        skipped,
        failed,
        reason: [...skipReasons, ...(!selectedTemplate && whatsappDue ? [templateCatalog.reason || 'The configured Meta template is no longer approved or compatible.'] : [])].filter(Boolean).join('; ') || undefined,
    }
}
