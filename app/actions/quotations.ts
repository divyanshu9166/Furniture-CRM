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

type QuotationBankDetails = {
  accountName?: string
  bankName?: string
  accountNumber?: string
  ifscCode?: string
  branchName?: string
  upiId?: string
}

const BANK_DETAILS_MARKER = '[[BANK_DETAILS]]'
const BANK_DETAILS_END_MARKER = '[[/BANK_DETAILS]]'

function normalizeBankDetails(details?: QuotationBankDetails | null): QuotationBankDetails {
  return {
    accountName: details?.accountName?.trim() || '',
    bankName: details?.bankName?.trim() || '',
    accountNumber: details?.accountNumber?.trim() || '',
    ifscCode: details?.ifscCode?.trim() || '',
    branchName: details?.branchName?.trim() || '',
    upiId: details?.upiId?.trim() || '',
  }
}

function hasAnyBankDetails(details: QuotationBankDetails) {
  return Object.values(details).some(value => Boolean(value))
}

function parseNotesMetadata(notes?: string | null): { bankDetails: QuotationBankDetails; cleanNotes: string } {
  const rawNotes = String(notes || '')
  const markerIndex = rawNotes.indexOf(BANK_DETAILS_MARKER)
  const endMarkerIndex = rawNotes.indexOf(BANK_DETAILS_END_MARKER)

  if (markerIndex === -1 || endMarkerIndex === -1 || endMarkerIndex < markerIndex) {
    return {
      bankDetails: normalizeBankDetails(),
      cleanNotes: rawNotes.trim(),
    }
  }

  const jsonChunk = rawNotes
    .slice(markerIndex + BANK_DETAILS_MARKER.length, endMarkerIndex)
    .trim()

  let parsedDetails: QuotationBankDetails = {}
  try {
    parsedDetails = JSON.parse(jsonChunk) as QuotationBankDetails
  } catch {
    parsedDetails = {}
  }

  const before = rawNotes.slice(0, markerIndex).trim()
  const after = rawNotes.slice(endMarkerIndex + BANK_DETAILS_END_MARKER.length).trim()
  const cleanNotes = [before, after].filter(Boolean).join('\n').trim()

  return {
    bankDetails: normalizeBankDetails(parsedDetails),
    cleanNotes,
  }
}

function buildNotesWithMetadata(notes?: string | null, bankDetails?: QuotationBankDetails | null) {
  const cleanNotes = String(notes || '').trim()
  const normalizedBankDetails = normalizeBankDetails(bankDetails)

  if (!hasAnyBankDetails(normalizedBankDetails)) {
    return cleanNotes || null
  }

  const metadata = `${BANK_DETAILS_MARKER}${JSON.stringify(normalizedBankDetails)}${BANK_DETAILS_END_MARKER}`
  return cleanNotes ? `${metadata}\n${cleanNotes}` : metadata
}

type ProductDescriptionSource = {
  description?: string | null
  material?: string | null
  color?: string | null
  category?: { name: string } | null
}

function getPreferredItemDescription(
  manualDescription?: string | null,
  product?: ProductDescriptionSource | null
) {
  const cleanManualDescription = String(manualDescription || '').trim()
  if (cleanManualDescription) return cleanManualDescription

  const productDescription = String(product?.description || '').trim()
  if (productDescription) return productDescription

  const detailParts: string[] = []
  if (product?.material?.trim()) detailParts.push(`Material: ${product.material.trim()}`)
  if (product?.color?.trim()) detailParts.push(`Color: ${product.color.trim()}`)
  if (product?.category?.name?.trim()) detailParts.push(`Category: ${product.category.name.trim()}`)

  return detailParts.length > 0 ? detailParts.join(' | ') : null
}

function formatQuotation(quotation: QuotationWithRelations) {
  const { bankDetails, cleanNotes } = parseNotesMetadata(quotation.notes)

  const sortedItems = [...quotation.items]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map(item => ({
      id: item.id,
      productId: item.productId,
      productName: item.product?.name || null,
      productImage: item.product?.image || null,
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
    discountType: quotation.discountType,
    discountValue: quotation.discountValue,
    discountAmount: quotation.discountAmount,
    installationCharge: quotation.installationCharge,
    freightCharge: quotation.freightCharge,
    loadingCharge: quotation.loadingCharge,
    gstPercent: quotation.gstPercent,
    gstAmount: quotation.gstAmount,
    totalBeforeTax: quotation.totalBeforeTax,
    grandTotal: quotation.grandTotal,
    notes: cleanNotes,
    bankDetails,
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
    discountType,
    discountValue,
    freightCharge,
    loadingCharge,
    gstPercent,
    bankDetails,
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
        select: {
          id: true,
          name: true,
          sku: true,
          price: true,
          description: true,
          material: true,
          color: true,
          category: { select: { name: true } },
        },
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
      description: getPreferredItemDescription(item.description, product),
      quantity,
      rate,
      amount,
      referenceImage: item.referenceImage,
      sortOrder: idx,
    }
  })

  const subtotal = normalizedItems.reduce((sum, item) => sum + item.amount, 0)
  const normalizedDiscountType = discountType === 'FLAT' ? 'FLAT' : 'PERCENT'
  const normalizedDiscountValue = Math.max(0, Number(discountValue) || 0)
  const computedDiscountAmount = normalizedDiscountType === 'PERCENT'
    ? Math.round((subtotal * normalizedDiscountValue) / 100)
    : Math.round(normalizedDiscountValue)
  const discountAmount = Math.max(0, Math.min(subtotal, computedDiscountAmount))
  const subtotalAfterDiscount = Math.max(0, subtotal - discountAmount)
  const installationCharge = Math.round((subtotalAfterDiscount * installationPercent) / 100)
  const totalBeforeTax = subtotalAfterDiscount + installationCharge + freightCharge + loadingCharge
  const gstAmount = Math.round((totalBeforeTax * gstPercent) / 100)
  const grandTotal = totalBeforeTax + gstAmount
  const notesWithMetadata = buildNotesWithMetadata(notes, bankDetails)

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
      discountType: normalizedDiscountType,
      discountValue: normalizedDiscountValue,
      discountAmount,
      installationCharge,
      freightCharge,
      loadingCharge,
      gstPercent,
      gstAmount,
      totalBeforeTax,
      grandTotal,
      notes: notesWithMetadata,
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
    discountType,
    discountValue,
    freightCharge,
    loadingCharge,
    gstPercent,
    bankDetails,
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
        select: {
          id: true,
          name: true,
          sku: true,
          price: true,
          description: true,
          material: true,
          color: true,
          category: { select: { name: true } },
        },
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
      description: getPreferredItemDescription(item.description, product),
      quantity,
      rate,
      amount,
      referenceImage: item.referenceImage,
      sortOrder: idx,
    }
  })

  const subtotal = normalizedItems.reduce((sum, item) => sum + item.amount, 0)
  const normalizedDiscountType = discountType === 'FLAT' ? 'FLAT' : 'PERCENT'
  const normalizedDiscountValue = Math.max(0, Number(discountValue) || 0)
  const computedDiscountAmount = normalizedDiscountType === 'PERCENT'
    ? Math.round((subtotal * normalizedDiscountValue) / 100)
    : Math.round(normalizedDiscountValue)
  const discountAmount = Math.max(0, Math.min(subtotal, computedDiscountAmount))
  const subtotalAfterDiscount = Math.max(0, subtotal - discountAmount)
  const installationCharge = Math.round((subtotalAfterDiscount * installationPercent) / 100)
  const totalBeforeTax = subtotalAfterDiscount + installationCharge + freightCharge + loadingCharge
  const gstAmount = Math.round((totalBeforeTax * gstPercent) / 100)
  const grandTotal = totalBeforeTax + gstAmount
  const { bankDetails: existingBankDetails, cleanNotes: existingCleanNotes } = parseNotesMetadata(existing.notes)
  const notesWithMetadata = buildNotesWithMetadata(notes ?? existingCleanNotes, bankDetails ?? existingBankDetails)

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
      discountType: normalizedDiscountType,
      discountValue: normalizedDiscountValue,
      discountAmount,
      installationCharge,
      freightCharge,
      loadingCharge,
      gstPercent,
      gstAmount,
      totalBeforeTax,
      grandTotal,
      notes: notesWithMetadata,
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
