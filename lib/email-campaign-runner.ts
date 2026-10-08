import { prisma } from '@/lib/db'
import { getSmtpConfig, replaceVariables, sendBulkEmails } from '@/lib/email'
import { getPublicAppUrl, isEmailTrackingConfigured } from '@/lib/email-tracking'
import { resolveSender, smtpConfigSchema } from '@/lib/email-senders'
import { assertEmailContentReady } from '@/lib/email-content'

type DeliveryResult =
  | { success: true; data: { recipientCount: number; sent: number; failed: number; errors: string[] } }
  | { success: false; error: string }

function commonVariables(settings: { storeName: string; phone: string | null; email: string | null; address: string | null } | null) {
  return {
    storeName: settings?.storeName || 'Furniture Store',
    storePhone: settings?.phone || '',
    storeEmail: settings?.email || '',
    storeAddress: settings?.address || '',
    storeUrl: getPublicAppUrl() || '',
  }
}

async function eligibleContacts(audience: string) {
  const where: Record<string, unknown> = { email: { not: null }, emailSubscribed: true }
  if (audience === 'leads') where.leads = { some: {} }
  if (audience === 'customers') where.orders = { some: {} }
  return prisma.contact.findMany({ where, select: { id: true, name: true, email: true } })
}

/** Deliver one regular campaign. The status claim makes repeated button clicks and
 * overlapping scheduled runs safe: only the caller that changes the record to
 * SENDING is allowed to continue. */
export async function deliverEmailCampaign(campaignId: number): Promise<DeliveryResult> {
  const current = await prisma.emailCampaign.findUnique({ where: { id: campaignId }, select: { status: true, isAutomated: true } })
  if (!current) return { success: false, error: 'Campaign not found' }
  if (current.isAutomated) return { success: false, error: 'Automated campaigns are sent by their configured trigger.' }
  if (!['DRAFT', 'SCHEDULED', 'PAUSED'].includes(current.status)) return { success: false, error: 'Campaign is already sending or has been sent.' }

  const claimed = await prisma.emailCampaign.updateMany({
    where: { id: campaignId, status: current.status },
    data: { status: 'SENDING' },
  })
  if (claimed.count !== 1) return { success: false, error: 'Campaign is already being processed.' }

  const restore = async (error: string) => {
    await prisma.emailCampaign.update({ where: { id: campaignId }, data: { status: current.status } })
    return { success: false as const, error }
  }

  let deliveryStarted = false
  try {
    const smtpConfig = await getSmtpConfig()
    if (!smtpConfig) return restore('Email is not configured. Go to Settings → Email Setup to configure SMTP.')
    if (!isEmailTrackingConfigured()) return restore('Set NEXT_PUBLIC_SITE_URL and EMAIL_TRACKING_SECRET before sending campaigns so unsubscribe and tracking links work correctly.')

    const campaign = await prisma.emailCampaign.findUnique({ where: { id: campaignId } })
    if (!campaign) return restore('Campaign not found')
    assertEmailContentReady(campaign.subject, campaign.body, campaign.isABTest ? campaign.variantB as { subject?: string; body?: string } | null : null)
    // Legacy campaigns retain their original mailbox. Resolve BEFORE changing
    // recipient history; removed aliases must fail, never silently fall back.
    const sender = resolveSender(smtpConfig, campaign.fromEmail || smtpConfig.smtpUser, campaign.fromName)
    smtpConfigSchema.parse(smtpConfig)
    if (await prisma.emailRecipient.count({ where: { campaignId } })) {
      return restore('This campaign already has delivery history. Review its recipient statuses and duplicate it for a new send; history will not be erased or automatically replayed.')
    }
    const contacts = await eligibleContacts(campaign.audience)
    if (contacts.length === 0) return restore('No eligible subscribed recipients found.')

    const storeSettings = await prisma.storeSettings.findFirst({ where: { id: 1 }, select: { storeName: true, phone: true, email: true, address: true } })
    const cutoff = Math.floor(contacts.length * (campaign.abSplitPercent / 100))
    const recipientsToCreate = contacts.map((contact, index) => ({
      campaignId,
      contactId: contact.id,
      email: contact.email!,
      name: contact.name,
      variant: campaign.isABTest && index >= cutoff ? 'B' : 'A',
      status: 'queued',
    }))

    await prisma.emailRecipient.createMany({ data: recipientsToCreate })
    deliveryStarted = true // From here, preserve history even if SMTP/DB outcome is uncertain.
    const recipients = await prisma.emailRecipient.findMany({ where: { campaignId }, select: { id: true, email: true, name: true, variant: true } })
    const variantB = campaign.variantB as Record<string, string> | null
    const variables = commonVariables(storeSettings)
    const deliveries = recipients.map(recipient => {
      const useVariantB = recipient.variant === 'B' && variantB
      const subject = useVariantB ? variantB.subject || campaign.subject : campaign.subject
      const body = useVariantB ? variantB.body || campaign.body : campaign.body
      return {
        recipientId: recipient.id,
        to: recipient.email,
        subject: replaceVariables(subject, { ...variables, customerName: recipient.name }, 'text'),
        html: replaceVariables(body, { ...variables, customerName: recipient.name }),
      }
    })

    const delivery = await sendBulkEmails(deliveries, { config: smtpConfig, fromEmail: sender.email, fromName: sender.name })
    const sentIds = delivery.results.filter(result => result.success).map(result => result.recipientId)
    const failedIds = delivery.results.filter(result => !result.success).map(result => result.recipientId)
    const now = new Date()
    if (sentIds.length) {
      await prisma.emailRecipient.updateMany({ where: { id: { in: sentIds } }, data: { sentAt: now } })
      await prisma.emailRecipient.updateMany({ where: { id: { in: sentIds }, status: 'queued' }, data: { status: 'sent' } })
    }
    if (failedIds.length) await prisma.emailRecipient.updateMany({ where: { id: { in: failedIds }, status: 'queued' }, data: { status: 'failed' } })

    await prisma.emailCampaign.update({
      where: { id: campaignId },
      data: {
        status: delivery.sent > 0 ? 'SENT' : 'PAUSED',
        fromEmail: sender.email,
        fromName: sender.name,
        sentAt: delivery.sent > 0 ? now : null,
        totalRecipients: recipients.length,
        sent: delivery.sent,
      },
    })
    if (!delivery.sent) return { success: false, error: `No emails were accepted by SMTP. ${delivery.errors[0] || 'Review SMTP settings and recipient statuses.'} Duplicate the campaign after resolving the error to retry without erasing history.` }
    return { success: true, data: { recipientCount: recipients.length, sent: delivery.sent, failed: delivery.failed, errors: delivery.errors } }
  } catch (error) {
    await prisma.emailCampaign.update({ where: { id: campaignId }, data: { status: deliveryStarted ? 'PAUSED' : current.status } }).catch(() => {})
    return { success: false, error: error instanceof Error ? error.message : 'Unable to send campaign.' }
  }
}

async function deliverAutomationToContact(campaignId: number, contactId: number) {
  const smtpConfig = await getSmtpConfig()
  if (!smtpConfig || !isEmailTrackingConfigured()) return null
  smtpConfigSchema.parse(smtpConfig)
  // Short database claim, never hold a transaction open during network SMTP.
  // Lock the campaign so scheduler/cron workers cannot queue the same contact
  // twice, and pause/edit/delete can use the same serialization boundary.
  const claimed = await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "EmailCampaign" WHERE id = ${campaignId} FOR UPDATE`
    const campaign = await tx.emailCampaign.findUnique({ where: { id: campaignId } })
    if (!campaign?.isAutomated || campaign.status !== 'SCHEDULED') return null
    assertEmailContentReady(campaign.subject, campaign.body, campaign.isABTest ? campaign.variantB as { subject?: string; body?: string } | null : null)
    const contact = await tx.contact.findUnique({ where: {
      id: contactId, emailSubscribed: true,
      ...(campaign.audience === 'leads' ? { leads: { some: {} } } : {}),
      ...(campaign.audience === 'customers' ? { orders: { some: {} } } : {}),
    }, select: { id: true, name: true, email: true, emailSubscribed: true } })
    if (!contact?.email || !contact.emailSubscribed) return null
    if (await tx.emailRecipient.findFirst({ where: { campaignId, contactId }, select: { id: true } })) return null
    const sender = resolveSender(smtpConfig, campaign.fromEmail || smtpConfig.smtpUser, campaign.fromName)
    const variant = campaign.isABTest && contact.id % 100 >= campaign.abSplitPercent ? 'B' : 'A'
    const recipient = await tx.emailRecipient.create({ data: { campaignId, contactId, email: contact.email, name: contact.name, variant, status: 'queued' } })
    // Pin before delivery: later edits cannot change this in-flight identity.
    await tx.emailCampaign.update({ where: { id: campaignId }, data: { fromEmail: sender.email, fromName: sender.name, totalRecipients: { increment: 1 } } })
    return { campaign, contact, sender, variant, recipient }
  })
  if (!claimed) return null
  const { campaign, contact, sender, variant, recipient } = claimed
  const variantB = campaign.variantB as Record<string, string> | null

  const settings = await prisma.storeSettings.findFirst({ where: { id: 1 }, select: { storeName: true, phone: true, email: true, address: true } })
  const useVariantB = variant === 'B' && variantB
  const result = await sendBulkEmails([{
    recipientId: recipient.id,
    to: contact.email!,
    subject: replaceVariables(useVariantB ? variantB.subject || campaign.subject : campaign.subject, { ...commonVariables(settings), customerName: contact.name }, 'text'),
    html: replaceVariables(useVariantB ? variantB.body || campaign.body : campaign.body, { ...commonVariables(settings), customerName: contact.name }),
  }], { config: smtpConfig, fromEmail: sender.email, fromName: sender.name })
  const now = new Date()
  const delivered = result.sent === 1
  await prisma.$transaction([
    prisma.emailRecipient.updateMany({ where: { id: recipient.id, status: 'queued' }, data: delivered ? { status: 'sent' } : { status: 'failed' } }),
    prisma.emailRecipient.update({ where: { id: recipient.id }, data: { sentAt: delivered ? now : null } }),
    prisma.emailCampaign.update({ where: { id: campaignId }, data: delivered ? { sent: { increment: 1 } } : {} }),
  ])
  return delivered
}

async function automationContacts(campaign: { id: number; createdAt: Date; audience: string; triggerType: string | null; triggerDelay: number | null }, existing: Set<number>) {
  const cutoff = new Date(Date.now() - (campaign.triggerDelay || 0) * 60 * 60 * 1000)
  // Filter processed contacts before the bounded query to avoid backlog starvation.
  const pending = { contactId: { notIn: [...existing] }, contact: {
    emailSubscribed: true, email: { not: null },
    ...(campaign.audience === 'leads' ? { leads: { some: {} } } : {}),
    ...(campaign.audience === 'customers' ? { orders: { some: {} } } : {}),
  } }
  if (campaign.triggerType === 'new_lead') {
    return (await prisma.lead.findMany({ where: { ...pending, date: { gte: campaign.createdAt, lte: cutoff } }, select: { contactId: true }, orderBy: { date: 'desc' }, take: 5000 })).map(row => row.contactId)
  }
  if (campaign.triggerType === 'post_visit') {
    const [walkins, appointments] = await Promise.all([
      prisma.walkin.findMany({ where: { ...pending, date: { gte: campaign.createdAt, lte: cutoff } }, select: { contactId: true }, orderBy: { date: 'desc' }, take: 5000 }),
      prisma.appointment.findMany({ where: { ...pending, status: 'Completed', date: { gte: campaign.createdAt, lte: cutoff } }, select: { contactId: true }, orderBy: { date: 'desc' }, take: 5000 }),
    ])
    return [...new Set([...walkins, ...appointments].map(row => row.contactId))]
  }
  if (campaign.triggerType === 'post_purchase') {
    return (await prisma.order.findMany({ where: { ...pending, status: 'DELIVERED', deliveryDate: { gte: campaign.createdAt, lte: cutoff } }, select: { contactId: true }, orderBy: { deliveryDate: 'desc' }, take: 5000 })).map(row => row.contactId)
  }
  return []
}

export async function processDueEmailCampaigns() {
  const now = new Date()
  const [scheduled, automated] = await Promise.all([
    prisma.emailCampaign.findMany({ where: { status: 'SCHEDULED', isAutomated: false, scheduledAt: { lte: now } }, select: { id: true }, orderBy: { scheduledAt: 'asc' }, take: 10 }),
    prisma.emailCampaign.findMany({ where: { status: 'SCHEDULED', isAutomated: true }, select: { id: true, createdAt: true, audience: true, triggerType: true, triggerDelay: true }, take: 20 }),
  ])

  const scheduledResults = await Promise.all(scheduled.map(campaign => deliverEmailCampaign(campaign.id)))
  let automationDeliveries = 0
  let automationFailures = 0
  for (const campaign of automated) {
    const existing = new Set((await prisma.emailRecipient.findMany({ where: { campaignId: campaign.id, contactId: { not: null } }, select: { contactId: true } })).map(row => row.contactId!))
    const contactIds = await automationContacts(campaign, existing)
    for (const contactId of contactIds) {
      if (existing.has(contactId)) continue
      try {
        const delivered = await deliverAutomationToContact(campaign.id, contactId)
        if (delivered === true) automationDeliveries++
        if (delivered === false) automationFailures++
      } catch (error) {
        automationFailures++
        console.error('[email-campaign-scheduler] automation delivery failed', { campaignId: campaign.id, error: error instanceof Error ? error.message : 'Delivery failed' })
      }
      existing.add(contactId)
    }
  }

  return {
    scheduledChecked: scheduled.length,
    scheduledSent: scheduledResults.filter(result => result.success).length,
    automationDeliveries,
    automationFailures,
  }
}

declare global { var __emailCampaignSchedulerStarted: boolean | undefined }

export function startEmailCampaignScheduler() {
  if (globalThis.__emailCampaignSchedulerStarted) return
  globalThis.__emailCampaignSchedulerStarted = true
  const run = () => processDueEmailCampaigns().catch(error => console.error('[email-campaign-scheduler]', error))
  run()
  const timer = setInterval(run, 60_000)
  timer.unref?.()
}
