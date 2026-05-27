import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/session'

export async function POST(request: Request) {
  try {
    const session = await getSession()
    if (!session?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    
    const { broadcastId, updates } = await request.json()
    // updates: { contact_id: string, status: 'sent' | 'failed', whatsapp_message_id?: string, error_message?: string }[]
    
    for (const update of updates) {
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

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Error updating broadcast recipients:', error)
    return NextResponse.json({ error: 'Failed to update broadcast recipients' }, { status: 500 })
  }
}
