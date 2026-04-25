'use server'

import { prisma } from '@/lib/db'
import { revalidatePath } from 'next/cache'
import { createQuotationSchema, updateQuotationSchema, updateQuotationStatusSchema } from '@/lib/validations/quotation'
import type { Quotation, QuotationItem, QuotationStatus, Contact, Product } from '@prisma/client'

type QuotationWithRelations = Quotation & {
  contact: Contact
  items: (QuotationItem & { product: Product | null })[]
}

const statusDisplay: Record<QuotationStatus, string> = {
  DRAFT: 'Draft',
  SENT: 'Sent',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
}

const defaultTerms = [
  'Extra work will be accounted separately.',
  '50% payment in advance with purchase order.',
  'Balance payment before dispatch of goods.',
  'GST at applicable rate will be charged extra.',
  'Labour to load/unload vehicle is at consignee expense.',
  'Packing charge and freight are at actual basis.',
  'Once order is confirmed, amendment or cancellation is not allowed.',
]

function formatQuotation(quotation: QuotationWithRelations) {
  const sortedItems = [...quotation.items]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map(item => ({
      id: item.id,
      productId: item.productId,
      productName: item.product?.name || null,
      name: item.name,
      sku: item.sku,
      description: item.description,
      quantity: item.quantity,
      rate: item.rate,
      amount: item.amount,
      referenceImage: item.referenceImage,
    }))

  const subtotal = sortedItems.reduce((sum, item) => sum + Number(item.amount || 0), 0)

  return {
    id: quotation.displayId,
    dbId: quotation.id,
    customer: quotation.contact.name,
    phone: quotation.contact.phone,
    email: quotation.emailId || quotation.contact.email || null,
    dispatchAddress: quotation.dispatchAddress || quotation.contact.address || null,
    date: quotation.date.toISOString().split('T')[0],
    validUntil: quotation.validUntil?.toISOString().split('T')[0] || null,
    projectName: quotation.projectName,
    deliveryMode: quotation.deliveryMode,
    roadPermit: quotation.roadPermit,
    contactPerson: quotation.contactPerson,
    subtotal,
    installationPercent: quotation.installationPercent,
    installationCharge: quotation.installationCharge,
    freightCharge: quotation.freightCharge,
    loadingCharge: quotation.loadingCharge,
    gstPercent: quotation.gstPercent,
    gstAmount: quotation.gstAmount,
    totalBeforeTax: quotation.totalBeforeTax,
    grandTotal: quotation.grandTotal,
    notes: quotation.notes,
    termsAndConditions: quotation.termsAndConditions,
    status: statusDisplay[quotation.status],
    statusKey: quotation.status,
    items: sortedItems,
  }
}

export async function getQuotations() {
  const quotations = await prisma.quotation.findMany({
    include: {
      contact: true,
      items: { include: { product: true } },
    },
    orderBy: { date: 'desc' },
  })

  return {
    success: true,
    data: quotations.map(formatQuotation),
  }
}

export async function getQuotation(id: number) {
  const quotation = await prisma.quotation.findUnique({
    where: { id },
    include: {
      contact: true,
      items: { include: { product: true }, orderBy: { sortOrder: 'asc' } },
    },
  })

  if (!quotation) return { success: false, error: 'Quotation not found' }
  return { success: true, data: formatQuotation(quotation) }
}

export async function createQuotation(data: unknown) {
  const parsed = createQuotationSchema.safeParse(data)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }

  const {
    customer,
    phone,
    email,
    dispatchAddress,
    date,
    validUntil,
    projectName,
    deliveryMode,
    roadPermit,
    contactPerson,
    installationPercent,
    freightCharge,
    loadingCharge,
    gstPercent,
    notes,
    termsAndConditions,
    items,
  } = parsed.data

  const emailValue = email || undefined
  const addressValue = dispatchAddress || undefined

  let contact = await prisma.contact.findFirst({ where: { phone } })
  if (!contact) {
    contact = await prisma.contact.create({
      data: {
        name: customer,
        phone,
        email: emailValue,
        address: addressValue,
      },
    })
  } else {
    const needsUpdate =
      contact.name !== customer ||
      (emailValue !== undefined && contact.email !== emailValue) ||
      (addressValue !== undefined && contact.address !== addressValue)

    if (needsUpdate) {
      contact = await prisma.contact.update({
        where: { id: contact.id },
        data: {
          name: customer,
          email: emailValue,
          address: addressValue,
        },
      })
    }
  }

  const productIds = Array.from(new Set(items.map(item => item.productId).filter((id): id is number => !!id)))
  const products = productIds.length
    ? await prisma.product.findMany({
        where: { id: { in: productIds } },
        select: { id: true, name: true, sku: true, price: true },
      })
    : []
  const productById = new Map(products.map(p => [p.id, p]))

  for (const item of items) {
    if (item.productId && !productById.has(item.productId)) {
      return { success: false, error: 'One of the selected products no longer exists' }
    }
  }

  const normalizedItems = items.map((item, idx) => {
    const product = item.productId ? productById.get(item.productId) : null
    const quantity = Math.max(1, item.quantity)
    const rate = Math.max(0, Math.round(item.rate || product?.price || 0))
    const amount = quantity * rate

    return {
      productId: item.productId,
      name: item.name || product?.name || 'Item',
      sku: item.sku || product?.sku || null,
      description: item.description,
      quantity,
      rate,
      amount,
      referenceImage: item.referenceImage,
      sortOrder: idx,
    }
  })

  const subtotal = normalizedItems.reduce((sum, item) => sum + item.amount, 0)
  const installationCharge = Math.round((subtotal * installationPercent) / 100)
  const totalBeforeTax = subtotal + installationCharge + freightCharge + loadingCharge
  const gstAmount = Math.round((totalBeforeTax * gstPercent) / 100)
  const grandTotal = totalBeforeTax + gstAmount

  const lastQuotation = await prisma.quotation.findFirst({
    orderBy: { id: 'desc' },
    select: { displayId: true },
  })

  let nextNum = 1000
  if (lastQuotation?.displayId) {
    const match = lastQuotation.displayId.match(/(\d+)$/)
    if (match) nextNum = parseInt(match[1]) + 1
  }
  const displayId = `Q.${nextNum}`

  const quotation = await prisma.quotation.create({
    data: {
      displayId,
      contactId: contact.id,
      date: date ? new Date(date) : new Date(),
      validUntil: validUntil ? new Date(validUntil) : null,
      projectName,
      deliveryMode,
      roadPermit,
      emailId: emailValue,
      contactPerson,
      dispatchAddress: addressValue,
      installationPercent,
      installationCharge,
      freightCharge,
      loadingCharge,
      gstPercent,
      gstAmount,
      totalBeforeTax,
      grandTotal,
      notes,
      termsAndConditions: termsAndConditions.length > 0 ? termsAndConditions : defaultTerms,
      status: 'DRAFT',
      items: {
        create: normalizedItems,
      },
    },
    include: {
      contact: true,
      items: { include: { product: true } },
    },
  })

  revalidatePath('/quotations')
  return { success: true, data: formatQuotation(quotation) }
}

export async function updateQuotation(data: unknown) {
  const parsed = updateQuotationSchema.safeParse(data)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }

  const {
    id,
    customer,
    phone,
    email,
    dispatchAddress,
    date,
    validUntil,
    projectName,
    deliveryMode,
    roadPermit,
    contactPerson,
    installationPercent,
    freightCharge,
    loadingCharge,
    gstPercent,
    notes,
    termsAndConditions,
    items,
  } = parsed.data

  const existing = await prisma.quotation.findUnique({
    where: { id },
    include: { contact: true },
  })
  if (!existing) return { success: false, error: 'Quotation not found' }

  const emailValue = email || undefined
  const addressValue = dispatchAddress || undefined

  let contact = existing.contact
  if (contact.phone === phone) {
    contact = await prisma.contact.update({
      where: { id: contact.id },
      data: {
        name: customer,
        email: emailValue,
        address: addressValue,
      },
    })
  } else {
    const matchedContact = await prisma.contact.findFirst({ where: { phone } })
    if (!matchedContact) {
      contact = await prisma.contact.create({
        data: {
          name: customer,
          phone,
          email: emailValue,
          address: addressValue,
        },
      })
    } else {
      contact = await prisma.contact.update({
        where: { id: matchedContact.id },
        data: {
          name: customer,
          email: emailValue,
          address: addressValue,
        },
      })
    }
  }

  const productIds = Array.from(new Set(items.map(item => item.productId).filter((productId): productId is number => !!productId)))
  const products = productIds.length
    ? await prisma.product.findMany({
        where: { id: { in: productIds } },
        select: { id: true, name: true, sku: true, price: true },
      })
    : []
  const productById = new Map(products.map(product => [product.id, product]))

  for (const item of items) {
    if (item.productId && !productById.has(item.productId)) {
      return { success: false, error: 'One of the selected products no longer exists' }
    }
  }

  const normalizedItems = items.map((item, idx) => {
    const product = item.productId ? productById.get(item.productId) : null
    const quantity = Math.max(1, item.quantity)
    const rate = Math.max(0, Math.round(item.rate || product?.price || 0))
    const amount = quantity * rate

    return {
      productId: item.productId,
      name: item.name || product?.name || 'Item',
      sku: item.sku || product?.sku || null,
      description: item.description,
      quantity,
      rate,
      amount,
      referenceImage: item.referenceImage,
      sortOrder: idx,
    }
  })

  const subtotal = normalizedItems.reduce((sum, item) => sum + item.amount, 0)
  const installationCharge = Math.round((subtotal * installationPercent) / 100)
  const totalBeforeTax = subtotal + installationCharge + freightCharge + loadingCharge
  const gstAmount = Math.round((totalBeforeTax * gstPercent) / 100)
  const grandTotal = totalBeforeTax + gstAmount

  const quotation = await prisma.quotation.update({
    where: { id },
    data: {
      contactId: contact.id,
      date: date ? new Date(date) : existing.date,
      validUntil: validUntil ? new Date(validUntil) : null,
      projectName,
      deliveryMode,
      roadPermit,
      emailId: emailValue,
      contactPerson,
      dispatchAddress: addressValue,
      installationPercent,
      installationCharge,
      freightCharge,
      loadingCharge,
      gstPercent,
      gstAmount,
      totalBeforeTax,
      grandTotal,
      notes,
      termsAndConditions: termsAndConditions.length > 0 ? termsAndConditions : defaultTerms,
      items: {
        deleteMany: {},
        create: normalizedItems,
      },
    },
    include: {
      contact: true,
      items: { include: { product: true } },
    },
  })

  revalidatePath('/quotations')
  return { success: true, data: formatQuotation(quotation) }
}

export async function updateQuotationStatus(data: unknown) {
  const parsed = updateQuotationStatusSchema.safeParse(data)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }

  await prisma.quotation.update({
    where: { id: parsed.data.id },
    data: { status: parsed.data.status },
  })

  revalidatePath('/quotations')
  return { success: true }
}

export async function getQuotationStats() {
  const [total, draft, sent, approved, rejected, totalValue] = await Promise.all([
    prisma.quotation.count(),
    prisma.quotation.count({ where: { status: 'DRAFT' } }),
    prisma.quotation.count({ where: { status: 'SENT' } }),
    prisma.quotation.count({ where: { status: 'APPROVED' } }),
    prisma.quotation.count({ where: { status: 'REJECTED' } }),
    prisma.quotation.aggregate({ _sum: { grandTotal: true } }),
  ])

  return {
    success: true,
    data: {
      total,
      draft,
      sent,
      approved,
      rejected,
      totalValue: totalValue._sum.grandTotal || 0,
    },
  }
}
