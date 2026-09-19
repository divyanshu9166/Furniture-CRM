'use server'

import { prisma } from '@/lib/db'
import { requireRole } from '@/lib/auth-helpers'

export async function getCampaigns() {
  try {
    await requireRole('ADMIN', 'MANAGER')
  } catch {
    return { success: false, error: 'Manager access required', data: [] }
  }

  try {
    const campaigns = await prisma.campaign.findMany({
      orderBy: { createdAt: 'desc' },
    })

    return {
      success: true,
      data: campaigns.map(c => ({
        id: c.id,
        name: c.name,
        channel: c.channel,
        status: c.status.charAt(0) + c.status.slice(1).toLowerCase(),
        scheduledDate: c.scheduledDate?.toISOString().split('T')[0] || null,
        audience: c.audience,
        sent: c.sent,
        opened: c.opened,
        clicked: c.clicked,
        template: c.template,
      })),
    }
  } catch {
    return { success: false, error: 'Unable to load campaign history', data: [] }
  }
}
