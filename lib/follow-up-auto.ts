import { prisma } from '@/lib/db'
import { parseFollowUpIntent } from '@/lib/follow-up-intent'
import { normalizePhone, phonesMatch } from '@/lib/whatsapp/phone-utils'

// ------------------------------------------------------------
// Chatbot-side auto-conversion: when an inbound WhatsApp message says
// "call me after N days / next month / tomorrow", create a PENDING
// follow-up so the reminder engine reconnects on that date.
//
// Plain server lib (NOT a 'use server' action) so it isn't exposed as a
// client endpoint. Designed to be fire-and-forget — it never throws.
// ------------------------------------------------------------

const OPEN_STATUSES = ['PENDING', 'REMINDED', 'CONTACTED'] as const

export interface AutoFollowUpResult {
    created: boolean
    reason?: string
    id?: number
    error?: string
}

export async function maybeCreateFollowUpFromMessage(args: {
    phone: string
    name?: string | null
    messageText: string
}): Promise<AutoFollowUpResult> {
    try {
        if (!args.phone || !args.messageText) return { created: false, reason: 'missing input' }

        const intent = parseFollowUpIntent(args.messageText)
        if (!intent.matched || !intent.date) return { created: false, reason: 'no intent' }

        // Resolve the CRM contact using the SAME matching the inquiry-sync uses
        // (normalized phone + last-10-digit fuzzy match) so we reuse that contact
        // instead of creating a duplicate.
        const normalized = normalizePhone(args.phone) || args.phone
        const last10 = normalized.slice(-10)

        const candidates = await prisma.contact.findMany({
            where: last10
                ? { OR: [{ phone: normalized }, { phone: { contains: last10 } }] }
                : { phone: normalized },
            take: 10,
        })
        let contact = candidates.find((c) => phonesMatch(c.phone, normalized)) || null
        if (!contact) {
            contact = await prisma.contact.create({
                data: { name: args.name || normalized, phone: normalized, source: 'WhatsApp' },
            })
        }

        // Never create a second open follow-up for the same contact.
        const existing = await prisma.followUpEntry.findFirst({
            where: { contactId: contact.id, status: { in: OPEN_STATUSES as unknown as any[] } },
        })
        if (existing) return { created: false, reason: 'already open' }

        const entry = await prisma.followUpEntry.create({
            data: {
                contactId: contact.id,
                reason: intent.reason || 'Customer asked to be contacted later',
                followUpDate: intent.date,
                priority: 'Medium',
                source: 'WhatsApp',
                status: 'PENDING',
            },
        })

        return { created: true, id: entry.id }
    } catch (err) {
        console.error('[follow-up-auto] failed:', err)
        return { created: false, error: err instanceof Error ? err.message : String(err) }
    }
}
