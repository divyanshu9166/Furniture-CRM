import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { executeRpc } from '@/lib/supabase/query-engine'

export async function POST(request: Request) {
  const session = await getSession()
  if (!session?.id) {
    return NextResponse.json(
      { data: null, error: { message: 'Unauthorized' } },
      { status: 401 },
    )
  }

  let body: { fn?: string; args?: Record<string, unknown> }
  try {
    body = (await request.json()) as { fn?: string; args?: Record<string, unknown> }
  } catch {
    return NextResponse.json(
      { data: null, error: { message: 'Invalid JSON body' } },
      { status: 400 },
    )
  }

  if (!body.fn) {
    return NextResponse.json(
      { data: null, error: { message: 'fn is required' } },
      { status: 400 },
    )
  }

  const result = await executeRpc(body.fn, body.args, {
    userId: String(session.id),
    admin: false,
  })
  const status = result.error?.message === 'Unauthorized' ? 401 : 200
  return NextResponse.json(result, { status })
}

