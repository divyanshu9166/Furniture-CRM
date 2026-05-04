import { prisma } from '@/lib/db'
import { revalidatePath } from 'next/cache'

const INDIA_MART_PULL_URL = 'https://mapi.indiamart.com/wservce/crm/crmListing/v2/'
const PRISMA_INDIAMART_SCHEMA_ERROR = 'IndiaMART schema is not available in Prisma client. Run `npx prisma generate`, `npx prisma db push`, then restart the dev server.'
const MIN_SYNC_INTERVAL_MS = 5 * 60 * 1000
const MAX_API_WINDOW_MS = 7 * 24 * 60 * 60 * 1000

const QUERY_TYPE_LABELS = {
  W: 'Direct Enquiry',
  B: 'Buy Lead',
  P: 'PNS Call',
  BIZ: 'Catalog View',
  WA: 'WhatsApp Enquiry',
}

const MONTH_MAP = {
  JAN: 0,
  FEB: 1,
  MAR: 2,
  APR: 3,
  MAY: 4,
  JUN: 5,
  JUL: 6,
  AUG: 7,
  SEP: 8,
  OCT: 9,
  NOV: 10,
  DEC: 11,
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value))
}

function asString(value) {
  if (value === null || value === undefined) return ''
  return String(value).trim()
}

function normalizePhone(value) {
  const digits = asString(value).replace(/\D/g, '')
  if (!digits) return ''
  return digits.length > 10 ? digits.slice(-10) : digits
}

function isValidEmail(value) {
  const email = asString(value)
  if (!email) return false
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

function formatIndiaMartTimestamp(date) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date)

  const get = (type) => parts.find(p => p.type === type)?.value || ''
  return `${get('day')}-${get('month')}-${get('year')}${get('hour')}:${get('minute')}:${get('second')}`
}

function parseIndiaMartTime(value) {
  const text = asString(value)
  if (!text) return null

  let match = text.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/)
  if (match) {
    const [, y, m, d, hh, mm, ss] = match
    const utc = Date.UTC(
      Number(y),
      Number(m) - 1,
      Number(d),
      Number(hh) - 5,
      Number(mm) - 30,
      Number(ss),
    )
    return new Date(utc)
  }

  match = text.match(/^(\d{2})-([A-Za-z]{3})-(\d{4})(\d{2}):(\d{2}):(\d{2})$/)
  if (match) {
    const [, d, mon, y, hh, mm, ss] = match
    const monthIndex = MONTH_MAP[mon.toUpperCase()]
    if (monthIndex !== undefined) {
      const utc = Date.UTC(
        Number(y),
        monthIndex,
        Number(d),
        Number(hh) - 5,
        Number(mm) - 30,
        Number(ss),
      )
      return new Date(utc)
    }
  }

  const parsed = new Date(text)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed
}

function extractReceiverMobile(row) {
  return asString(row.RECEIVER_MOBILE || row.RECEIVERMOBILE || '')
}

function buildLeadNotes(row) {
  const queryType = asString(row.QUERY_TYPE)
  const queryTypeLabel = QUERY_TYPE_LABELS[queryType] || queryType || 'Unknown'

  const lines = [
    `IndiaMART Query ID: ${asString(row.UNIQUE_QUERY_ID)}`,
    `IndiaMART Query Type: ${queryTypeLabel}${queryType ? ` (${queryType})` : ''}`,
  ]

  if (asString(row.SENDER_COMPANY)) lines.push(`Company: ${asString(row.SENDER_COMPANY)}`)
  if (asString(row.SENDER_CITY) || asString(row.SENDER_STATE)) {
    lines.push(`Location: ${[asString(row.SENDER_CITY), asString(row.SENDER_STATE)].filter(Boolean).join(', ')}`)
  }
  if (asString(row.QUERY_MESSAGE)) lines.push(`Message: ${asString(row.QUERY_MESSAGE)}`)

  return lines.join('\n')
}

async function ensureIndiaMartConfig() {
  let config = await prisma.indiaMartConfig.findUnique({ where: { id: 1 } })
  if (!config) {
    config = await prisma.indiaMartConfig.create({ data: { id: 1 } })
  }
  return config
}

export async function syncIndiaMartPullLeadsCore(options = {}) {
  const { bypassMinInterval = false } = options

  if (!prisma?.indiaMartConfig || !prisma?.indiaMartLead) {
    return { success: false, error: PRISMA_INDIAMART_SCHEMA_ERROR }
  }

  const config = await ensureIndiaMartConfig()
  if (!config.enabled) {
    return { success: false, error: 'IndiaMART integration is disabled. Enable it in settings first.' }
  }
  if (!config.pullApiKey) {
    return { success: false, error: 'Pull API key is missing. Save your IndiaMART key first.' }
  }

  const now = new Date()
  if (!bypassMinInterval && config.lastSyncAt && now.getTime() - config.lastSyncAt.getTime() < MIN_SYNC_INTERVAL_MS) {
    return { success: false, error: 'Please wait at least 5 minutes between IndiaMART Pull API syncs.' }
  }

  let startTime = null
  let endTime = null

  if (config.lastSyncEnd) {
    endTime = now
    const overlapStart = new Date(config.lastSyncEnd.getTime() - clamp(config.overlapMinutes || 5, 1, 60) * 60 * 1000)
    const maxRangeStart = new Date(endTime.getTime() - MAX_API_WINDOW_MS)
    startTime = overlapStart < maxRangeStart ? maxRangeStart : overlapStart
  }

  const url = new URL(INDIA_MART_PULL_URL)
  url.searchParams.set('glusr_crm_key', config.pullApiKey)

  if (startTime && endTime) {
    url.searchParams.set('start_time', formatIndiaMartTimestamp(startTime))
    url.searchParams.set('end_time', formatIndiaMartTimestamp(endTime))
  }

  let payload
  try {
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    })
    payload = await response.json()
  } catch (error) {
    await prisma.indiaMartConfig.update({
      where: { id: 1 },
      data: {
        lastSyncAt: now,
        lastSyncStart: startTime,
        lastSyncEnd: endTime,
        lastSyncCode: 500,
        lastSyncMessage: 'Network or parsing error while calling IndiaMART Pull API',
      },
    })
    return { success: false, error: error?.message || 'Failed to call IndiaMART Pull API' }
  }

  const code = Number(payload?.CODE ?? 500)
  const message = asString(payload?.MESSAGE) || asString(payload?.STATUS) || 'Unknown response from IndiaMART'
  const records = Array.isArray(payload?.RESPONSE) ? payload.RESPONSE : []

  const nonFatalNoData = code === 204
  const isSuccess = code === 200 || nonFatalNoData

  if (!isSuccess) {
    await prisma.indiaMartConfig.update({
      where: { id: 1 },
      data: {
        lastSyncAt: now,
        lastSyncStart: startTime,
        lastSyncEnd: endTime,
        lastSyncCode: code,
        lastSyncMessage: message,
      },
    })
    return { success: false, error: message || `IndiaMART API returned code ${code}` }
  }

  let upserted = 0
  let imported = 0
  let alreadyImported = 0
  let skipped = 0

  for (const row of records) {
    const uniqueQueryId = asString(row?.UNIQUE_QUERY_ID)
    if (!uniqueQueryId) {
      skipped += 1
      continue
    }

    const queryTime = parseIndiaMartTime(row?.QUERY_TIME)
    const senderName = asString(row?.SENDER_NAME) || 'IndiaMART Buyer'
    const senderMobile = normalizePhone(row?.SENDER_MOBILE)
    const senderEmail = isValidEmail(row?.SENDER_EMAIL) ? asString(row.SENDER_EMAIL) : null
    const senderMobileAlt = normalizePhone(row?.SENDER_MOBILE_ALT)
    const senderEmailAlt = isValidEmail(row?.SENDER_EMAIL_ALT) ? asString(row.SENDER_EMAIL_ALT) : null

    const existing = await prisma.indiaMartLead.findUnique({
      where: { uniqueQueryId },
      select: { id: true, leadId: true },
    })

    const saved = await prisma.indiaMartLead.upsert({
      where: { uniqueQueryId },
      create: {
        uniqueQueryId,
        queryType: asString(row?.QUERY_TYPE) || null,
        queryTime,
        senderName,
        senderMobile: senderMobile || null,
        senderEmail,
        senderCompany: asString(row?.SENDER_COMPANY) || null,
        senderAddress: asString(row?.SENDER_ADDRESS) || null,
        senderCity: asString(row?.SENDER_CITY) || null,
        senderState: asString(row?.SENDER_STATE) || null,
        senderPincode: asString(row?.SENDER_PINCODE) || null,
        senderCountryIso: asString(row?.SENDER_COUNTRY_ISO) || null,
        senderMobileAlt: senderMobileAlt || null,
        senderEmailAlt,
        queryProductName: asString(row?.QUERY_PRODUCT_NAME) || null,
        queryMessage: asString(row?.QUERY_MESSAGE) || null,
        queryMcatName: asString(row?.QUERY_MCAT_NAME) || null,
        callDuration: asString(row?.CALL_DURATION) || null,
        receiverMobile: normalizePhone(extractReceiverMobile(row)) || null,
        rawPayload: row,
        syncedAt: now,
      },
      update: {
        queryType: asString(row?.QUERY_TYPE) || null,
        queryTime,
        senderName,
        senderMobile: senderMobile || null,
        senderEmail,
        senderCompany: asString(row?.SENDER_COMPANY) || null,
        senderAddress: asString(row?.SENDER_ADDRESS) || null,
        senderCity: asString(row?.SENDER_CITY) || null,
        senderState: asString(row?.SENDER_STATE) || null,
        senderPincode: asString(row?.SENDER_PINCODE) || null,
        senderCountryIso: asString(row?.SENDER_COUNTRY_ISO) || null,
        senderMobileAlt: senderMobileAlt || null,
        senderEmailAlt,
        queryProductName: asString(row?.QUERY_PRODUCT_NAME) || null,
        queryMessage: asString(row?.QUERY_MESSAGE) || null,
        queryMcatName: asString(row?.QUERY_MCAT_NAME) || null,
        callDuration: asString(row?.CALL_DURATION) || null,
        receiverMobile: normalizePhone(extractReceiverMobile(row)) || null,
        rawPayload: row,
        syncedAt: now,
      },
    })

    upserted += 1

    if (!config.autoImportToLeads) continue
    if (existing?.leadId) {
      alreadyImported += 1
      continue
    }

    const leadPhone = senderMobile || senderMobileAlt || `IM${uniqueQueryId}`
    const leadEmail = senderEmail || senderEmailAlt || null

    let contact = await prisma.contact.findFirst({
      where: {
        OR: [
          { phone: leadPhone },
          ...(leadEmail ? [{ email: leadEmail }] : []),
        ],
      },
    })

    if (!contact) {
      contact = await prisma.contact.create({
        data: {
          name: senderName,
          phone: leadPhone,
          email: leadEmail,
          address: asString(row?.SENDER_ADDRESS) || null,
          source: 'IndiaMART',
          notes: asString(row?.QUERY_MESSAGE) || null,
        },
      })
    } else {
      const updates = {}
      if (!contact.email && leadEmail) updates.email = leadEmail
      if (!contact.address && asString(row?.SENDER_ADDRESS)) updates.address = asString(row?.SENDER_ADDRESS)
      if (Object.keys(updates).length > 0) {
        contact = await prisma.contact.update({
          where: { id: contact.id },
          data: updates,
        })
      }
    }

    const lead = await prisma.lead.create({
      data: {
        contactId: contact.id,
        interest: asString(row?.QUERY_PRODUCT_NAME) || asString(row?.QUERY_MCAT_NAME) || 'IndiaMART Enquiry',
        budget: null,
        status: config.defaultLeadStatus,
        source: 'IndiaMART',
        date: queryTime || now,
        notes: buildLeadNotes(row),
      },
    })

    await prisma.indiaMartLead.update({
      where: { id: saved.id },
      data: { leadId: lead.id },
    })

    imported += 1
  }

  await prisma.indiaMartConfig.update({
    where: { id: 1 },
    data: {
      lastSyncAt: now,
      lastSyncStart: startTime,
      lastSyncEnd: endTime || now,
      lastSyncCode: code,
      lastSyncMessage: message || (nonFatalNoData ? 'No leads in selected range' : 'Success'),
    },
  })

  revalidatePath('/indiamart-leads')
  revalidatePath('/leads')

  return {
    success: true,
    data: {
      code,
      message: message || (nonFatalNoData ? 'No leads found for this sync window' : 'Sync completed'),
      fetched: records.length,
      saved: upserted,
      imported,
      alreadyImported,
      skipped,
      window: {
        startTime: startTime?.toISOString() || null,
        endTime: (endTime || now).toISOString(),
      },
    },
  }
}
