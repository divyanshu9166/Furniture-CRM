import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'

export async function GET() {
  const session = await getSession()
  
  if (!session) {
    return NextResponse.json(null)
  }

  return NextResponse.json({
    user: {
      id: session.id,
      email: session.email,
      name: session.name,
      role: session.role,
      staffId: session.staffId,
    }
  })
}
