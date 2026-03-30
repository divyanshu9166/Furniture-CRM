'use server'

import { prisma } from '@/lib/db'

function getPercentChange(current: number, previous: number) {
  if (previous <= 0) return current > 0 ? 100 : 0
  return Math.round(((current - previous) / previous) * 100)
}

const leadStatusOrder = ['NEW', 'CONTACTED', 'SHOWROOM_VISIT', 'QUOTATION', 'WON', 'LOST'] as const
const leadStatusLabel: Record<string, string> = {
  NEW: 'New',
  CONTACTED: 'Contacted',
  SHOWROOM_VISIT: 'Showroom Visit',
  QUOTATION: 'Quotation',
  WON: 'Converted',
  LOST: 'Lost',
}

export async function getDashboardStats() {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const todayEnd = new Date()
  todayEnd.setHours(23, 59, 59, 999)

  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1)
  const prevMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1)
  const prevMonthLastDay = new Date(today.getFullYear(), today.getMonth(), 0).getDate()
  const prevMonthComparableEnd = new Date(
    today.getFullYear(),
    today.getMonth() - 1,
    Math.min(today.getDate(), prevMonthLastDay),
    23,
    59,
    59,
    999
  )

  const [
    leadsToday,
    appointmentsToday,
    activeOrders,
    totalRevenue,
    recentLeads,
    upcomingAppointments,
    bestSellers,
    lowStockProducts,
    fieldVisitActivity,
    revenueMtd,
    revenuePrevMtd,
    leadsMtd,
    leadsPrevMtd,
    wonMtd,
    wonPrevMtd,
    invoicesMtd,
    invoicesPrevMtd,
    pendingCollections,
    overdueInvoices,
    dueFollowUps,
    leadsByStatus,
    leadsBySource,
    wonBySource,
  ] = await Promise.all([
    prisma.lead.count({ where: { date: { gte: today } } }),
    prisma.appointment.count({ where: { date: { gte: today }, status: 'Scheduled' } }),
    prisma.order.count({ where: { status: { in: ['CONFIRMED', 'PROCESSING', 'SHIPPED'] } } }),
    prisma.order.aggregate({ _sum: { amount: true } }),
    prisma.lead.findMany({
      take: 6,
      orderBy: { date: 'desc' },
      include: { contact: true },
    }),
    prisma.appointment.findMany({
      where: { status: 'Scheduled' },
      take: 5,
      orderBy: { date: 'asc' },
      include: { contact: true },
    }),
    prisma.product.findMany({
      take: 8,
      orderBy: { sold: 'desc' },
      where: { sold: { gt: 0 } },
    }),
    // Raw query to get products where stock <= reorderLevel
    prisma.$queryRaw`SELECT id, name, "categoryId", stock, "reorderLevel", image FROM "Product" WHERE stock <= "reorderLevel" ORDER BY stock ASC LIMIT 10` as Promise<any[]>,
    // Recent field visits — scheduled, in progress, and completed today
    prisma.fieldVisit.findMany({
      where: {
        OR: [
          { status: { in: ['Scheduled', 'In Progress'] } },
          { status: 'Completed', completedAt: { gte: today } },
        ],
        customOrderId: { not: null },
      },
      include: {
        staff: { select: { name: true, role: true } },
        customOrder: { select: { displayId: true, type: true } },
      },
      orderBy: { scheduledDate: 'asc' },
      take: 10,
    }),
    prisma.invoice.aggregate({
      where: { invoiceStatus: 'ACTIVE', date: { gte: monthStart, lte: todayEnd } },
      _sum: { total: true },
    }),
    prisma.invoice.aggregate({
      where: { invoiceStatus: 'ACTIVE', date: { gte: prevMonthStart, lte: prevMonthComparableEnd } },
      _sum: { total: true },
    }),
    prisma.lead.count({ where: { date: { gte: monthStart, lte: todayEnd } } }),
    prisma.lead.count({ where: { date: { gte: prevMonthStart, lte: prevMonthComparableEnd } } }),
    prisma.lead.count({ where: { status: 'WON', date: { gte: monthStart, lte: todayEnd } } }),
    prisma.lead.count({ where: { status: 'WON', date: { gte: prevMonthStart, lte: prevMonthComparableEnd } } }),
    prisma.invoice.count({ where: { invoiceStatus: 'ACTIVE', date: { gte: monthStart, lte: todayEnd } } }),
    prisma.invoice.count({ where: { invoiceStatus: 'ACTIVE', date: { gte: prevMonthStart, lte: prevMonthComparableEnd } } }),
    prisma.invoice.aggregate({
      where: { invoiceStatus: 'ACTIVE', balanceDue: { gt: 0 } },
      _sum: { balanceDue: true },
      _count: { id: true },
    }),
    prisma.invoice.findMany({
      where: {
        invoiceStatus: 'ACTIVE',
        balanceDue: { gt: 0 },
        dueDate: { lt: today },
      },
      orderBy: { dueDate: 'asc' },
      take: 8,
      include: { contact: { select: { name: true } } },
    }),
    prisma.followUp.findMany({
      where: {
        sent: false,
        date: { lte: todayEnd },
      },
      orderBy: { date: 'asc' },
      take: 8,
      include: {
        lead: {
          include: {
            contact: { select: { name: true, phone: true } },
            assignedTo: { select: { name: true } },
          },
        },
      },
    }),
    prisma.lead.groupBy({
      by: ['status'],
      _count: true,
    }),
    prisma.lead.groupBy({
      by: ['source'],
      _count: true,
    }),
    prisma.lead.groupBy({
      by: ['source'],
      where: { status: 'WON' },
      _count: true,
    }),
  ])

  // Get category names for low stock items
  const categoryIds = lowStockProducts.map((p: any) => p.categoryId).filter(Boolean)
  const categoriesMap: Record<number, string> = {}
  if (categoryIds.length > 0) {
    const cats = await prisma.category.findMany({ where: { id: { in: categoryIds } } })
    for (const c of cats) categoriesMap[c.id] = c.name
  }

  const revenueMtdValue = revenueMtd._sum.total || 0
  const revenuePrevMtdValue = revenuePrevMtd._sum.total || 0

  const conversionMtd = leadsMtd > 0 ? Math.round((wonMtd / leadsMtd) * 1000) / 10 : 0
  const conversionPrevMtd = leadsPrevMtd > 0 ? Math.round((wonPrevMtd / leadsPrevMtd) * 1000) / 10 : 0

  const avgOrderValueMtd = invoicesMtd > 0 ? Math.round(revenueMtdValue / invoicesMtd) : 0
  const avgOrderValuePrevMtd = invoicesPrevMtd > 0 ? Math.round(revenuePrevMtdValue / invoicesPrevMtd) : 0

  const statusCountMap: Record<string, number> = {}
  for (const row of leadsByStatus) statusCountMap[row.status] = row._count

  const sourceLeadMap: Record<string, number> = {}
  for (const row of leadsBySource) sourceLeadMap[row.source || 'Unknown'] = row._count

  const sourceWonMap: Record<string, number> = {}
  for (const row of wonBySource) sourceWonMap[row.source || 'Unknown'] = row._count

  const channelPerformance = Object.keys(sourceLeadMap)
    .sort((a, b) => sourceLeadMap[b] - sourceLeadMap[a])
    .map(source => {
      const leads = sourceLeadMap[source] || 0
      const won = sourceWonMap[source] || 0
      const winRate = leads > 0 ? Math.round((won / leads) * 100) : 0
      return { source, leads, won, winRate }
    })

  const lowStockCritical = lowStockProducts.filter((p: any) => p.stock === 0).length

  return {
    success: true,
    data: {
      leadsToday,
      appointmentsToday,
      activeOrders,
      totalRevenue: totalRevenue._sum.amount || 0,
      recentLeads: recentLeads.map(l => ({
        id: l.id,
        name: l.contact.name,
        interest: l.interest,
        status: l.status,
        source: l.source,
      })),
      upcomingAppointments: upcomingAppointments.map(a => ({
        id: a.id,
        customer: a.contact.name,
        date: a.date.toISOString().split('T')[0],
        time: a.time,
        purpose: a.purpose,
      })),
      bestSellers: bestSellers.map(p => ({
        name: p.name,
        sold: p.sold,
      })),
      lowStockItems: lowStockProducts.map((p: any) => ({
        id: p.id,
        name: p.name,
        category: categoriesMap[p.categoryId] || '',
        stock: p.stock,
        image: p.image,
      })),
      fieldVisits: fieldVisitActivity.map(v => ({
        id: v.id,
        displayId: v.displayId,
        staffName: v.staff.name,
        staffRole: v.staff.role,
        customer: v.customer,
        address: v.address,
        status: v.status,
        scheduledDate: v.scheduledDate?.toISOString().split('T')[0] || v.date.toISOString().split('T')[0],
        scheduledTime: v.scheduledTime || v.time,
        completedAt: v.completedAt?.toISOString().split('T')[0] || null,
        orderDisplayId: v.customOrder?.displayId || null,
        orderType: v.customOrder?.type || null,
        hasMeasurements: v.measurements !== null,
        hasNotes: !!v.staffNotes,
      })),
      kpis: {
        revenueMtd: revenueMtdValue,
        revenueChangePct: getPercentChange(revenueMtdValue, revenuePrevMtdValue),
        leadsMtd,
        leadsChangePct: getPercentChange(leadsMtd, leadsPrevMtd),
        conversionRate: conversionMtd,
        conversionChangePct: Math.round((conversionMtd - conversionPrevMtd) * 10) / 10,
        avgOrderValue: avgOrderValueMtd,
        avgOrderValueChangePct: getPercentChange(avgOrderValueMtd, avgOrderValuePrevMtd),
        pendingCollections: pendingCollections._sum.balanceDue || 0,
        pendingInvoices: pendingCollections._count.id || 0,
        overdueInvoices: overdueInvoices.length,
      },
      pipeline: leadStatusOrder.map(status => ({
        key: status,
        label: leadStatusLabel[status],
        count: statusCountMap[status] || 0,
      })),
      channelPerformance,
      actionCenter: {
        pendingFollowUps: dueFollowUps.length,
        overdueInvoices: overdueInvoices.length,
        dueAppointmentsToday: appointmentsToday,
        lowStockCritical,
        followUpItems: dueFollowUps.map(f => ({
          id: f.id,
          customer: f.lead.contact.name,
          phone: f.lead.contact.phone,
          interest: f.lead.interest,
          dueDate: f.date.toISOString().split('T')[0],
          assignedTo: f.lead.assignedTo?.name || null,
        })),
        overdueInvoicesList: overdueInvoices.map(inv => ({
          id: inv.id,
          displayId: inv.displayId,
          customer: inv.contact.name,
          balanceDue: inv.balanceDue,
          dueDate: inv.dueDate?.toISOString().split('T')[0] || null,
        })),
      },
    },
  }
}
