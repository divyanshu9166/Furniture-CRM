import { prisma } from '@/lib/db'
import type { DbResult, QueryFilter, QueryOrder, QueryRequest } from './compat-types'

interface QueryContext {
  userId?: string | null
  admin?: boolean
}

interface TableConfig {
  delegate: string
  scope?: (userId: string) => Record<string, unknown>
}

const TABLES: Record<string, TableConfig> = {
  profiles: { delegate: 'waProfile', scope: (userId) => ({ user_id: userId }) },
  contacts: { delegate: 'waContact', scope: (userId) => ({ user_id: userId }) },
  tags: { delegate: 'waTag', scope: (userId) => ({ user_id: userId }) },
  contact_tags: {
    delegate: 'waContactTag',
    scope: (userId) => ({ contact: { is: { user_id: userId } } }),
  },
  custom_fields: { delegate: 'waCustomField', scope: (userId) => ({ user_id: userId }) },
  contact_custom_values: {
    delegate: 'waContactCustomValue',
    scope: (userId) => ({ contact: { is: { user_id: userId } } }),
  },
  contact_notes: { delegate: 'waContactNote', scope: (userId) => ({ user_id: userId }) },
  conversations: { delegate: 'waConversation', scope: (userId) => ({ user_id: userId }) },
  messages: {
    delegate: 'waMessage',
    scope: (userId) => ({ conversation: { is: { user_id: userId } } }),
  },
  whatsapp_config: {
    delegate: 'waWhatsappConfig',
    scope: (userId) => ({ user_id: userId }),
  },
  message_templates: {
    delegate: 'waMessageTemplate',
    scope: (userId) => ({ user_id: userId }),
  },
  pipelines: { delegate: 'waPipeline', scope: (userId) => ({ user_id: userId }) },
  pipeline_stages: {
    delegate: 'waPipelineStage',
    scope: (userId) => ({ pipeline: { is: { user_id: userId } } }),
  },
  deals: { delegate: 'waDeal', scope: (userId) => ({ user_id: userId }) },
  broadcasts: { delegate: 'waBroadcast', scope: (userId) => ({ user_id: userId }) },
  broadcast_recipients: {
    delegate: 'waBroadcastRecipient',
    scope: (userId) => ({ broadcast: { is: { user_id: userId } } }),
  },
  automations: { delegate: 'waAutomation', scope: (userId) => ({ user_id: userId }) },
  automation_steps: {
    delegate: 'waAutomationStep',
    scope: (userId) => ({ automation: { is: { user_id: userId } } }),
  },
  automation_logs: { delegate: 'waAutomationLog', scope: (userId) => ({ user_id: userId }) },
  automation_pending_executions: {
    delegate: 'waAutomationPendingExecution',
    scope: (userId) => ({ user_id: userId }),
  },
  message_reactions: {
    delegate: 'waMessageReaction',
    scope: (userId) => ({ conversation: { is: { user_id: userId } } }),
  },
}

function dbError(message: string): DbResult['error'] {
  return { message }
}

function isDateField(field: string): boolean {
  return (
    field.endsWith('_at') ||
    field.endsWith('_date') ||
    field === 'date' ||
    field === 'run_at'
  )
}

function coerceValue(field: string, value: unknown): unknown {
  if (value === null || value === undefined) return value
  if (typeof value === 'string') {
    if (isDateField(field)) {
      const d = new Date(value)
      if (!Number.isNaN(d.getTime())) return d
    }
    if (
      [
        'unread_count',
        'position',
        'value',
        'total_recipients',
        'sent_count',
        'delivered_count',
        'read_count',
        'replied_count',
        'failed_count',
        'execution_count',
        'next_step_position',
      ].includes(field)
    ) {
      const n = Number(value)
      if (!Number.isNaN(n)) return n
    }
  }
  return value
}

function parseILike(pattern: string): Record<string, unknown> {
  const value = pattern ?? ''
  const starts = value.startsWith('%')
  const ends = value.endsWith('%')
  const inner = value.replace(/^%/, '').replace(/%$/, '')

  if (starts && ends) return { contains: inner, mode: 'insensitive' }
  if (starts) return { endsWith: inner, mode: 'insensitive' }
  if (ends) return { startsWith: inner, mode: 'insensitive' }
  return { equals: inner, mode: 'insensitive' }
}

function baseFieldClause(filter: QueryFilter): Record<string, unknown> | null {
  const field = filter.field
  const value = coerceValue(field, filter.value)
  switch (filter.op) {
    case 'eq':
      return { [field]: value }
    case 'neq':
      return { [field]: { not: value } }
    case 'in':
      return {
        [field]: {
          in: Array.isArray(filter.value)
            ? filter.value.map((v) => coerceValue(field, v))
            : [],
        },
      }
    case 'gte':
      return { [field]: { gte: value } }
    case 'lte':
      return { [field]: { lte: value } }
    case 'lt':
      return { [field]: { lt: value } }
    case 'gt':
      return { [field]: { gt: value } }
    case 'ilike':
      return typeof filter.value === 'string'
        ? { [field]: parseILike(filter.value) }
        : { [field]: null }
    case 'is':
      return { [field]: filter.value === 'null' ? null : value }
    default:
      return null
  }
}

function parseOrExpression(orExpr: string): Record<string, unknown> | null {
  const segments = orExpr.split(',').map((s) => s.trim()).filter(Boolean)
  if (!segments.length) return null

  const clauses: Record<string, unknown>[] = []
  for (const raw of segments) {
    const match = raw.match(/^([a-zA-Z0-9_]+)\.([a-z_]+)\.(.*)$/)
    if (!match) continue
    const [, field, op, value] = match
    const normalized: QueryFilter = {
      op: op as QueryFilter['op'],
      field,
      value,
    }
    const clause = baseFieldClause(normalized)
    if (clause) clauses.push(clause)
  }

  if (!clauses.length) return null
  return { OR: clauses }
}

function filterToClause(
  table: string,
  filter: QueryFilter,
): Record<string, unknown> | null {
  if (filter.op === 'or') {
    if (typeof filter.value !== 'string') return null
    return parseOrExpression(filter.value)
  }

  if (filter.op === 'not') {
    const base = baseFieldClause({
      op: (filter.compareOp as QueryFilter['op']) ?? 'eq',
      field: filter.field,
      value: filter.value,
    })
    if (!base) return null
    return { NOT: base }
  }

  if (filter.field === 'broadcasts.user_id' && table === 'broadcast_recipients') {
    if (filter.op === 'eq') {
      return { broadcast: { is: { user_id: String(filter.value ?? '') } } }
    }
    if (filter.op === 'neq') {
      return { NOT: { broadcast: { is: { user_id: String(filter.value ?? '') } } } }
    }
  }

  return baseFieldClause(filter)
}

function buildWhere(
  table: string,
  filters: QueryFilter[],
  ctx: QueryContext,
): Record<string, unknown> {
  const clauses: Record<string, unknown>[] = []
  const config = TABLES[table]

  if (!ctx.admin && ctx.userId && config.scope) {
    clauses.push(config.scope(ctx.userId))
  }

  for (const filter of filters) {
    const clause = filterToClause(table, filter)
    if (clause) clauses.push(clause)
  }

  if (!clauses.length) return {}
  if (clauses.length === 1) return clauses[0]
  return { AND: clauses }
}

function buildOrderBy(orders: QueryOrder[]): Record<string, unknown>[] | undefined {
  if (!orders.length) return undefined
  return orders.map((o) => ({ [o.column]: o.ascending === false ? 'desc' : 'asc' }))
}

function buildInclude(
  table: string,
  select: string | undefined,
): Record<string, unknown> | undefined {
  if (!select) return undefined

  if (table === 'conversations' && select.includes('contact:')) {
    return { contact: true }
  }

  if (table === 'messages' && select.includes('conversations(')) {
    return { conversation: { include: { contact: true } } }
  }

  if (table === 'deals') {
    const include: Record<string, unknown> = {}
    if (select.includes('stage:')) include.stage = true
    if (select.includes('contact:')) include.contact = true
    if (select.includes('assignee:')) include.assignee = true
    return Object.keys(include).length ? include : undefined
  }

  if (table === 'contact_tags' && (select.includes('tags(') || select.includes('tags:'))) {
    return { tag: true }
  }

  if (table === 'broadcast_recipients') {
    const include: Record<string, unknown> = {}
    if (select.includes('contact:')) include.contact = true
    if (select.includes('broadcasts')) include.broadcast = true
    return Object.keys(include).length ? include : undefined
  }

  if (table === 'automation_logs') {
    const include: Record<string, unknown> = {}
    if (select.includes('automation:')) include.automation = true
    if (select.includes('contact:')) include.contact = true
    return Object.keys(include).length ? include : undefined
  }

  return undefined
}

function serializeValue(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString()
  if (Array.isArray(value)) return value.map(serializeValue)
  if (value && typeof value === 'object') {
    if (typeof (value as { toNumber?: unknown }).toNumber === 'function') {
      return (value as { toNumber: () => number }).toNumber()
    }
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = serializeValue(v)
    }
    return out
  }
  return value
}

function shapeRow(table: string, select: string | undefined, row: Record<string, unknown>) {
  const shaped = { ...row }

  if (table === 'contact_tags' && 'tag' in shaped) {
    shaped.tags = shaped.tag
    delete shaped.tag
  }

  if (table === 'messages' && select?.includes('conversations(')) {
    const conversation = shaped.conversation as
      | (Record<string, unknown> & { contact?: unknown })
      | undefined
    shaped.conversations = conversation
      ? {
          contact_id: conversation.contact_id ?? null,
          contacts: conversation.contact ?? null,
        }
      : null
    delete shaped.conversation
  }

  if (table === 'broadcast_recipients' && 'broadcast' in shaped) {
    shaped.broadcasts = shaped.broadcast
    delete shaped.broadcast
  }

  return serializeValue(shaped)
}

function finalizeRows(
  rows: unknown[],
  single?: boolean,
  maybeSingle?: boolean,
): DbResult {
  if (single) {
    if (rows.length !== 1) {
      return { data: null, error: dbError('Expected exactly one row') }
    }
    return { data: rows[0] ?? null, error: null }
  }
  if (maybeSingle) {
    if (rows.length > 1) {
      return { data: null, error: dbError('Expected zero or one row') }
    }
    return { data: rows[0] ?? null, error: null }
  }
  return { data: rows, error: null }
}

function ensureUserIdOnInsert(
  table: string,
  row: Record<string, unknown>,
  ctx: QueryContext,
) {
  if (ctx.admin || !ctx.userId) return row
  if (
    ['profiles', 'contacts', 'tags', 'custom_fields', 'conversations', 'whatsapp_config', 'message_templates', 'pipelines', 'deals', 'broadcasts', 'automations', 'automation_logs', 'automation_pending_executions', 'contact_notes'].includes(
      table,
    ) &&
    row.user_id == null
  ) {
    return { ...row, user_id: ctx.userId }
  }
  return row
}

async function recomputeBroadcastCounts(broadcastIds: string[]) {
  const ids = [...new Set(broadcastIds.filter(Boolean))]
  for (const bid of ids) {
    const rows = await prisma.waBroadcastRecipient.findMany({
      where: { broadcast_id: bid },
      select: { status: true },
    })
    let sent = 0
    let delivered = 0
    let read = 0
    let replied = 0
    let failed = 0
    for (const r of rows) {
      if (['sent', 'delivered', 'read', 'replied'].includes(r.status)) sent += 1
      if (['delivered', 'read', 'replied'].includes(r.status)) delivered += 1
      if (['read', 'replied'].includes(r.status)) read += 1
      if (r.status === 'replied') replied += 1
      if (r.status === 'failed') failed += 1
    }
    await prisma.waBroadcast.update({
      where: { id: bid },
      data: {
        sent_count: sent,
        delivered_count: delivered,
        read_count: read,
        replied_count: replied,
        failed_count: failed,
      },
    })
  }
}

async function handleSelect(
  delegate: any,
  request: QueryRequest,
  table: string,
  where: Record<string, unknown>,
): Promise<DbResult> {
  const count =
    request.count === 'exact' ? await delegate.count({ where }) : null

  if (request.head) {
    return { data: null, error: null, count }
  }

  const orderBy = buildOrderBy(request.orders)
  const include = buildInclude(table, request.select)
  const args: Record<string, unknown> = { where }

  if (orderBy) args.orderBy = orderBy
  if (include) args.include = include

  if (typeof request.rangeFrom === 'number' && typeof request.rangeTo === 'number') {
    args.skip = request.rangeFrom
    args.take = Math.max(0, request.rangeTo - request.rangeFrom + 1)
  } else if (typeof request.limit === 'number') {
    args.take = request.limit
  }

  const rows = (await delegate.findMany(args)) as Record<string, unknown>[]
  const shaped = rows.map((row) => shapeRow(table, request.select, row))
  const out = finalizeRows(shaped, request.single, request.maybeSingle)
  out.count = count
  return out
}

async function handleInsert(
  delegate: any,
  request: QueryRequest,
  table: string,
  ctx: QueryContext,
): Promise<DbResult> {
  const rawRows = Array.isArray(request.payload)
    ? (request.payload as Record<string, unknown>[])
    : [request.payload as Record<string, unknown>]

  const rows = rawRows
    .filter((row) => row && typeof row === 'object')
    .map((row) => ensureUserIdOnInsert(table, row, ctx))

  if (!rows.length) return { data: null, error: dbError('Insert payload is empty') }

  const wantsRows = request.returning || request.single || request.maybeSingle
  let created: Record<string, unknown>[] = []

  if (wantsRows) {
    created = await prisma.$transaction(
      rows.map((row) => delegate.create({ data: row })),
    )
  } else {
    await delegate.createMany({ data: rows })
  }

  if (table === 'broadcast_recipients') {
    const ids = rows
      .map((r) => r.broadcast_id)
      .filter((v): v is string => typeof v === 'string')
    await recomputeBroadcastCounts(ids)
  }

  if (!wantsRows) return { data: null, error: null }

  const shaped = created.map((row) => shapeRow(table, request.select, row))
  return finalizeRows(shaped, request.single, request.maybeSingle)
}

async function handleUpdate(
  delegate: any,
  request: QueryRequest,
  table: string,
  where: Record<string, unknown>,
): Promise<DbResult> {
  const payload = (request.payload ?? {}) as Record<string, unknown>
  const wantsRows = request.returning || request.single || request.maybeSingle
  const before = wantsRows || table === 'broadcast_recipients'
    ? ((await delegate.findMany({ where })) as Record<string, unknown>[])
    : []

  if (!before.length && (request.single || request.maybeSingle)) {
    if (request.maybeSingle) return { data: null, error: null }
    return { data: null, error: dbError('Expected exactly one row') }
  }

  if (before.length > 1 && request.single) {
    return { data: null, error: dbError('Expected exactly one row') }
  }

  await delegate.updateMany({ where, data: payload })

  if (table === 'broadcast_recipients') {
    const ids = before
      .map((r) => r.broadcast_id)
      .filter((v): v is string => typeof v === 'string')
    await recomputeBroadcastCounts(ids)
  }

  if (!wantsRows) return { data: null, error: null }

  const ids = before.map((r) => r.id).filter((v): v is string => typeof v === 'string')
  if (!ids.length) return { data: null, error: null }
  const rows = (await delegate.findMany({ where: { id: { in: ids } } })) as Record<
    string,
    unknown
  >[]
  const shaped = rows.map((row) => shapeRow(table, request.select, row))
  return finalizeRows(shaped, request.single, request.maybeSingle)
}

async function handleDelete(
  delegate: any,
  request: QueryRequest,
  table: string,
  where: Record<string, unknown>,
): Promise<DbResult> {
  const wantsRows = request.returning || request.single || request.maybeSingle
  const before = wantsRows || table === 'broadcast_recipients'
    ? ((await delegate.findMany({ where })) as Record<string, unknown>[])
    : []

  await delegate.deleteMany({ where })

  if (table === 'broadcast_recipients') {
    const ids = before
      .map((r) => r.broadcast_id)
      .filter((v): v is string => typeof v === 'string')
    await recomputeBroadcastCounts(ids)
  }

  if (!wantsRows) return { data: null, error: null }

  const shaped = before.map((row) => shapeRow(table, request.select, row))
  return finalizeRows(shaped, request.single, request.maybeSingle)
}

async function handleUpsert(
  delegate: any,
  request: QueryRequest,
  table: string,
  ctx: QueryContext,
): Promise<DbResult> {
  const rawRows = Array.isArray(request.payload)
    ? (request.payload as Record<string, unknown>[])
    : [request.payload as Record<string, unknown>]
  const rows = rawRows
    .filter((row) => row && typeof row === 'object')
    .map((row) => ensureUserIdOnInsert(table, row, ctx))
  if (!rows.length) return { data: null, error: dbError('Upsert payload is empty') }

  const conflictCols = (request.onConflict || 'id')
    .split(',')
    .map((c) => c.trim())
    .filter(Boolean)

  const output: Record<string, unknown>[] = []
  for (const row of rows) {
    const conflictWhere: Record<string, unknown> = {}
    for (const col of conflictCols) {
      conflictWhere[col] = row[col]
    }
    const existing = await delegate.findFirst({ where: conflictWhere })
    if (existing) {
      const data = { ...row }
      delete data.id
      const updated = await delegate.update({
        where: { id: existing.id },
        data,
      })
      output.push(updated as Record<string, unknown>)
    } else {
      const created = await delegate.create({ data: row })
      output.push(created as Record<string, unknown>)
    }
  }

  if (table === 'broadcast_recipients') {
    const ids = output
      .map((r) => r.broadcast_id)
      .filter((v): v is string => typeof v === 'string')
    await recomputeBroadcastCounts(ids)
  }

  const wantsRows = request.returning || request.single || request.maybeSingle
  if (!wantsRows) return { data: null, error: null }

  const shaped = output.map((row) => shapeRow(table, request.select, row))
  return finalizeRows(shaped, request.single, request.maybeSingle)
}

export async function executeQuery(
  request: QueryRequest,
  ctx: QueryContext,
): Promise<DbResult> {
  const config = TABLES[request.table]
  if (!config) {
    return { data: null, error: dbError(`Unsupported table: ${request.table}`) }
  }
  if (!ctx.admin && !ctx.userId) {
    return { data: null, error: dbError('Unauthorized') }
  }

  const delegate = (prisma as any)[config.delegate]
  if (!delegate) {
    return { data: null, error: dbError(`Missing Prisma delegate: ${config.delegate}`) }
  }

  try {
    const where = buildWhere(request.table, request.filters, ctx)
    switch (request.action) {
      case 'select':
        return await handleSelect(delegate, request, request.table, where)
      case 'insert':
        return await handleInsert(delegate, request, request.table, ctx)
      case 'update':
        return await handleUpdate(delegate, request, request.table, where)
      case 'delete':
        return await handleDelete(delegate, request, request.table, where)
      case 'upsert':
        return await handleUpsert(delegate, request, request.table, ctx)
      default:
        return { data: null, error: dbError(`Unsupported action: ${request.action}`) }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown database error'
    return { data: null, error: dbError(message) }
  }
}

export async function executeRpc(
  fn: string,
  args: Record<string, unknown> | undefined,
  ctx: QueryContext,
): Promise<DbResult> {
  if (!ctx.admin && !ctx.userId) {
    return { data: null, error: dbError('Unauthorized') }
  }

  try {
    if (fn === 'increment_automation_execution_count') {
      const id = String(args?.p_automation_id ?? '')
      if (!id) return { data: null, error: dbError('p_automation_id is required') }

      if (!ctx.admin) {
        const own = await prisma.waAutomation.findFirst({
          where: { id, user_id: String(ctx.userId) },
          select: { id: true },
        })
        if (!own) return { data: null, error: dbError('Automation not found') }
      }

      await prisma.waAutomation.update({
        where: { id },
        data: {
          execution_count: { increment: 1 },
          last_executed_at: new Date(),
        },
      })
      return { data: null, error: null }
    }

    return { data: null, error: dbError(`Unsupported RPC function: ${fn}`) }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown RPC error'
    return { data: null, error: dbError(message) }
  }
}

