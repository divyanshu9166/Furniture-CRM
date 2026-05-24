import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/db'

export async function GET() {
  const session = await getSession()
  
  if (!session) {
    return NextResponse.json(null)
  }

  const userId = Number(session.id)
  const user = Number.isFinite(userId)
    ? await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          staffId: true,
          createdAt: true,
        },
      })
    : null

  if (user) {
    await prisma.waProfile.upsert({
      where: { user_id: String(user.id) },
      update: {
        full_name: user.name,
        email: user.email,
        role: user.role,
      },
      create: {
        user_id: String(user.id),
        full_name: user.name,
        email: user.email,
        role: user.role,
      },
    })
  }

  return NextResponse.json({
    user: {
      id: user ? String(user.id) : session.id,
      email: user?.email ?? session.email,
      name: user?.name ?? session.name,
      role: user?.role ?? session.role,
      staffId: user?.staffId ?? session.staffId,
      created_at: user?.createdAt?.toISOString() ?? null,
    }
  })
}
