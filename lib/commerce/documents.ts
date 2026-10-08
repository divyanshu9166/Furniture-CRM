import type { Prisma } from '@prisma/client'
import { normalizePhoneForMetaIndia } from '../whatsapp/phone-utils'

export function assertId(id: number) { if (!Number.isSafeInteger(id) || id <= 0) throw new Error('Invalid record ID') }

// An advisory lock serializes numbering without deleting or renumbering old
// documents. Scan numeric suffixes, rather than count() or newest row ID.
export async function nextDocumentId(tx: Prisma.TransactionClient, model: 'invoice' | 'creditNote' | 'purchaseOrder' | 'purchaseReturn' | 'customOrder' | 'fieldVisit', prefix: string, padding = 4) {
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`document:${model}`}))`
  const rows: { displayId: string }[] = await (tx[model] as any).findMany({ where: { displayId: { startsWith: prefix } }, select: { displayId: true } })
  const suffixes = rows.map(row => row.displayId.slice(prefix.length)).filter(value => /^\d+$/.test(value)).map(Number)
  const next = suffixes.reduce((maximum, suffix) => Math.max(maximum, suffix), 0) + 1
  if (!Number.isSafeInteger(next)) throw new Error('Document number limit reached')
  return `${prefix}${String(next).padStart(Math.min(12, Math.max(1, padding)), '0')}`
}

export async function billingContact(tx: Prisma.TransactionClient, data: { customer: string; phone: string; address?: string; gstNumber?: string }, updateExisting = true) {
  const canonical = normalizePhoneForMetaIndia(data.phone)
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`contact:${canonical}`}))`
  // Match established identities without rewriting historical phone numbers.
  const candidates = [...new Set([data.phone, canonical, `+${canonical}`, canonical.length === 12 && canonical.startsWith('91') ? canonical.slice(2) : canonical])]
  const contact = await tx.contact.findFirst({ where: { phone: { in: candidates } }, orderBy: { id: 'asc' } })
  const patch = { name: data.customer, ...(data.address ? { address: data.address } : {}), ...(data.gstNumber !== undefined ? { gstNumber: data.gstNumber.trim().toUpperCase() || null } : {}) }
  return contact ? updateExisting ? tx.contact.update({ where: { id: contact.id }, data: patch }) : contact : tx.contact.create({ data: { ...patch, phone: canonical } })
}

export async function activeStaff(tx: Prisma.TransactionClient, id?: number | null) {
  if (!id) return
  const staff = await tx.staff.findUnique({ where: { id }, select: { status: true } })
  if (staff?.status !== 'Active') throw new Error('Choose an active staff member')
}
