import { prisma } from '@/lib/db'
import { parseFollowUpIntent } from '@/lib/follow-up-intent'

// ------------------------------------------------------------
// Chatbot-side auto-conversion for Facebook / Instagram: when an inbound DM
// says "contact me after N days / next month / tomorrow", create a PENDING
// follow-up linked to the SocialContact. On the due date the reminder engine
// re-engages them via the chatbot (Messenger), not a WhatsApp template.
//
// Fire-and-forget — never throws.
// ------------------------------------------------------------

const OPEN_STATUSES = ['PENDING', 'REMINDED', 'CONTACTED'] as const

export async function maybeCreateSocialFollowUp(args: {
    socialContactId: string
    platform: 'facebook' | 'instagram'
    name?: string | null
    messageText: string
}): Promise<{ created: boolean; reason?: string; id?: number; error?: string }> {
    try {
        if (!args.socialContactId || !args.messageText) return { created: false, reason: 'missing input' }

        const intent = parseFollowUpIntent(args.messageText)
        if (!intent.matched || !intent.date) return { created: false, reason: 'no intent' }

        const existing = await prisma.followUpEntry.findFirst({
            where: { socialContactId: args.socialContactId, status: { in: OPEN_STATUSES as unknown as any[] } },
        })
        if (existing) return { created: false, reason: 'already open' }

        const entry = await prisma.followUpEntry.create({
            data: {
                channel: args.platform,
                socialContactId: args.socialContactId,
                displayName: args.name || null,
                reason: intent.reason || 'Customer asked to be contacted later',
                followUpDate: intent.date,
                priority: 'Medium',
                source: args.platform === 'instagram' ? 'Instagram' : 'Facebook',
                status: 'PENDING',
            },
        })

        return { created: true, id: entry.id }
    } catch (err) {
        console.error('[social-follow-up-auto] failed:', err)
        return { created: false, error: err instanceof Error ? err.message : String(err) }
    }
}
