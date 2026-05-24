import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { executeQuery } from '@/lib/supabase/query-engine'
import type { QueryRequest } from '@/lib/supabase/compat-types'

export async function POST(request: Request) {
  const session = await getSession()
  if (!session?.id) {
    return NextResponse.json(
      { data: null, error: { message: 'Unauthorized' } },
      { status: 401 },
    )
  }

  let body: QueryRequest
  try {
    body = (await request.json()) as QueryRequest
  } catch {
    return NextResponse.json(
      { data: null, error: { message: 'Invalid JSON body' } },
      { status: 400 },
    )
  }

  const result = await executeQuery(body, {
    userId: String(session.id),
    admin: false,
  })

  const status = result.error?.message === 'Unauthorized' ? 401 : 200
  return NextResponse.json(result, { status })
}

