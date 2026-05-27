import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/session'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession()
    if (!session?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const userId = String(session.id)
    
    const { id } = await params
    const { status, failed_count } = await request.json()

    const broadcast = await prisma.waBroadcast.findFirst({
      where: { id, user_id: userId }
    })

    if (!broadcast) {
      return NextResponse.json({ error: 'Broadcast not found' }, { status: 404 })
    }

    const updateData: any = { status }
    if (typeof failed_count === 'number') {
      updateData.failed_count = failed_count
    }

    await prisma.waBroadcast.update({
      where: { id },
      data: updateData
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Error updating broadcast status:', error)
    return NextResponse.json({ error: 'Failed to update broadcast status' }, { status: 500 })
  }
}
