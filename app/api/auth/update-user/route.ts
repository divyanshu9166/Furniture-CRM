import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { getSession, createSession } from '@/lib/session'
import { prisma } from '@/lib/db'

export async function POST(request: Request) {
  const session = await getSession()
  if (!session?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = (await request.json().catch(() => null)) as
    | { email?: string; password?: string }
    | null

  const nextEmailRaw = body?.email
  const nextPasswordRaw = body?.password

  const updates: { email?: string; hashedPassword?: string } = {}
  if (typeof nextEmailRaw === 'string' && nextEmailRaw.trim()) {
    updates.email = nextEmailRaw.trim().toLowerCase()
  }
  if (typeof nextPasswordRaw === 'string' && nextPasswordRaw.trim()) {
    const nextPassword = nextPasswordRaw.trim()
    if (nextPassword.length < 8) {
      return NextResponse.json(
        { error: 'Password must be at least 8 characters' },
        { status: 400 },
      )
    }
    updates.hashedPassword = await bcrypt.hash(nextPassword, 12)
  }

  if (!Object.keys(updates).length) {
    return NextResponse.json({ error: 'No changes provided' }, { status: 400 })
  }

  const userId = Number(session.id)
  if (!Number.isFinite(userId)) {
    return NextResponse.json({ error: 'Invalid session' }, { status: 401 })
  }

  if (updates.email) {
    const existing = await prisma.user.findUnique({ where: { email: updates.email } })
    if (existing && existing.id !== userId) {
      return NextResponse.json({ error: 'Email is already in use' }, { status: 409 })
    }
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: updates,
  })

  const profileEmail = updates.email ?? updated.email
  await prisma.waProfile.upsert({
    where: { user_id: String(updated.id) },
    update: {
      email: profileEmail,
    },
    create: {
      user_id: String(updated.id),
      full_name: updated.name,
      email: profileEmail,
      role: updated.role,
    },
  })

  await createSession({
    id: String(updated.id),
    email: updated.email,
    name: updated.name,
    role: updated.role,
    staffId: updated.staffId,
  })

  return NextResponse.json({
    user: {
      id: String(updated.id),
      email: updated.email,
      name: updated.name,
      role: updated.role,
      staffId: updated.staffId,
      created_at: updated.createdAt.toISOString(),
    },
  })
}

