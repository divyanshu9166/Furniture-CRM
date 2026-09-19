'use server'

import { prisma } from '@/lib/db'
import { revalidatePath } from 'next/cache'
import { requireRole } from '@/lib/auth-helpers'

export interface BulkContactRow {
  name: string
  phone: string
  email?: string
  address?: string
  city?: string
  source?: string
  notes?: string
}

export async function bulkImportContacts(rows: BulkContactRow[]) {
  try {
    await requireRole('ADMIN', 'MANAGER')
  } catch {
    return { success: false, error: 'Manager access required' }
  }

  if (!Array.isArray(rows) || rows.length === 0) return { success: false, error: 'No contacts to import' }
  if (rows.length > 5_000) return { success: false, error: 'Import is limited to 5,000 contacts at a time' }

  const seenPhones = new Set<string>()
  const normalised: Array<Omit<BulkContactRow, 'city'> & { phone: string }> = []
  let skipped = 0

  for (const row of rows) {
    const name = typeof row?.name === 'string' ? row.name.trim() : ''
    const digits = typeof row?.phone === 'string' ? row.phone.replace(/\D/g, '').slice(-10) : ''
    if (!name || !/^[6-9]\d{9}$/.test(digits) || seenPhones.has(digits)) {
      skipped++
      continue
    }

    const email = typeof row.email === 'string' ? row.email.trim() : ''
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      skipped++
      continue
    }

    seenPhones.add(digits)
    const address = typeof row.address === 'string' ? row.address.trim() : ''
    const city = typeof row.city === 'string' ? row.city.trim() : ''
    normalised.push({
      name: name.slice(0, 200),
      phone: digits,
      email: email || undefined,
      address: city ? `${address ? `${address}, ` : ''}${city}`.slice(0, 500) : address.slice(0, 500) || undefined,
      source: (typeof row.source === 'string' ? row.source.trim() : '').slice(0, 100) || 'Import',
      notes: (typeof row.notes === 'string' ? row.notes.trim() : '').slice(0, 2_000) || undefined,
    })
  }

  if (normalised.length === 0) return { success: false, error: 'No valid rows. Each contact needs a name and a valid 10-digit Indian mobile number.' }

  try {
    const result = await prisma.contact.createMany({ data: normalised, skipDuplicates: true })
    skipped += normalised.length - result.count

    revalidatePath('/marketing')
    revalidatePath('/email-marketing')
    return { success: true, data: { total: rows.length, created: result.count, skipped } }
  } catch {
    return { success: false, error: 'Unable to import contacts. Please try again.' }
  }
}
