import { prisma } from '@/lib/db'
import { parseFollowUpIntent } from '@/lib/follow-up-intent'
import { inventoryTransaction } from '@/lib/inventory/stock'
import { billingContact } from '@/lib/commerce/documents'
import { lockFollowUpContact } from '@/lib/commerce/follow-ups'

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

        return await inventoryTransaction(prisma, async tx => {
        const contact = await billingContact(tx, { customer: args.name || args.phone, phone: args.phone }, false)
        await lockFollowUpContact(tx, contact.id)

        // Never create a second open follow-up for the same contact.
        const existing = await tx.followUpEntry.findFirst({
            where: { contactId: contact.id, status: { in: OPEN_STATUSES as unknown as any[] } },
        })
        if (existing) return { created: false, reason: 'already open' }

        const entry = await tx.followUpEntry.create({
            data: {
                contactId: contact.id,
                reason: intent.reason || 'Customer asked to be contacted later',
                followUpDate: intent.date!,
                priority: 'Medium',
                source: 'WhatsApp',
                status: 'PENDING',
            },
        })

        return { created: true, id: entry.id }
        })
    } catch (err) {
        console.error('[follow-up-auto] failed:', err)
        return { created: false, error: err instanceof Error ? err.message : String(err) }
    }
}
