import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import bcrypt from 'bcryptjs'
import { createSession } from '@/lib/session'

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { email, password, staffId, type } = body

    if (type === 'credentials') {
      if (!email || !password) {
        return NextResponse.json({ error: 'Missing email or password' }, { status: 400 })
      }

      const normalizedEmail = String(email).trim().toLowerCase()
      const user = await prisma.user.findUnique({
        where: { email: normalizedEmail },
      })

      if (!user || !user.isActive) {
        return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
      }

      const isValid = await bcrypt.compare(password, user.hashedPassword)
      if (!isValid) {
        return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
      }

      await createSession({
        id: String(user.id),
        email: user.email,
        name: user.name,
        role: user.role,
        staffId: user.staffId,
      })

      return NextResponse.json({ success: true })
    } 
    
    if (type === 'staff-credentials') {
      if (!staffId || !password) {
        return NextResponse.json({ error: 'Missing staff ID or password' }, { status: 400 })
      }

      const sId = parseInt(staffId)
      if (isNaN(sId)) {
        return NextResponse.json({ error: 'Invalid staff ID' }, { status: 400 })
      }

      const staff = await prisma.staff.findUnique({
        where: { id: sId },
        include: { user: true },
      })

      if (!staff || staff.status !== 'Active') {
        return NextResponse.json({ error: 'Staff not found or inactive' }, { status: 401 })
      }

      if (!staff.user) {
        return NextResponse.json({ error: 'Login credentials are not assigned for this staff member' }, { status: 401 })
      }

      if (!staff.user.isActive) {
        return NextResponse.json({ error: 'Staff login is disabled. Please contact admin.' }, { status: 401 })
      }

      const isValid = await bcrypt.compare(String(password), staff.user.hashedPassword)
      if (!isValid) {
        return NextResponse.json({ error: 'Invalid staff credentials' }, { status: 401 })
      }

      await createSession({
        id: String(staff.user.id),
        email: staff.user.email,
        name: staff.user.name,
        role: staff.user.role,
        staffId: staff.id,
      })

      return NextResponse.json({ success: true })
    }

    if (type === 'staff-pin') {
      return NextResponse.json({ error: 'PIN login is no longer supported. Please use your assigned login password.' }, { status: 400 })
    }

    return NextResponse.json({ error: 'Invalid login type' }, { status: 400 })
  } catch (error) {
    console.error('Login error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
