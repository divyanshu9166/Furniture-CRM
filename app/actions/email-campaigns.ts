'use server'

import { prisma } from '@/lib/db'
import { revalidatePath } from 'next/cache'
import { requireRole } from '@/lib/auth-helpers'
import { z } from 'zod'
import { testSmtpConnection, sendTestEmail, getSmtpConfig } from '@/lib/email'
import { deliverEmailCampaign } from '@/lib/email-campaign-runner'
import { getPublicAppUrl, isEmailTrackingConfigured } from '@/lib/email-tracking'
import { getSenderIdentities, prepareSmtpConfig, resolveSender, senderEmailSchema } from '@/lib/email-senders'
import { recordEmailEvent as recordEvent } from '@/lib/email-events'
import type { Prisma } from '@prisma/client'
import { assertEmailContentReady } from '@/lib/email-content'

// ─── VALIDATION SCHEMAS ─────────────────────────────

const templateSchema = z.object({
  name: z.string().trim().min(1, 'Template name is required').max(150),
  subject: z.string().trim().min(1, 'Subject is required').max(250),
  body: z.string().trim().min(1, 'Body is required').max(200_000),
  category: z.string().trim().min(1).max(100).default('Promotional'),
  variables: z.array(z.string().trim().regex(/^[a-zA-Z0-9_]+$/, 'Use letters, numbers and underscores for variable names.').max(80)).max(50).default([]),
})

const campaignSchema = z.object({
  name: z.string().trim().min(1, 'Campaign name is required').max(150),
  subject: z.string().trim().min(1, 'Subject is required').max(250),
  body: z.string().trim().min(1, 'Email body is required').max(200_000),
  fromEmail: z.union([senderEmailSchema, z.literal('')]).optional(),
  templateId: z.number().int().positive().optional(),
  audience: z.enum(['all', 'leads', 'customers']).default('all'),
  audienceFilter: z.any().optional(),
  scheduledAt: z.string().datetime().optional(),
  isABTest: z.boolean().default(false),
  variantBSubject: z.string().trim().max(250).optional(),
  variantBBody: z.string().max(200_000).optional(),
  abSplitPercent: z.number().int().min(10).max(90).default(50),
  isAutomated: z.boolean().default(false),
  activate: z.boolean().default(true),
  triggerType: z.enum(['new_lead', 'post_visit', 'post_purchase']).optional(),
  triggerDelay: z.number().int().min(0).max(720).optional(),
}).superRefine((data, context) => {
  if (data.isABTest && (!data.variantBSubject || !data.variantBBody)) {
    context.addIssue({ code: 'custom', message: 'Variant B subject and body are required for an A/B test.' })
  }
  if (data.isAutomated && !data.triggerType) {
    context.addIssue({ code: 'custom', message: 'Select an automation trigger.' })
  }
  if (data.isAutomated && data.scheduledAt) {
    context.addIssue({ code: 'custom', message: 'Automated campaigns cannot also have a scheduled send time.' })
  }
  if (data.scheduledAt || (data.isAutomated && data.activate)) {
    try { assertEmailContentReady(data.subject, data.body, data.isABTest ? { subject: data.variantBSubject, body: data.variantBBody } : null) }
    catch (error) { context.addIssue({ code: 'custom', message: error instanceof Error ? error.message : 'Resolve template placeholders before activation.' }) }
  }
})

async function hasMarketingAccess() {
  try {
    await requireRole('ADMIN', 'MANAGER')
    return true
  } catch {
    return false
  }
}

async function campaignSender(selected?: string) {
  const config = await getSmtpConfig()
  if (!config) {
    if (selected) throw new Error('Configure SMTP before selecting a campaign sender.')
    return { fromEmail: null, fromName: null }
  }
  const identity = resolveSender(config, selected)
  return { fromEmail: identity.email, fromName: identity.name }
}

async function triggerAvailable(tx: Prisma.TransactionClient, triggerType: string, excludeId?: number) {
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`email-trigger:${triggerType}`}))`
  return !await tx.emailCampaign.findFirst({ where: {
    isAutomated: true, triggerType, status: 'SCHEDULED', ...(excludeId ? { id: { not: excludeId } } : {}),
  }, select: { id: true } })
}

const validId = (id: number) => Number.isSafeInteger(id) && id > 0 && id <= 2147483647

function campaignData(data: z.infer<typeof campaignSchema>, sender: { fromEmail: string | null; fromName: string | null }, scheduledAt: Date | null) {
  return {
    name: data.name, ...sender, subject: data.subject, body: data.body,
    templateId: data.templateId || null, audience: data.audience,
    audienceFilter: data.audienceFilter || undefined, scheduledAt,
    status: (data.isAutomated ? (data.activate ? 'SCHEDULED' : 'DRAFT') : scheduledAt ? 'SCHEDULED' : 'DRAFT') as 'SCHEDULED' | 'DRAFT',
    isABTest: data.isABTest, variantB: data.isABTest ? { subject: data.variantBSubject, body: data.variantBBody } : undefined,
    abSplitPercent: data.abSplitPercent, isAutomated: data.isAutomated,
    triggerType: data.isAutomated ? data.triggerType : null,
    triggerDelay: data.isAutomated ? data.triggerDelay || 0 : null,
  }
}

// ─── EMAIL TEMPLATES ────────────────────────────────

export async function getEmailTemplates() {
  if (!await hasMarketingAccess()) return { success: false, error: 'Manager access required', data: [] }

  const templates = await prisma.emailTemplate.findMany({
    orderBy: { updatedAt: 'desc' },
    include: { _count: { select: { campaigns: true } } },
  })

  return {
    success: true,
    data: templates.map(t => ({
      id: t.id,
      name: t.name,
      subject: t.subject,
      body: t.body,
      category: t.category,
      variables: t.variables,
      campaignCount: t._count.campaigns,
      createdAt: t.createdAt.toISOString(),
      updatedAt: t.updatedAt.toISOString(),
    })),
  }
}

export async function createEmailTemplate(data: unknown) {
  try { await requireRole('ADMIN', 'MANAGER') } catch { return { success: false, error: 'Manager access required' } }
  const parsed = templateSchema.safeParse(data)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }

  const template = await prisma.emailTemplate.create({ data: parsed.data })
  revalidatePath('/email-marketing')
  return { success: true, data: { id: template.id } }
}

export async function updateEmailTemplate(id: number, data: unknown) {
  try { await requireRole('ADMIN', 'MANAGER') } catch { return { success: false, error: 'Manager access required' } }
  if (!validId(id)) return { success: false, error: 'Invalid template' }
  const parsed = templateSchema.safeParse(data)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }

  if (!await prisma.emailTemplate.count({ where: { id } })) return { success: false, error: 'Template not found' }
  await prisma.emailTemplate.update({ where: { id }, data: parsed.data })
  revalidatePath('/email-marketing')
  return { success: true }
}

export async function deleteEmailTemplate(id: number) {
  try { await requireRole('ADMIN', 'MANAGER') } catch { return { success: false, error: 'Manager access required' } }
  if (!validId(id)) return { success: false, error: 'Invalid template' }
  const usedCount = await prisma.emailCampaign.count({ where: { templateId: id } })
  if (usedCount > 0) return { success: false, error: `Template is used by ${usedCount} campaign(s). Remove them first.` }

  if (!await prisma.emailTemplate.count({ where: { id } })) return { success: false, error: 'Template not found' }
  await prisma.emailTemplate.delete({ where: { id } })
  revalidatePath('/email-marketing')
  return { success: true }
}

// ─── EMAIL CAMPAIGNS ────────────────────────────────

export async function getEmailCampaigns() {
  if (!await hasMarketingAccess()) return { success: false, error: 'Manager access required', data: [] }

  const campaigns = await prisma.emailCampaign.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      template: { select: { name: true } },
      _count: { select: { recipients: true } },
    },
  })

  return {
    success: true,
    data: campaigns.map(c => ({
      id: c.id,
      name: c.name,
      subject: c.subject,
      fromEmail: c.fromEmail,
      fromName: c.fromName,
      body: c.body,
      templateName: c.template?.name || null,
      templateId: c.templateId,
      status: c.status,
      scheduledAt: c.scheduledAt?.toISOString() || null,
      sentAt: c.sentAt?.toISOString() || null,
      audience: c.audience,
      totalRecipients: c.totalRecipients,
      sent: c.sent,
      opened: c.opened,
      clicked: c.clicked,
      bounced: c.bounced,
      unsubscribed: c.unsubscribed,
      isABTest: c.isABTest,
      variantB: c.variantB as Record<string, string> | null,
      abSplitPercent: c.abSplitPercent,
      abWinner: c.abWinner,
      isAutomated: c.isAutomated,
      triggerType: c.triggerType,
      triggerDelay: c.triggerDelay,
      recipientCount: c._count.recipients,
      createdAt: c.createdAt.toISOString(),
    })),
  }
}

export async function createEmailCampaign(data: unknown) {
  try { await requireRole('ADMIN', 'MANAGER') } catch { return { success: false, error: 'Manager access required' } }
  const parsed = campaignSchema.safeParse(data)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }
  try {
    const sender = await campaignSender(parsed.data.fromEmail)
    const scheduledAt = parsed.data.scheduledAt ? new Date(parsed.data.scheduledAt) : null
    if (scheduledAt && scheduledAt <= new Date()) return { success: false, error: 'Scheduled time must be in the future.' }
    const active = !!scheduledAt || (parsed.data.isAutomated && parsed.data.activate)
    if (active && (!sender.fromEmail || !isEmailTrackingConfigured())) return { success: false, error: 'Configure SMTP and signed tracking/unsubscribe links before scheduling or activating emails.' }
    const result = await prisma.$transaction(async tx => {
      if (parsed.data.templateId && !await tx.emailTemplate.count({ where: { id: parsed.data.templateId } })) return { success: false, error: 'Selected template no longer exists.' }
      if (parsed.data.isAutomated && parsed.data.activate && !await triggerAvailable(tx, parsed.data.triggerType!)) return { success: false, error: 'An active automation already exists for this trigger. Pause it first.' }
      const campaign = await tx.emailCampaign.create({ data: campaignData(parsed.data, sender, scheduledAt) })
      return { success: true, data: { id: campaign.id } }
    })
    if (result.success) revalidatePath('/email-marketing')
    return result
  } catch (error) { return { success: false, error: error instanceof Error ? error.message : 'Unable to save campaign.' } }
}

export async function updateEmailCampaign(id: number, data: unknown) {
  try { await requireRole('ADMIN', 'MANAGER') } catch { return { success: false, error: 'Manager access required' } }
  if (!validId(id)) return { success: false, error: 'Invalid campaign' }
  const parsed = campaignSchema.safeParse(data)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }
  try {
    const result = await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM "EmailCampaign" WHERE id = ${id} FOR UPDATE`
      const existing = await tx.emailCampaign.findUnique({ where: { id } })
      if (!existing) return { success: false, error: 'Campaign not found' }
      if (existing.status === 'SENT' || existing.status === 'SENDING') return { success: false, error: 'Sent or in-progress campaigns cannot be edited.' }
      const hasHistory = !!await tx.emailRecipient.count({ where: { campaignId: id } }) || existing.totalRecipients > 0
      if (hasHistory && !existing.isAutomated) return { success: false, error: 'Delivery history exists. Duplicate this campaign to make changes without replaying or erasing history.' }
      const previousEmail = existing.fromEmail || (await getSmtpConfig())?.smtpUser || null
      const sender = parsed.data.fromEmail === undefined && previousEmail
        ? { fromEmail: previousEmail, fromName: existing.fromName }
        : await campaignSender(parsed.data.fromEmail || (hasHistory ? previousEmail || undefined : undefined))
      if (hasHistory && (sender.fromEmail !== previousEmail || !parsed.data.isAutomated || parsed.data.triggerType !== existing.triggerType || parsed.data.audience !== existing.audience)) return { success: false, error: 'This automation has delivery history. Create a new automation to change its sender, audience or trigger.' }
      const scheduledAt = parsed.data.scheduledAt ? new Date(parsed.data.scheduledAt) : null
      if (scheduledAt && scheduledAt <= new Date()) return { success: false, error: 'Scheduled time must be in the future.' }
      const active = !!scheduledAt || (parsed.data.isAutomated && parsed.data.activate)
      if (active) {
        const config = await getSmtpConfig()
        if (!config || !isEmailTrackingConfigured()) return { success: false, error: 'Configure SMTP and signed tracking/unsubscribe links before activating emails.' }
        resolveSender(config, sender.fromEmail || config.smtpUser, sender.fromName)
      }
      if (parsed.data.templateId && !await tx.emailTemplate.count({ where: { id: parsed.data.templateId } })) return { success: false, error: 'Selected template no longer exists.' }
      if (parsed.data.isAutomated && parsed.data.activate && !await triggerAvailable(tx, parsed.data.triggerType!, id)) return { success: false, error: 'An active automation already exists for this trigger.' }
      await tx.emailCampaign.update({ where: { id }, data: campaignData(parsed.data, sender, scheduledAt) })
      return { success: true }
    })
    if (result.success) revalidatePath('/email-marketing')
    return result
  } catch (error) { return { success: false, error: error instanceof Error ? error.message : 'Unable to update campaign.' } }
}

export async function deleteEmailCampaign(id: number) {
  try { await requireRole('ADMIN', 'MANAGER') } catch { return { success: false, error: 'Manager access required' } }
  if (!validId(id)) return { success: false, error: 'Invalid campaign' }
  const result = await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "EmailCampaign" WHERE id = ${id} FOR UPDATE`
    const campaign = await tx.emailCampaign.findUnique({ where: { id } })
    if (!campaign) return { success: false, error: 'Campaign not found' }
    if (campaign.status === 'SENDING') return { success: false, error: 'Campaign is currently sending and cannot be deleted.' }
    if (campaign.sent > 0 || await tx.emailRecipient.count({ where: { campaignId: id } })) return { success: false, error: 'Campaign has delivery history. Pause automated delivery instead; recipient activity and unsubscribe links must be preserved.' }
    await tx.emailCampaign.delete({ where: { id } })
    return { success: true }
  })
  if (result.success) revalidatePath('/email-marketing')
  return result
}

// ─── AUDIENCE / RECIPIENTS ──────────────────────────

export async function getAudienceStats() {
  if (!await hasMarketingAccess()) return { success: false, error: 'Manager access required', data: null }

  const [total, withEmail, subscribed, leads, customers] = await Promise.all([
    prisma.contact.count(),
    prisma.contact.count({ where: { email: { not: null } } }),
    prisma.contact.count({ where: { email: { not: null }, emailSubscribed: true } }),
    prisma.contact.count({ where: { email: { not: null }, emailSubscribed: true, leads: { some: {} } } }),
    prisma.contact.count({ where: { email: { not: null }, emailSubscribed: true, orders: { some: {} } } }),
  ])

  return {
    success: true,
    data: { total, withEmail, subscribed, leads, customers },
  }
}

export async function getAudiencePreview(audience: string) {
  if (!await hasMarketingAccess()) return { success: false, error: 'Manager access required', data: null }
  if (!['all', 'leads', 'customers'].includes(audience)) return { success: false, error: 'Invalid audience', data: null }

  const where: Record<string, unknown> = { email: { not: null }, emailSubscribed: true }

  if (audience === 'leads') {
    where.leads = { some: {} }
  } else if (audience === 'customers') {
    where.orders = { some: {} }
  }

  const contacts = await prisma.contact.findMany({
    where,
    select: { id: true, name: true, email: true, source: true },
    orderBy: { name: 'asc' },
    take: 100,
  })

  const totalCount = await prisma.contact.count({ where })

  return {
    success: true,
    data: {
      contacts: contacts.map(c => ({ id: c.id, name: c.name, email: c.email!, source: c.source })),
      totalCount,
    },
  }
}

// ─── SEND CAMPAIGN (populate recipients + send emails) ────────────

export async function sendEmailCampaign(campaignId: number) {
  try { await requireRole('ADMIN', 'MANAGER') } catch { return { success: false, error: 'Manager access required' } }
  if (!Number.isInteger(campaignId) || campaignId <= 0) return { success: false, error: 'Invalid campaign' }
  const result = await deliverEmailCampaign(campaignId)
  revalidatePath('/email-marketing')
  return result
}

// ─── SMTP TEST & CONFIG ACTIONS ─────────────────────

export async function testSmtp(config: Record<string, unknown>) {
  try { await requireRole('ADMIN') } catch { return { success: false, error: 'Admin access required' } }
  try {
    const saved = await prisma.storeSettings.findUnique({ where: { id: 1 } })
    return await testSmtpConnection(prepareSmtpConfig(config, saved ? { ...saved } : null))
  } catch (error) { return { success: false, error: error instanceof Error ? error.message : 'Invalid SMTP settings.' } }
}

export async function sendSmtpTestEmail(config: Record<string, unknown>, toEmail: string, fromEmail?: string) {
  try { await requireRole('ADMIN') } catch { return { success: false, error: 'Admin access required' } }
  try {
    const saved = await prisma.storeSettings.findUnique({ where: { id: 1 } })
    const parsed = prepareSmtpConfig(config, saved ? { ...saved } : null)
    const sender = resolveSender(parsed, fromEmail)
    const result = await sendTestEmail(parsed, senderEmailSchema.parse(toEmail), sender.email)
    return { ...result, fromEmail: sender.email }
  } catch (error) { return { success: false, error: error instanceof Error ? error.message : 'Unable to send the test email.' } }
}

export async function getEmailConfigStatus() {
  if (!await hasMarketingAccess()) return { success: false, error: 'Manager access required' }

  try {
    const config = await getSmtpConfig()
    const sender = config ? resolveSender(config) : null
    return {
      success: true,
      configured: !!config,
      smtpHost: config?.smtpHost || null,
      smtpUser: config?.smtpUser || null,
      fromName: sender?.name || null,
      fromEmail: sender?.email || null,
      senders: config ? getSenderIdentities(config) : [],
      trackingConfigured: isEmailTrackingConfigured(),
    }
  } catch {
    return { success: false, configured: false, error: 'Email sender settings are invalid or unavailable. Review Email Setup before sending.', senders: [], trackingConfigured: isEmailTrackingConfigured() }
  }
}

// ─── CAMPAIGN ANALYTICS ─────────────────────────────

export async function getCampaignAnalytics(campaignId: number) {
  if (!await hasMarketingAccess()) return { success: false, error: 'Manager access required' }
  if (!validId(campaignId)) return { success: false, error: 'Invalid campaign' }

  const campaign = await prisma.emailCampaign.findUnique({
    where: { id: campaignId },
    include: {
      recipients: {
        orderBy: { sentAt: 'desc' },
        take: 200,
        select: {
          id: true,
          email: true,
          name: true,
          variant: true,
          status: true,
          sentAt: true,
          openedAt: true,
          clickedAt: true,
          opens: true,
          clicks: true,
        },
      },
    },
  })

  if (!campaign) return { success: false, error: 'Campaign not found' }

  // Query the full campaign, not the 200-row UI preview or a 500-event sample.
  const start = new Date()
  start.setUTCHours(0, 0, 0, 0)
  start.setUTCDate(start.getUTCDate() - 6)
  const events = await prisma.$queryRaw<Array<{ day: Date; type: string; total: number }>>`
    SELECT date_trunc('day', e."createdAt") AS day, e.type, COUNT(*)::int AS total
    FROM "EmailEvent" e JOIN "EmailRecipient" r ON r.id = e."recipientId"
    WHERE r."campaignId" = ${campaignId} AND e."createdAt" >= ${start}
    AND e.type IN ('open', 'click')
    GROUP BY day, e.type ORDER BY day
  `
  let abStats: Record<'A' | 'B', { sent: number; opened: number; clicked: number; openRate: number; clickRate: number }> | null = null
  if (campaign.isABTest) {
    const variantStats = async (variant: 'A' | 'B') => {
      const where = { campaignId, variant, sentAt: { not: null } }
      const [sent, opened, clicked] = await Promise.all([
        prisma.emailRecipient.count({ where }),
        prisma.emailRecipient.count({ where: { ...where, openedAt: { not: null } } }),
        prisma.emailRecipient.count({ where: { ...where, clickedAt: { not: null } } }),
      ])
      return { sent, opened, clicked, openRate: sent ? Math.round(opened / sent * 100) : 0, clickRate: sent ? Math.round(clicked / sent * 100) : 0 }
    }
    const [A, B] = await Promise.all([variantStats('A'), variantStats('B')])
    abStats = { A, B }
  }

  // Build daily timeline
  const timeline: Record<string, { opens: number; clicks: number }> = {}
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000)
    const key = d.toISOString().split('T')[0]
    timeline[key] = { opens: 0, clicks: 0 }
  }
  events.forEach(e => {
    const key = e.day.toISOString().split('T')[0]
    if (timeline[key]) {
      if (e.type === 'open') timeline[key].opens += e.total
      if (e.type === 'click') timeline[key].clicks += e.total
    }
  })

  return {
    success: true,
    data: {
      campaign: {
        id: campaign.id,
        name: campaign.name,
        subject: campaign.subject,
        status: campaign.status,
        totalRecipients: campaign.totalRecipients,
        sent: campaign.sent,
        opened: campaign.opened,
        clicked: campaign.clicked,
        bounced: campaign.bounced,
        unsubscribed: campaign.unsubscribed,
        openRate: campaign.sent > 0 ? Math.round((campaign.opened / campaign.sent) * 100) : 0,
        clickRate: campaign.sent > 0 ? Math.round((campaign.clicked / campaign.sent) * 100) : 0,
        abWinner: campaign.abWinner,
        bounceRate: campaign.sent > 0 ? Math.round((campaign.bounced / campaign.sent) * 100) : 0,
      },
      recipients: campaign.recipients.map(r => ({
        ...r,
        sentAt: r.sentAt?.toISOString() || null,
        openedAt: r.openedAt?.toISOString() || null,
        clickedAt: r.clickedAt?.toISOString() || null,
      })),
      abStats,
      timeline: Object.entries(timeline).map(([date, v]) => ({ date, ...v })),
    },
  }
}

// ─── RECORD TRACKING EVENT ──────────────────────────

export async function recordEmailEvent(recipientId: number, type: 'open' | 'click' | 'bounce' | 'unsubscribe', metadata?: Record<string, unknown>) {
  try { await requireRole('ADMIN', 'MANAGER') } catch { return { success: false, error: 'Manager access required' } }
  return recordEvent(recipientId, type, metadata)
}

// ─── AUTOMATED CAMPAIGN HELPERS ─────────────────────

export async function getAutomatedCampaigns() {
  if (!await hasMarketingAccess()) return { success: false, error: 'Manager access required', data: [] }

  const campaigns = await prisma.emailCampaign.findMany({
    where: { isAutomated: true },
    orderBy: { createdAt: 'desc' },
  })

  return {
    success: true,
    data: campaigns.map(c => ({
      id: c.id,
      name: c.name,
      subject: c.subject,
      triggerType: c.triggerType,
      triggerDelay: c.triggerDelay,
      status: c.status,
      sent: c.sent,
      opened: c.opened,
      clicked: c.clicked,
    })),
  }
}

export async function setEmailAutomationActive(campaignId: number, active: boolean) {
  try { await requireRole('ADMIN', 'MANAGER') } catch { return { success: false, error: 'Manager access required' } }
  if (!validId(campaignId) || typeof active !== 'boolean') return { success: false, error: 'Invalid automation' }
  try {
    const result = await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM "EmailCampaign" WHERE id = ${campaignId} FOR UPDATE`
      const campaign = await tx.emailCampaign.findUnique({ where: { id: campaignId } })
      if (!campaign?.isAutomated) return { success: false, error: 'Automation not found' }
      if (campaign.status === 'SENDING' || campaign.status === 'SENT') return { success: false, error: 'This automation can no longer be changed.' }
      if (active) {
        assertEmailContentReady(campaign.subject, campaign.body, campaign.isABTest ? campaign.variantB as { subject?: string; body?: string } | null : null)
        const config = await getSmtpConfig()
        if (!config || !isEmailTrackingConfigured()) return { success: false, error: 'Configure SMTP and signed tracking/unsubscribe links before enabling an automation.' }
        resolveSender(config, campaign.fromEmail || config.smtpUser, campaign.fromName)
        if (!campaign.triggerType || !['new_lead', 'post_visit', 'post_purchase'].includes(campaign.triggerType)) return { success: false, error: 'Select a supported automation trigger.' }
        if (!await triggerAvailable(tx, campaign.triggerType, campaignId)) return { success: false, error: 'Another active automation already uses this trigger.' }
      }
      await tx.emailCampaign.update({ where: { id: campaignId }, data: { status: active ? 'SCHEDULED' : 'PAUSED' } })
      return { success: true }
    })
    if (result.success) revalidatePath('/email-marketing')
    return result
  } catch (error) { return { success: false, error: error instanceof Error ? error.message : 'Unable to update automation.' } }
}

export async function duplicateCampaign(campaignId: number) {
  try { await requireRole('ADMIN', 'MANAGER') } catch { return { success: false, error: 'Manager access required' } }
  if (!validId(campaignId)) return { success: false, error: 'Invalid campaign' }

  const original = await prisma.emailCampaign.findUnique({ where: { id: campaignId } })
  if (!original) return { success: false, error: 'Campaign not found' }

  const copy = await prisma.emailCampaign.create({
    data: {
      name: `${original.name} (Copy)`,
      subject: original.subject,
      fromEmail: original.fromEmail,
      fromName: original.fromName,
      body: original.body,
      templateId: original.templateId,
      audience: original.audience,
      audienceFilter: original.audienceFilter || undefined,
      isABTest: original.isABTest,
      variantB: original.variantB || undefined,
      abSplitPercent: original.abSplitPercent,
      // A duplicate must never silently enable another trigger-driven campaign.
      isAutomated: false,
      triggerType: null,
      triggerDelay: null,
    },
  })

  revalidatePath('/email-marketing')
  return { success: true, data: { id: copy.id } }
}
