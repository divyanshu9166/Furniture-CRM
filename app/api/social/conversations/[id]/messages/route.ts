/**
 * app/api/social/conversations/[id]/messages/route.ts
 * GET — fetch messages for a social conversation
 * POST — send a manual message from the agent
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/db'
import { decrypt } from '@/lib/whatsapp/encryption'
import { sendTextMessage } from '@/lib/social/messenger-api'

async function getUserId(): Promise<string | null> {
  const session = await getSession()
  return session?.id ? String(session.id) : null
}

// ── GET — load messages ─────────────────────────────────────────────────────

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await getUserId()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: conversationId } = await params

  const conversation = await prisma.socialConversation.findFirst({
    where: { id: conversationId, user_id: userId },
  })
  if (!conversation) {
    return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
  }

  const messages = await prisma.socialMessage.findMany({
    where: { conversation_id: conversationId },
    orderBy: { created_at: 'asc' },
    take: 100,
  })

  // Mark conversation as read
  await prisma.socialConversation.update({
    where: { id: conversationId },
    data: { unread_count: 0 },
  }).catch(() => null)

  return NextResponse.json(messages)
}

// ── POST — send manual message ──────────────────────────────────────────────

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await getUserId()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: conversationId } = await params
  const { text } = await req.json()
  if (!text?.trim()) {
    return NextResponse.json({ error: 'Message text is required' }, { status: 400 })
  }

  const conversation = await prisma.socialConversation.findFirst({
    where: { id: conversationId, user_id: userId },
    include: { contact: true },
  })
  if (!conversation) {
    return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
  }

  const platform = conversation.platform as 'facebook' | 'instagram'
  const recipientId = conversation.contact.platform_id

  // Load the correct config
  let pageAccessToken: string
  if (platform === 'facebook') {
    const cfg = await prisma.fbConfig.findUnique({ where: { user_id: userId } })
    if (!cfg) return NextResponse.json({ error: 'Facebook not configured' }, { status: 400 })
    pageAccessToken = decrypt(cfg.page_access_token)
  } else {
    const cfg = await prisma.igConfig.findUnique({ where: { user_id: userId } })
    if (!cfg) return NextResponse.json({ error: 'Instagram not configured' }, { status: 400 })
    pageAccessToken = decrypt(cfg.page_access_token)
  }

  let messageId: string | undefined
  try {
    const result = await sendTextMessage({
      recipientId,
      pageAccessToken,
      text: text.trim(),
    })
    messageId = result.messageId
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: `Send failed: ${message}` }, { status: 502 })
  }

  // Save the outbound message
  const saved = await prisma.socialMessage.create({
    data: {
      conversation_id: conversationId,
      platform_msg_id: messageId,
      sender_type: 'agent',
      content_type: 'text',
      content_text: text.trim(),
      status: 'sent',
    },
  })

  await prisma.socialConversation.update({
    where: { id: conversationId },
    data: {
      last_message_text: text.trim(),
      last_message_at: new Date(),
    },
  })

  return NextResponse.json(saved)
}
