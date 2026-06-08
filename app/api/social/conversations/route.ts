/**
 * app/api/social/conversations/route.ts
 * GET — list social conversations (Facebook or Instagram) for the logged-in user
 * Query params:
 *   platform=facebook|instagram  (required)
 *   status=open|resolved|archived (optional, default all)
 *   limit=50 (optional)
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/db'

export async function GET(req: NextRequest) {
  const session = await getSession()
  const userId = session?.id ? String(session.id) : null
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const platform = searchParams.get('platform') // facebook | instagram
  const status = searchParams.get('status')     // open | resolved | archived | null (all)
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '50', 10), 100)

  if (!platform || !['facebook', 'instagram'].includes(platform)) {
    return NextResponse.json({ error: 'platform must be facebook or instagram' }, { status: 400 })
  }

  const conversations = await prisma.socialConversation.findMany({
    where: {
      user_id: userId,
      platform,
      ...(status ? { status } : {}),
    },
    orderBy: { last_message_at: 'desc' },
    take: limit,
    include: {
      contact: {
        select: {
          id: true,
          name: true,
          platform_id: true,
          profile_pic: true,
        },
      },
    },
  })

  return NextResponse.json(conversations)
}
