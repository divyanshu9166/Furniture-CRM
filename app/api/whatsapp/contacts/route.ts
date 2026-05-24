import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/auth-helpers'
import { normalizePhone } from '@/lib/whatsapp/phone-utils'

function normalizeForMatch(value: string): string {
  return normalizePhone(value ?? '')
}

function lastTenDigits(value: string): string {
  if (!value) return ''
  return value.length > 10 ? value.slice(-10) : value
}

export async function POST() {
  try {
    const session = await getSession()
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const userId = String(session.user.id)

    const crmContacts = await prisma.contact.findMany({
      select: { name: true, phone: true, email: true },
    })

    if (crmContacts.length === 0) {
      return NextResponse.json({ success: true, created: 0, updated: 0, total: 0 })
    }

    const waContacts = await prisma.waContact.findMany({
      where: { user_id: userId },
      select: { id: true, phone: true, name: true, email: true },
    })

    const waByNormalized = new Map<string, typeof waContacts[number]>()
    const waByLast10 = new Map<string, typeof waContacts[number][]>()

    for (const wa of waContacts) {
      const normalized = normalizeForMatch(wa.phone)
      if (normalized) {
        waByNormalized.set(normalized, wa)
        const last10 = lastTenDigits(normalized)
        if (last10) {
          const bucket = waByLast10.get(last10) ?? []
          bucket.push(wa)
          waByLast10.set(last10, bucket)
        }
      }
    }

    const toCreate: { user_id: string; phone: string; name?: string | null; email?: string | null }[] = []
    const toUpdate: { id: string; data: { name?: string; email?: string } }[] = []

    function findMatch(phone: string) {
      const normalized = normalizeForMatch(phone)
      if (!normalized) return null
      const direct = waByNormalized.get(normalized)
      if (direct) return direct
      const last10 = lastTenDigits(normalized)
      if (!last10) return null
      const candidates = waByLast10.get(last10) ?? []
      if (candidates.length === 1) return candidates[0]
      return null
    }

    for (const crm of crmContacts) {
      const phone = String(crm.phone ?? '').trim()
      if (!phone) continue

      const match = findMatch(phone)
      if (!match) {
        toCreate.push({
          user_id: userId,
          phone,
          name: crm.name?.trim() || null,
          email: crm.email?.trim() || null,
        })
        continue
      }

      const update: { name?: string; email?: string } = {}
      if ((!match.name || !match.name.trim()) && crm.name?.trim()) {
        update.name = crm.name.trim()
      }
      if ((!match.email || !match.email.trim()) && crm.email?.trim()) {
        update.email = crm.email.trim()
      }

      if (Object.keys(update).length > 0) {
        toUpdate.push({ id: match.id, data: update })
      }
    }

    if (toCreate.length > 0) {
      await prisma.waContact.createMany({ data: toCreate })
    }

    if (toUpdate.length > 0) {
      await Promise.all(
        toUpdate.map((row) =>
          prisma.waContact.update({ where: { id: row.id }, data: row.data }),
        ),
      )
    }

    return NextResponse.json({
      success: true,
      created: toCreate.length,
      updated: toUpdate.length,
      total: crmContacts.length,
    })
  } catch (error) {
    console.error('Error syncing WA contacts:', error)
    return NextResponse.json({ error: 'Failed to sync contacts' }, { status: 500 })
  }
}

export async function DELETE() {
  try {
    const session = await getSession()
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const userId = String(session.user.id)

    const result = await prisma.waContact.deleteMany({
      where: {
        user_id: userId,
        name: { equals: 'WA Smoke Contact', mode: 'insensitive' },
      },
    })

    return NextResponse.json({ success: true, removed: result.count })
  } catch (error) {
    console.error('Error cleaning WA smoke contacts:', error)
    return NextResponse.json({ error: 'Failed to remove smoke contacts' }, { status: 500 })
  }
}
