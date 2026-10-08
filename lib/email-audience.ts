import { z } from 'zod'
import { senderEmailSchema } from './email-senders'

export const MAX_CAMPAIGN_RECIPIENTS = 2000
export const MAX_RECIPIENT_FILE_BYTES = 5 * 1024 * 1024
export const campaignAudienceSchema = z.enum(['all', 'leads', 'customers', 'selected'])
export type CampaignAudience = z.infer<typeof campaignAudienceSchema>
export const campaignEmailSchema = z.object({
  email: z.string().transform((value, context) => {
    const parsed = senderEmailSchema.safeParse(value)
    if (parsed.success) return parsed.data
    context.addIssue({ code: 'custom', message: 'Enter a valid recipient email address (one address only).' })
    return z.NEVER
  }),
  name: z.string().trim().max(150).refine(value => !/[\r\n\0]/.test(value), 'Name cannot contain control characters.').default(''),
}).strict()
export const recipientSelectionSchema = z.object({
  version: z.literal(1).default(1),
  contactIds: z.array(z.number().int().positive().max(2147483647)).max(MAX_CAMPAIGN_RECIPIENTS).default([]),
  emails: z.array(campaignEmailSchema).max(MAX_CAMPAIGN_RECIPIENTS).default([]),
  consentConfirmed: z.boolean().default(false),
}).strict().superRefine((selection, context) => {
  if (selection.contactIds.length + selection.emails.length > MAX_CAMPAIGN_RECIPIENTS) context.addIssue({ code: 'custom', message: `Select at most ${MAX_CAMPAIGN_RECIPIENTS} recipients per campaign.` })
  if (selection.emails.length && !selection.consentConfirmed) context.addIssue({ code: 'custom', message: 'Confirm permission to email the manually added or imported recipients.' })
})
export type RecipientSelection = z.infer<typeof recipientSelectionSchema>
export type CampaignRecipient = { contactId: number | null; name: string; email: string }
export const emptyRecipientSelection = (): RecipientSelection => ({ version: 1, contactIds: [], emails: [], consentConfirmed: false })

/** Stable address-level deduplication; suppression always wins over any source. */
export function normalizeCampaignRecipients(candidates: CampaignRecipient[], suppressed: Iterable<string>) {
  const blocked = new Set([...suppressed].map(email => email.trim().toLowerCase()))
  const seen = new Set<string>()
  const recipients: CampaignRecipient[] = []
  let invalid = 0, duplicates = 0, unsubscribed = 0
  for (const candidate of candidates) {
    const email = senderEmailSchema.safeParse(candidate.email)
    if (!email.success) { invalid++; continue }
    if (blocked.has(email.data)) { unsubscribed++; continue }
    if (seen.has(email.data)) { duplicates++; continue }
    seen.add(email.data)
    recipients.push({ ...candidate, email: email.data, name: candidate.name?.trim() || 'Customer' })
  }
  return { recipients, invalid, duplicates, unsubscribed }
}

/** Merge explicit recipients without overwriting names or silently exceeding caps. */
export function mergeCampaignEmails(current: z.infer<typeof campaignEmailSchema>[], incoming: z.infer<typeof campaignEmailSchema>[]) {
  const byEmail = new Map(current.map(row => [row.email.trim().toLowerCase(), row]))
  let duplicates = 0
  for (const row of incoming) {
    const parsed = campaignEmailSchema.parse(row)
    if (byEmail.has(parsed.email)) { duplicates++; continue }
    byEmail.set(parsed.email, parsed)
  }
  if (byEmail.size > MAX_CAMPAIGN_RECIPIENTS) throw new Error(`At most ${MAX_CAMPAIGN_RECIPIENTS} explicit emails are supported.`)
  return { emails: [...byEmail.values()], duplicates }
}
