import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/session'
import { recalculateBroadcastStats } from '@/lib/whatsapp/broadcast-stats'

const RECIPIENT_UPDATE_STATUSES = new Set(['sent', 'failed'])

export async function POST(request: Request) {
  try {
    const session = await getSession()
    if (!session?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    
    const userId = String(session.id)
    const { broadcastId, updates } = await request.json()
    // updates: { contact_id: string, status: 'sent' | 'failed', whatsapp_message_id?: string, error_message?: string }[]

    if (!broadcastId || !Array.isArray(updates)) {
      return NextResponse.json(
        { error: 'broadcastId and updates[] are required' },
        { status: 400 }
      )
    }

    const broadcast = await prisma.waBroadcast.findFirst({
      where: { id: broadcastId, user_id: userId },
      select: { id: true },
    })

    if (!broadcast) {
      return NextResponse.json({ error: 'Broadcast not found' }, { status: 404 })
    }
    
    for (const update of updates) {
      if (!update.contact_id) continue
      if (!RECIPIENT_UPDATE_STATUSES.has(update.status)) continue
      await prisma.waBroadcastRecipient.updateMany({
        where: { broadcast_id: broadcastId, contact_id: update.contact_id },
        data: {
          status: update.status,
          whatsapp_message_id: update.whatsapp_message_id || null,
          error_message: update.error_message || null,
          sent_at: update.status === 'sent' ? new Date() : undefined,
        }
      })
    }

    const stats = await recalculateBroadcastStats(broadcastId)

    return NextResponse.json({ ok: true, stats })
  } catch (error) {
    console.error('Error updating broadcast recipients:', error)
    return NextResponse.json({ error: 'Failed to update broadcast recipients' }, { status: 500 })
  }
}
