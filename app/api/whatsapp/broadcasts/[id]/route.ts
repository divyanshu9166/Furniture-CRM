import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/session'
import { deriveBroadcastStats } from '@/lib/whatsapp/broadcast-stats'

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession()
    if (!session?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const userId = String(session.id)
    
    const params = await context.params
    const id = params.id

    const broadcast = await prisma.waBroadcast.findUnique({
      where: { id, user_id: userId }
    })
    
    if (!broadcast) {
      return NextResponse.json({ error: 'Broadcast not found' }, { status: 404 })
    }

    const recipients = await prisma.waBroadcastRecipient.findMany({
      where: { broadcast_id: id },
      orderBy: { created_at: 'desc' },
      include: {
        contact: true
      }
    })

    const counts: Record<string, number> = {}
    for (const r of recipients) {
      counts[r.status] = (counts[r.status] ?? 0) + 1
    }
    const stats = deriveBroadcastStats(counts)

    const enhancedBroadcast = {
      ...broadcast,
      ...stats,
    }

    return NextResponse.json({ broadcast: enhancedBroadcast, recipients })
  } catch (error) {
    console.error('Error fetching broadcast:', error)
    return NextResponse.json({ error: 'Failed to fetch broadcast' }, { status: 500 })
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession()
    if (!session?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const userId = String(session.id)
    
    const params = await context.params
    const id = params.id

    await prisma.waBroadcast.delete({
      where: { id, user_id: userId }
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting broadcast:', error)
    return NextResponse.json({ error: 'Failed to delete broadcast' }, { status: 500 })
  }
}
