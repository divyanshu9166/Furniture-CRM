/**
 * app/api/social/conversations/[id]/route.ts
 * PATCH — update conversation status (resolve / reopen)
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/db'

async function getUserId(): Promise<string | null> {
  const session = await getSession()
  return session?.id ? String(session.id) : null
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await getUserId()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: conversationId } = await params

  let body: { status?: string; needs_human?: boolean }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const allowedStatuses = ['open', 'resolved', 'archived']
  if (body.status !== undefined && !allowedStatuses.includes(body.status)) {
    return NextResponse.json({ error: `Invalid status. Must be one of: ${allowedStatuses.join(', ')}` }, { status: 400 })
  }

  const conversation = await prisma.socialConversation.findFirst({
    where: { id: conversationId, user_id: userId },
  })
  if (!conversation) {
    return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
  }

  const updates: Record<string, unknown> = {}
  if (body.status !== undefined) updates.status = body.status
  if (body.needs_human !== undefined) updates.needs_human = body.needs_human

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No updates provided' }, { status: 400 })
  }

  const updated = await prisma.socialConversation.update({
    where: { id: conversationId },
    data: updates,
    include: { contact: true },
  })

  return NextResponse.json(updated)
}
