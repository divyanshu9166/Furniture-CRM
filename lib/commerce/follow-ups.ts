import type { Prisma } from '@prisma/client'
import { assertId } from './documents'

export const OPEN_FOLLOW_UPS = ['PENDING', 'REMINDED', 'CONTACTED'] as const
export const REMINDER_LEASE_MS = 15 * 60 * 1000

export async function lockFollowUpContact(tx: Prisma.TransactionClient, contactId: number | null, socialContactId?: string | null) {
  if (!contactId && !socialContactId) throw new Error('Follow-up has no contact identity')
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`follow-up:${contactId ? `crm:${contactId}` : `social:${socialContactId}`}`}))`
}

export async function assertNoOpenFollowUp(tx: Prisma.TransactionClient, contactId: number | null, socialContactId?: string | null, excludeId?: number) {
  await lockFollowUpContact(tx, contactId, socialContactId)
  if (await tx.followUpEntry.findFirst({ where: { ...(contactId ? { contactId } : { socialContactId }), status: { in: [...OPEN_FOLLOW_UPS] }, ...(excludeId ? { id: { not: excludeId } } : {}) } })) throw new Error('An open follow-up already exists for this contact')
}

export async function lockedFollowUp(tx: Prisma.TransactionClient, id: number, now = new Date()) {
  assertId(id)
  await tx.$queryRaw`SELECT id FROM "FollowUpEntry" WHERE id = ${id} FOR UPDATE`
  const entry = await tx.followUpEntry.findUnique({ where: { id } })
  if (!entry) throw new Error('Follow-up not found')
  if (entry.status === 'PENDING' && entry.lastContactedAt && entry.lastContactedAt.getTime() > now.getTime() - REMINDER_LEASE_MS) throw new Error('A reminder is currently sending; retry after it finishes')
  return entry
}
