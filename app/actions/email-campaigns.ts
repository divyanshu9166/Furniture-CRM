'use server'

import { prisma } from '@/lib/db'
import { revalidatePath } from 'next/cache'
import { requireRole } from '@/lib/auth-helpers'
import { z } from 'zod'
import { testSmtpConnection, sendTestEmail, getSmtpConfig } from '@/lib/email'
import type { SmtpConfig } from '@/lib/email'
import { deliverEmailCampaign } from '@/lib/email-campaign-runner'
import { getPublicAppUrl, isEmailTrackingConfigured } from '@/lib/email-tracking'

// ─── VALIDATION SCHEMAS ─────────────────────────────

const templateSchema = z.object({
  name: z.string().min(1, 'Template name is required'),
  subject: z.string().min(1, 'Subject is required'),
  body: z.string().min(1, 'Body is required'),
  category: z.string().default('Promotional'),
  variables: z.array(z.string()).default([]),
})

const campaignSchema = z.object({
  name: z.string().trim().min(1, 'Campaign name is required').max(150),
  subject: z.string().trim().min(1, 'Subject is required').max(250),
  body: z.string().min(1, 'Email body is required').max(200_000),
  templateId: z.number().optional(),
  audience: z.enum(['all', 'leads', 'customers']).default('all'),
  audienceFilter: z.any().optional(),
  scheduledAt: z.string().datetime().optional(),
  isABTest: z.boolean().default(false),
  variantBSubject: z.string().trim().max(250).optional(),
  variantBBody: z.string().max(200_000).optional(),
  abSplitPercent: z.number().min(10).max(90).default(50),
  isAutomated: z.boolean().default(false),
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
})

async function hasMarketingAccess() {
  try {
    await requireRole('ADMIN', 'MANAGER')
    return true
  } catch {
    return false
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
  const parsed = templateSchema.safeParse(data)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }

  await prisma.emailTemplate.update({ where: { id }, data: parsed.data })
  revalidatePath('/email-marketing')
  return { success: true }
}

export async function deleteEmailTemplate(id: number) {
  try { await requireRole('ADMIN', 'MANAGER') } catch { return { success: false, error: 'Manager access required' } }
  const usedCount = await prisma.emailCampaign.count({ where: { templateId: id } })
  if (usedCount > 0) return { success: false, error: `Template is used by ${usedCount} campaign(s). Remove them first.` }

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

  const scheduledAt = parsed.data.scheduledAt ? new Date(parsed.data.scheduledAt) : null
  if (scheduledAt && scheduledAt <= new Date()) return { success: false, error: 'Scheduled time must be in the future.' }
  if (parsed.data.templateId) {
    const templateExists = await prisma.emailTemplate.count({ where: { id: parsed.data.templateId } })
    if (!templateExists) return { success: false, error: 'Selected template no longer exists.' }
  }
  if (parsed.data.isAutomated) {
    const duplicate = await prisma.emailCampaign.findFirst({
      where: { isAutomated: true, triggerType: parsed.data.triggerType, status: { not: 'PAUSED' } },
      select: { id: true },
    })
    if (duplicate) return { success: false, error: 'An active automation already exists for this trigger. Pause it before creating another.' }
  }

  const campaign = await prisma.emailCampaign.create({
    data: {
      name: parsed.data.name,
      subject: parsed.data.subject,
      body: parsed.data.body,
      templateId: parsed.data.templateId,
      audience: parsed.data.audience,
      audienceFilter: parsed.data.audienceFilter || undefined,
      scheduledAt,
      status: parsed.data.isAutomated || scheduledAt ? 'SCHEDULED' : 'DRAFT',
      isABTest: parsed.data.isABTest,
      variantB: parsed.data.isABTest ? { subject: parsed.data.variantBSubject, body: parsed.data.variantBBody } : undefined,
      abSplitPercent: parsed.data.abSplitPercent,
      isAutomated: parsed.data.isAutomated,
      triggerType: parsed.data.triggerType,
      triggerDelay: parsed.data.triggerDelay,
    },
  })

  revalidatePath('/email-marketing')
  return { success: true, data: { id: campaign.id } }
}

export async function updateEmailCampaign(id: number, data: unknown) {
  try { await requireRole('ADMIN', 'MANAGER') } catch { return { success: false, error: 'Manager access required' } }
  const parsed = campaignSchema.safeParse(data)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }

  const existing = await prisma.emailCampaign.findUnique({ where: { id }, select: { status: true } })
  if (!existing) return { success: false, error: 'Campaign not found' }
  if (existing.status === 'SENT' || existing.status === 'SENDING') return { success: false, error: 'Sent or in-progress campaigns cannot be edited.' }
  const scheduledAt = parsed.data.scheduledAt ? new Date(parsed.data.scheduledAt) : null
  if (scheduledAt && scheduledAt <= new Date()) return { success: false, error: 'Scheduled time must be in the future.' }
  if (parsed.data.templateId) {
    const templateExists = await prisma.emailTemplate.count({ where: { id: parsed.data.templateId } })
    if (!templateExists) return { success: false, error: 'Selected template no longer exists.' }
  }
  if (parsed.data.isAutomated) {
    const duplicate = await prisma.emailCampaign.findFirst({
      where: { id: { not: id }, isAutomated: true, triggerType: parsed.data.triggerType, status: { not: 'PAUSED' } },
      select: { id: true },
    })
    if (duplicate) return { success: false, error: 'An active automation already exists for this trigger.' }
  }

  await prisma.emailCampaign.update({
    where: { id },
    data: {
      name: parsed.data.name,
      subject: parsed.data.subject,
      body: parsed.data.body,
      templateId: parsed.data.templateId,
      audience: parsed.data.audience,
      audienceFilter: parsed.data.audienceFilter || undefined,
      scheduledAt,
      status: parsed.data.isAutomated || scheduledAt ? 'SCHEDULED' : 'DRAFT',
      isABTest: parsed.data.isABTest,
      variantB: parsed.data.isABTest ? { subject: parsed.data.variantBSubject, body: parsed.data.variantBBody } : undefined,
      abSplitPercent: parsed.data.abSplitPercent,
      isAutomated: parsed.data.isAutomated,
      triggerType: parsed.data.triggerType,
      triggerDelay: parsed.data.triggerDelay,
    },
  })

  revalidatePath('/email-marketing')
  return { success: true }
}

export async function deleteEmailCampaign(id: number) {
  try { await requireRole('ADMIN', 'MANAGER') } catch { return { success: false, error: 'Manager access required' } }
  const campaign = await prisma.emailCampaign.findUnique({ where: { id }, select: { status: true } })
  if (!campaign) return { success: false, error: 'Campaign not found' }
  if (campaign.status === 'SENDING') return { success: false, error: 'Campaign is currently sending and cannot be deleted.' }
  await prisma.emailCampaign.delete({ where: { id } })
  revalidatePath('/email-marketing')
  return { success: true }
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

export async function testSmtp(config: {
  smtpHost: string; smtpPort: number; smtpUser: string; smtpPass: string; smtpFromName: string; smtpSecure: boolean
}) {
  try { await requireRole('ADMIN') } catch { return { success: false, error: 'Admin access required' } }
  const result = await testSmtpConnection(config as SmtpConfig)
  return result
}

export async function sendSmtpTestEmail(config: {
  smtpHost: string; smtpPort: number; smtpUser: string; smtpPass: string; smtpFromName: string; smtpSecure: boolean
}, toEmail: string) {
  try { await requireRole('ADMIN') } catch { return { success: false, error: 'Admin access required' } }
  const result = await sendTestEmail(config as SmtpConfig, toEmail)
  return result
}

export async function getEmailConfigStatus() {
  if (!await hasMarketingAccess()) return { success: false, error: 'Manager access required' }

  const config = await getSmtpConfig()
  return {
    success: true,
    configured: !!config,
    smtpHost: config?.smtpHost || null,
    smtpUser: config?.smtpUser || null,
    fromName: config?.smtpFromName || null,
    trackingConfigured: isEmailTrackingConfigured(),
  }
}

// ─── CAMPAIGN ANALYTICS ─────────────────────────────

export async function getCampaignAnalytics(campaignId: number) {
  if (!await hasMarketingAccess()) return { success: false, error: 'Manager access required' }

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

  // Aggregate events timeline (last 7 days)
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  const events = await prisma.emailEvent.findMany({
    where: {
      recipient: { campaignId },
      createdAt: { gte: sevenDaysAgo },
    },
    orderBy: { createdAt: 'desc' },
    take: 500,
    select: { type: true, createdAt: true, recipient: { select: { variant: true } } },
  })

  // A/B test breakdown
  let abStats: {
    A: { sent: number; opened: number; clicked: number; openRate: number; clickRate: number }
    B: { sent: number; opened: number; clicked: number; openRate: number; clickRate: number }
  } | null = null
  if (campaign.isABTest) {
    const variantA = campaign.recipients.filter(r => r.variant === 'A')
    const variantB = campaign.recipients.filter(r => r.variant === 'B')
    abStats = {
      A: {
        sent: variantA.length,
        opened: variantA.filter(r => r.openedAt).length,
        clicked: variantA.filter(r => r.clickedAt).length,
        openRate: variantA.length > 0 ? Math.round((variantA.filter(r => r.openedAt).length / variantA.length) * 100) : 0,
        clickRate: variantA.length > 0 ? Math.round((variantA.filter(r => r.clickedAt).length / variantA.length) * 100) : 0,
      },
      B: {
        sent: variantB.length,
        opened: variantB.filter(r => r.openedAt).length,
        clicked: variantB.filter(r => r.clickedAt).length,
        openRate: variantB.length > 0 ? Math.round((variantB.filter(r => r.openedAt).length / variantB.length) * 100) : 0,
        clickRate: variantB.length > 0 ? Math.round((variantB.filter(r => r.clickedAt).length / variantB.length) * 100) : 0,
      },
    }
  }

  // Build daily timeline
  const timeline: Record<string, { opens: number; clicks: number }> = {}
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000)
    const key = d.toISOString().split('T')[0]
    timeline[key] = { opens: 0, clicks: 0 }
  }
  events.forEach(e => {
    const key = e.createdAt.toISOString().split('T')[0]
    if (timeline[key]) {
      if (e.type === 'open') timeline[key].opens++
      if (e.type === 'click') timeline[key].clicks++
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
  const recipient = await prisma.emailRecipient.findUnique({
    where: { id: recipientId },
    include: { campaign: true },
  })
  if (!recipient) return { success: false }

  if (type === 'unsubscribe' && recipient.status === 'unsubscribed') return { success: true }
  if (type === 'bounce' && recipient.bouncedAt) return { success: true }

  await prisma.emailEvent.create({ data: { recipientId, type, metadata: (metadata || {}) as any } })

  // Update recipient stats
  const recipientUpdate: Record<string, unknown> = {}
  const campaignUpdate: Record<string, unknown> = {}

  if (type === 'open') {
    recipientUpdate.opens = { increment: 1 }
    if (!recipient.openedAt) {
      recipientUpdate.openedAt = new Date()
      recipientUpdate.status = 'opened'
      campaignUpdate.opened = { increment: 1 }
    }
  } else if (type === 'click') {
    recipientUpdate.clicks = { increment: 1 }
    if (!recipient.clickedAt) {
      recipientUpdate.clickedAt = new Date()
      recipientUpdate.status = 'clicked'
      campaignUpdate.clicked = { increment: 1 }
    }
  } else if (type === 'bounce') {
    recipientUpdate.status = 'bounced'
    recipientUpdate.bouncedAt = new Date()
    campaignUpdate.bounced = { increment: 1 }
  } else if (type === 'unsubscribe') {
    recipientUpdate.status = 'unsubscribed'
    campaignUpdate.unsubscribed = { increment: 1 }
    // Also update contact subscription
    if (recipient.contactId) {
      await prisma.contact.update({
        where: { id: recipient.contactId },
        data: { emailSubscribed: false },
      })
    }
  }

  await prisma.$transaction([
    prisma.emailRecipient.update({ where: { id: recipientId }, data: recipientUpdate }),
    prisma.emailCampaign.update({ where: { id: recipient.campaignId }, data: campaignUpdate }),
  ])

  return { success: true }
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
  if (!Number.isInteger(campaignId) || campaignId <= 0) return { success: false, error: 'Invalid campaign' }

  const campaign = await prisma.emailCampaign.findUnique({ where: { id: campaignId }, select: { isAutomated: true, status: true } })
  if (!campaign?.isAutomated) return { success: false, error: 'Automation not found' }
  if (campaign.status === 'SENDING' || campaign.status === 'SENT') return { success: false, error: 'This automation can no longer be changed.' }

  await prisma.emailCampaign.update({ where: { id: campaignId }, data: { status: active ? 'SCHEDULED' : 'PAUSED' } })
  revalidatePath('/email-marketing')
  return { success: true }
}

export async function duplicateCampaign(campaignId: number) {
  try { await requireRole('ADMIN', 'MANAGER') } catch { return { success: false, error: 'Manager access required' } }

  const original = await prisma.emailCampaign.findUnique({ where: { id: campaignId } })
  if (!original) return { success: false, error: 'Campaign not found' }

  const copy = await prisma.emailCampaign.create({
    data: {
      name: `${original.name} (Copy)`,
      subject: original.subject,
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
