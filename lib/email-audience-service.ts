import { prisma } from '@/lib/db'
import { campaignAudienceSchema, MAX_CAMPAIGN_RECIPIENTS, normalizeCampaignRecipients, recipientSelectionSchema } from './email-audience'
import type { CampaignRecipient } from './email-audience'

export async function getSuppressedCampaignEmails(addresses: string[]) {
  if (!addresses.length) return []
  const normalized = [...new Set(addresses.map(email => email.trim().toLowerCase()))]
  const [contacts, history] = await Promise.all([
    prisma.contact.findMany({ where: { emailSubscribed: false, email: { in: normalized, mode: 'insensitive' } }, select: { email: true } }),
    prisma.emailRecipient.findMany({ where: { status: 'unsubscribed', email: { in: normalized, mode: 'insensitive' } }, select: { email: true } }),
  ])
  return [...contacts, ...history].map(row => row.email!.trim().toLowerCase())
}

/** Re-resolve current contact addresses and all suppression sources every time.
 * Imports never create contacts, modify customer data or restore subscriptions. */
export async function resolveCampaignAudience(audience: unknown, filter?: unknown) {
  const segment = campaignAudienceSchema.parse(audience)
  const selection = segment === 'selected' ? recipientSelectionSchema.parse(filter) : null
  const contacts = await prisma.contact.findMany({
    where: {
      email: { not: null }, emailSubscribed: true,
      ...(segment === 'selected' ? { id: { in: selection!.contactIds } } : {}),
      ...(segment === 'leads' ? { leads: { some: {} } } : {}),
      ...(segment === 'customers' ? { orders: { some: {} } } : {}),
    },
    select: { id: true, name: true, email: true }, orderBy: { id: 'asc' }, take: MAX_CAMPAIGN_RECIPIENTS + 1,
  })
  if (contacts.length > MAX_CAMPAIGN_RECIPIENTS) throw new Error(`This audience exceeds ${MAX_CAMPAIGN_RECIPIENTS} contacts. Choose a smaller selected list; no recipients were silently truncated.`)
  const candidates: CampaignRecipient[] = [
    ...contacts.map(contact => ({ contactId: contact.id, email: contact.email!, name: contact.name })),
    ...(selection?.emails || []).map(row => ({ ...row, contactId: null })),
  ]
  const addresses = [...new Set(candidates.map(row => row.email.trim().toLowerCase()))]
  // Unsubscribed history also suppresses email-only imports that have no Contact.
  const result = normalizeCampaignRecipients(candidates, await getSuppressedCampaignEmails(addresses))
  const foundIds = new Set(contacts.map(row => row.id))
  return { ...result, unavailableContacts: selection ? [...new Set(selection.contactIds)].filter(id => !foundIds.has(id)).length : 0 }
}
