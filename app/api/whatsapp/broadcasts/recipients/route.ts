import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/session'

export async function POST(request: Request) {
  try {
    const session = await getSession()
    if (!session?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    
    const { broadcastId, updates } = await request.json()
    // updates: { contact_id: string, status: 'sent' | 'failed', whatsapp_message_id?: string, error_message?: string }[]

    // Apply each recipient update
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

    // Re-derive aggregate counts directly from recipient rows.
    // This is intentionally done in application code rather than relying
    // on a Postgres trigger, so counts stay correct even if the DB
    // migration that installs the trigger hasn't been applied.
    const agg = await prisma.waBroadcastRecipient.groupBy({
      by: ['status'],
      where: { broadcast_id: broadcastId },
      _count: { status: true },
    })

    const countByStatus: Record<string, number> = {}
    for (const row of agg) {
      countByStatus[row.status] = row._count.status
    }

    // Ladder semantics (same as the DB trigger):
    //   sent_count      = recipients at or past 'sent' (sent|delivered|read|replied)
    //   delivered_count = recipients at or past 'delivered'
    //   read_count      = recipients at or past 'read'
    //   replied_count   = exactly 'replied'
    //   failed_count    = exactly 'failed'
    const s = (k: string) => countByStatus[k] ?? 0
    const sent_count      = s('sent') + s('delivered') + s('read') + s('replied')
    const delivered_count = s('delivered') + s('read') + s('replied')
    const read_count      = s('read') + s('replied')
    const replied_count   = s('replied')
    const failed_count    = s('failed')

    await prisma.waBroadcast.update({
      where: { id: broadcastId },
      data: { sent_count, delivered_count, read_count, replied_count, failed_count },
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Error updating broadcast recipients:', error)
    return NextResponse.json({ error: 'Failed to update broadcast recipients' }, { status: 500 })
  }
}