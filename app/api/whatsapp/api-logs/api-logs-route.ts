import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { fetchLogs, clearLogs } from '@/lib/whatsapp/api-logger'

// GET /api/whatsapp/api-logs  — fetch recent logs
export async function GET(request: Request) {
  const session = await getSession()
  if (!session?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = String(session.id)

  const { searchParams } = new URL(request.url)
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '100'), 200)

  const logs = await fetchLogs(userId, limit)
  return NextResponse.json({ logs })
}

// DELETE /api/whatsapp/api-logs  — clear all logs
export async function DELETE() {
  const session = await getSession()
  if (!session?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = String(session.id)

  await clearLogs(userId)
  return NextResponse.json({ ok: true })
}