'use server'

import { prisma } from '@/lib/db'
import { revalidatePath } from 'next/cache'

type NotificationItem = {
  id: string
  type: 'conversation' | 'followup' | 'invoice'
  title: string
  subtitle: string
  date: string
  href: string
  unread?: number
}

export async function getTopNotifications() {
  const now = new Date()
  const followUpWhere = {
    sent: false,
    date: { lte: now },
  }
  const overdueInvoiceWhere = {
    invoiceStatus: 'ACTIVE' as const,
    balanceDue: { gt: 0 },
    dueDate: { lt: now },
  }

  const [
    unreadConversations,
    dueFollowUps,
    overdueInvoices,
    unreadConversationAggregate,
    pendingFollowUpsCount,
    overdueInvoicesCount,
  ] = await Promise.all([
    prisma.conversation.findMany({
      where: { unread: { gt: 0 } },
      orderBy: { date: 'desc' },
      take: 8,
      select: {
        id: true,
        customerName: true,
        channel: true,
        unread: true,
        lastMessage: true,
        date: true,
      },
    }),
    prisma.followUp.findMany({
      where: followUpWhere,
      orderBy: { date: 'asc' },
      take: 8,
      include: {
        lead: {
          include: {
            contact: { select: { name: true } },
          },
        },
      },
    }),
    prisma.invoice.findMany({
      where: overdueInvoiceWhere,
      orderBy: { dueDate: 'asc' },
      take: 8,
      include: {
        contact: { select: { name: true } },
      },
    }),
    prisma.conversation.aggregate({
      where: { unread: { gt: 0 } },
      _sum: { unread: true },
    }),
    prisma.followUp.count({ where: followUpWhere }),
    prisma.invoice.count({ where: overdueInvoiceWhere }),
  ])

  const conversationItems: NotificationItem[] = unreadConversations.map(c => ({
    id: `conversation-${c.id}`,
    type: 'conversation',
    title: `${c.customerName} sent ${c.unread} unread message${c.unread > 1 ? 's' : ''}`,
    subtitle: c.lastMessage || `New ${c.channel} message`,
    date: c.date.toISOString(),
    href: '/conversations',
    unread: c.unread,
  }))

  const followUpItems: NotificationItem[] = dueFollowUps.map(f => ({
    id: `followup-${f.id}`,
    type: 'followup',
    title: `Follow-up due: ${f.lead.contact.name}`,
    subtitle: f.message,
    date: f.date.toISOString(),
    href: '/leads',
  }))

  const invoiceItems: NotificationItem[] = overdueInvoices.map(inv => ({
    id: `invoice-${inv.id}`,
    type: 'invoice',
    title: `Invoice overdue: ${inv.displayId}`,
    subtitle: `${inv.contact.name} - Balance INR ${Intl.NumberFormat('en-IN').format(inv.balanceDue || 0)}`,
    date: (inv.dueDate || inv.date).toISOString(),
    href: '/billing',
  }))

  const items = [...conversationItems, ...followUpItems, ...invoiceItems]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 12)

  const unreadConversationsCount = unreadConversationAggregate._sum.unread || 0

  return {
    success: true,
    data: {
      unreadCount: unreadConversationsCount + pendingFollowUpsCount + overdueInvoicesCount,
      unreadConversationsCount,
      pendingFollowUps: pendingFollowUpsCount,
      overdueInvoices: overdueInvoicesCount,
      items,
    },
  }
}

export async function markConversationNotificationRead(conversationId: number) {
  await prisma.conversation.update({
    where: { id: conversationId },
    data: { unread: 0 },
  })

  revalidatePath('/conversations')
  return { success: true }
}

export async function markAllConversationNotificationsRead() {
  await prisma.conversation.updateMany({
    where: { unread: { gt: 0 } },
    data: { unread: 0 },
  })

  revalidatePath('/conversations')
  return { success: true }
}
