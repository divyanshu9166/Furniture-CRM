import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { decrypt, encrypt } from '@/lib/whatsapp/encryption'
import { getAiAgentQueue } from '@/lib/queues/jobs'

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams
  const mode      = searchParams.get('hub.mode')
  const token     = searchParams.get('hub.verify_token')
  const challenge = searchParams.get('hub.challenge')

  const config = await prisma.fbConfig.findFirst({
    where: { status: 'connected' },
  })

  if (mode === 'subscribe' && token === config?.verify_token) {
    return new NextResponse(challenge, { status: 200 })
  }
  return NextResponse.json({ error: 'Verification failed' }, { status: 403 })
}

export async function POST(req: NextRequest) {
  // Always return 200 immediately to prevent Meta retries
  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ status: 'ok' })

  // Process async
  handleWebhook(body).catch(err =>
    console.error('[fb-webhook] Error:', err)
  )

  return NextResponse.json({ success: true })
}

async function handleWebhook(body: any) {
  const config = await prisma.fbConfig.findFirst({
    where: { status: 'connected' },
  })

  if (!config) {
    console.warn('[fb-webhook] No FB config found')
    return
  }

  const userId = config.user_id
  const pageAccessToken = decrypt(config.page_access_token)

  for (const entry of body.entry || []) {
    for (const event of entry.messaging || []) {
      // Skip echoes, delivery, read receipts
      if (event.message?.is_echo) continue
      if (event.delivery || event.read) continue
      if (!event.message?.text && !event.message?.attachments) continue

      const senderId = event.sender?.id
      const messageText = event.message?.text || ''
      const platformMsgId = event.message?.mid

      // Deduplicate
      if (platformMsgId) {
        const existing = await prisma.socialMessage.findFirst({
          where: { platform_msg_id: platformMsgId },
        })
        if (existing) {
          console.log(`[fb-webhook] Duplicate mid ${platformMsgId} - skipping`)
          continue
        }
      }

      // Find or create contact
      let contact = await prisma.socialContact.findFirst({
        where: { user_id: userId, platform: 'facebook', platform_id: senderId },
      })

      if (!contact) {
        let name = `FB User ${senderId.slice(-4)}`
        try {
          const res = await fetch(
            `https://graph.facebook.com/v21.0/${senderId}?fields=name&access_token=${encodeURIComponent(pageAccessToken)}`
          )
          if (res.ok) {
            const profile = await res.json()
            name = profile.name || name
          }
        } catch {}

        contact = await prisma.socialContact.create({
          data: {
            id: `sc_${Date.now()}_${Math.random().toString(36).slice(2)}`,
            user_id: userId,
            platform: 'facebook',
            platform_id: senderId,
            name,
          },
        })
      }

      // Find or create conversation
      let conversation = await prisma.socialConversation.findFirst({
        where: { user_id: userId, contact_id: contact.id },
      })

      if (!conversation) {
        conversation = await prisma.socialConversation.create({
          data: {
            id: `conv_${Date.now()}_${Math.random().toString(36).slice(2)}`,
            user_id: userId,
            contact_id: contact.id,
            platform: 'facebook',
            status: 'open',
          },
        })
      }

      // Save message
      await prisma.socialMessage.create({
        data: {
          id: `msg_${Date.now()}_${Math.random().toString(36).slice(2)}`,
          conversation_id: conversation.id,
          platform_msg_id: platformMsgId,
          sender_type: 'customer',
          content_type: 'text',
          content_text: messageText,
          status: 'delivered',
        },
      })

      // Update conversation
      await prisma.socialConversation.update({
        where: { id: conversation.id },
        data: {
          last_message_text: messageText,
          last_message_at: new Date(),
          unread_count: { increment: 1 },
        },
      })

      console.log(`[fb-webhook] ✅ Message saved from ${contact.name}: ${messageText}`)

      // Enqueue AI agent
      getAiAgentQueue()
        .add('handle_message', {
          userId,
          conversationId: conversation.id,
          contactId: contact.id,
          contactPhone: senderId,
          messageText,
          incomingMessageId: platformMsgId ?? '',
          channel: 'facebook',
          socialPageAccessToken: encrypt(pageAccessToken),
          socialRecipientId: senderId,
        }, {
          jobId: `fb-agent:${contact.id}:${platformMsgId ?? Date.now()}`,
          removeOnComplete: { count: 200 },
          removeOnFail: { count: 500 },
        })
        .catch(err => console.error('[fb-webhook] AI queue error:', err))
    }
  }
}
