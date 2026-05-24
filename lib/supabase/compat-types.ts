export type QueryAction = 'select' | 'insert' | 'update' | 'upsert' | 'delete'

export type FilterOp =
  | 'eq'
  | 'neq'
  | 'in'
  | 'gte'
  | 'lte'
  | 'lt'
  | 'gt'
  | 'ilike'
  | 'is'
  | 'or'
  | 'not'

export interface QueryFilter {
  op: FilterOp
  field: string
  value?: unknown
  compareOp?: string
}

export interface QueryOrder {
  column: string
  ascending?: boolean
}

export interface QueryRequest {
  table: string
  action: QueryAction
  select?: string
  payload?: unknown
  onConflict?: string
  ignoreDuplicates?: boolean
  filters: QueryFilter[]
  orders: QueryOrder[]
  limit?: number
  rangeFrom?: number
  rangeTo?: number
  count?: 'exact'
  head?: boolean
  single?: boolean
  maybeSingle?: boolean
  returning?: boolean
}

export interface DbError {
  message: string
  details?: string
  hint?: string
  code?: string
}

export interface DbResult<T = any> {
  data: T | null
  error: DbError | null
  count?: number | null
}

export interface DbUser {
  id: string
  email?: string | null
  created_at?: string | null
  [key: string]: unknown
}

export interface DbSession {
  user: DbUser
}

export interface DbRealtimePayload<T = unknown> {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE'
  new: T
  old: Partial<T>
}

export type DbRealtimeCallback<T = unknown> = (
  payload: DbRealtimePayload<T>,
) => void

export interface DbRealtimeChannel {
  on(
    event: 'postgres_changes',
    config: Record<string, unknown>,
    callback: DbRealtimeCallback,
  ): DbRealtimeChannel
  subscribe(callback?: (status: string) => void): DbRealtimeChannel
}

export interface DbStorageUploadOptions {
  cacheControl?: string
  upsert?: boolean
  contentType?: string
}
