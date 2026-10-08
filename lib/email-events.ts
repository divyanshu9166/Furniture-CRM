import { prisma } from '@/lib/db'
import { z } from 'zod'

const eventSchema = z.enum(['open', 'click', 'bounce', 'unsubscribe'])

/** Internal service: public requests require signed URLs in the route.
 * Never expose this as an unauthenticated `use server` action. */
export async function recordEmailEvent(recipientId: number, type: 'open' | 'click' | 'bounce' | 'unsubscribe', metadata?: Record<string, unknown>) {
  if (!Number.isSafeInteger(recipientId) || recipientId <= 0 || !eventSchema.safeParse(type).success) return { success: false }
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "EmailRecipient" WHERE id = ${recipientId} FOR UPDATE`
    const recipient = await tx.emailRecipient.findUnique({ where: { id: recipientId } })
    if (!recipient) return { success: false }
    if ((type === 'unsubscribe' && recipient.status === 'unsubscribed') || (type === 'bounce' && recipient.bouncedAt)) return { success: true }
    const terminal = ['unsubscribed', 'bounced', 'failed'].includes(recipient.status)
    const recipientUpdate: Record<string, unknown> = {}
    const campaignUpdate: Record<string, unknown> = {}
    if (type === 'open') {
      recipientUpdate.opens = { increment: 1 }
      if (!recipient.openedAt) { recipientUpdate.openedAt = new Date(); campaignUpdate.opened = { increment: 1 } }
      if (!terminal && !recipient.clickedAt) recipientUpdate.status = 'opened'
    } else if (type === 'click') {
      recipientUpdate.clicks = { increment: 1 }
      if (!recipient.clickedAt) { recipientUpdate.clickedAt = new Date(); campaignUpdate.clicked = { increment: 1 } }
      if (!terminal) recipientUpdate.status = 'clicked'
    } else if (type === 'bounce') {
      recipientUpdate.bouncedAt = new Date()
      if (recipient.status !== 'unsubscribed') recipientUpdate.status = 'bounced'
      campaignUpdate.bounced = { increment: 1 }
    } else {
      recipientUpdate.status = 'unsubscribed'
      campaignUpdate.unsubscribed = { increment: 1 }
      await tx.contact.updateMany({ where: { email: { equals: recipient.email, mode: 'insensitive' } }, data: { emailSubscribed: false } })
    }
    await tx.emailEvent.create({ data: { recipientId, type, metadata: (metadata || {}) as any } })
    await tx.emailRecipient.update({ where: { id: recipientId }, data: recipientUpdate })
    await tx.emailCampaign.update({ where: { id: recipient.campaignId }, data: campaignUpdate })
    return { success: true }
  })
}
