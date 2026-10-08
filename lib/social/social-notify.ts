import { isSessionWindowOpen } from '@/lib/whatsapp/session-window'
import { prisma } from '@/lib/db'
import { decrypt } from '@/lib/whatsapp/encryption'
import { sendTextMessage } from '@/lib/social/messenger-api'

// ------------------------------------------------------------
// Sends a follow-up reminder to a Facebook / Instagram contact via the
// chatbot (Messenger Platform), only inside the standard 24h window.
// Automated reminders must not use the human-agent exception. Updates the
// conversation so it shows in the social inbox. Never throws.
// ------------------------------------------------------------

export interface SocialNotifyResult {
    sent: boolean
    skipped?: boolean
    reason?: string
    error?: string
    messageId?: string
}

export async function notifyContactBySocial(args: {
    userId: string
    platform: 'facebook' | 'instagram'
    platformId: string // PSID / IGSID
    socialContactId: string
    text: string
}): Promise<SocialNotifyResult> {
    try {
        const cfg =
            args.platform === 'instagram'
                ? await prisma.igConfig.findUnique({ where: { user_id: args.userId } })
                : await prisma.fbConfig.findUnique({ where: { user_id: args.userId } })

        if (!cfg) return { sent: false, skipped: true, reason: `${args.platform} not configured` }

        const existingConversation = await prisma.socialConversation.findFirst({
            where: { user_id: args.userId, contact_id: args.socialContactId, platform: args.platform },
            select: { id: true },
        })
        const lastInbound = existingConversation ? await prisma.socialMessage.findFirst({
            where: { conversation_id: existingConversation.id, sender_type: 'customer' },
            orderBy: { created_at: 'desc' }, select: { created_at: true },
        }) : null
        if (!isSessionWindowOpen(lastInbound?.created_at ?? null)) return { sent: false, skipped: true, reason: 'Outside 24h window; automated social follow-up needs a new customer reply' }
        const token = decrypt(cfg.page_access_token)

        const res = await sendTextMessage({
            recipientId: args.platformId,
            pageAccessToken: token,
            text: args.text,
        })

        // Mirror the message into the social inbox.
        let convo = await prisma.socialConversation.findFirst({
            where: { user_id: args.userId, contact_id: args.socialContactId },
            select: { id: true },
        })
        if (!convo) {
            convo = await prisma.socialConversation.create({
                data: {
                    user_id: args.userId,
                    contact_id: args.socialContactId,
                    platform: args.platform,
                    status: 'open',
                },
                select: { id: true },
            })
        }
        await prisma.socialMessage.create({
            data: {
                conversation_id: convo.id,
                platform_msg_id: res.messageId,
                sender_type: 'agent',
                content_type: 'text',
                content_text: args.text,
                status: 'sent',
            },
        })
        await prisma.socialConversation.update({
            where: { id: convo.id },
            data: { last_message_text: args.text, last_message_at: new Date() },
        })

        return { sent: true, messageId: res.messageId }
    } catch (err) {
        return { sent: false, error: err instanceof Error ? err.message : String(err) }
    }
}
