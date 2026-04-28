import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import bcrypt from 'bcryptjs'
import { createSession } from '@/lib/session'

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { email, password, staffId, pin, type } = body

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
    
    if (type === 'staff-pin') {
      if (!staffId || !pin) {
        return NextResponse.json({ error: 'Missing staff ID or PIN' }, { status: 400 })
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

      const expectedPin = (staff.phone || '').replace(/\s/g, '').slice(-4)
      if (pin !== expectedPin) {
        return NextResponse.json({ error: 'Invalid PIN' }, { status: 401 })
      }

      if (staff.user) {
        await createSession({
          id: String(staff.user.id),
          email: staff.user.email,
          name: staff.user.name,
          role: staff.user.role,
          staffId: staff.id,
        })
      } else {
        await createSession({
          id: `staff-${staff.id}`,
          email: staff.email || `staff-${staff.id}@local`,
          name: staff.name,
          role: 'STAFF',
          staffId: staff.id,
        })
      }

      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ error: 'Invalid login type' }, { status: 400 })
  } catch (error) {
    console.error('Login error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
