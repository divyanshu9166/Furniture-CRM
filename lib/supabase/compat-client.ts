import type {
  DbError,
  DbRealtimeChannel,
  DbResult,
  DbSession,
  DbStorageUploadOptions,
  DbUser,
  QueryFilter,
  QueryOrder,
  QueryRequest,
} from './compat-types'

type ExecuteQuery = (request: QueryRequest) => Promise<DbResult>

type ExecuteRpc = (
  fn: string,
  args?: Record<string, unknown>,
) => Promise<DbResult>

type SignInInput = { email: string; password: string }
type UpdateUserInput = { email?: string; password?: string }

export interface CompatAuthAdapter {
  getSession: () => Promise<{ data: { session: DbSession | null }; error: DbError | null }>
  getUser: () => Promise<{ data: { user: DbUser | null }; error: DbError | null }>
  signOut: (_opts?: Record<string, unknown>) => Promise<{ error: DbError | null }>
  signInWithPassword: (
    input: SignInInput,
  ) => Promise<{
    data: { session: DbSession | null; user: DbUser | null }
    error: DbError | null
  }>
  updateUser: (input: UpdateUserInput) => Promise<{
    data: { user: DbUser | null }
    error: DbError | null
  }>
  onAuthStateChange: (
    callback: (event: string, session: DbSession | null) => void,
  ) => { data: { subscription: { unsubscribe: () => void } } }
}

export interface CompatStorageAdapter {
  upload: (
    bucket: string,
    path: string,
    file: Blob | File,
    options?: DbStorageUploadOptions,
  ) => Promise<DbResult<{ path: string }>>
  getPublicUrl: (bucket: string, path: string) => { data: { publicUrl: string } }
}

export interface CompatRealtimeAdapter {
  createChannel: (name: string) => DbRealtimeChannel
  removeChannel: (channel: DbRealtimeChannel) => void
}

interface BuilderState {
  table: string
  action: QueryRequest['action']
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

class CompatQueryBuilder implements PromiseLike<DbResult> {
  private readonly executeQuery: ExecuteQuery
  private readonly state: BuilderState
  private pending: Promise<DbResult> | null = null

  constructor(executeQuery: ExecuteQuery, table: string) {
    this.executeQuery = executeQuery
    this.state = {
      table,
      action: 'select',
      select: '*',
      filters: [],
      orders: [],
    }
  }

  select(columns = '*', options?: { count?: 'exact'; head?: boolean }) {
    this.state.select = columns
    this.state.count = options?.count
    this.state.head = options?.head
    if (this.state.action !== 'select') {
      this.state.returning = true
    }
    return this
  }

  insert(payload: unknown) {
    this.state.action = 'insert'
    this.state.payload = payload
    return this
  }

  update(payload: unknown) {
    this.state.action = 'update'
    this.state.payload = payload
    return this
  }

  upsert(
    payload: unknown,
    options?: { onConflict?: string; ignoreDuplicates?: boolean },
  ) {
    this.state.action = 'upsert'
    this.state.payload = payload
    this.state.onConflict = options?.onConflict
    this.state.ignoreDuplicates = options?.ignoreDuplicates
    return this
  }

  delete() {
    this.state.action = 'delete'
    return this
  }

  eq(field: string, value: unknown) {
    this.state.filters.push({ op: 'eq', field, value })
    return this
  }

  neq(field: string, value: unknown) {
    this.state.filters.push({ op: 'neq', field, value })
    return this
  }

  in(field: string, value: unknown[]) {
    this.state.filters.push({ op: 'in', field, value })
    return this
  }

  gte(field: string, value: unknown) {
    this.state.filters.push({ op: 'gte', field, value })
    return this
  }

  lte(field: string, value: unknown) {
    this.state.filters.push({ op: 'lte', field, value })
    return this
  }

  lt(field: string, value: unknown) {
    this.state.filters.push({ op: 'lt', field, value })
    return this
  }

  gt(field: string, value: unknown) {
    this.state.filters.push({ op: 'gt', field, value })
    return this
  }

  ilike(field: string, value: string) {
    this.state.filters.push({ op: 'ilike', field, value })
    return this
  }

  is(field: string, value: unknown) {
    this.state.filters.push({ op: 'is', field, value })
    return this
  }

  or(value: string) {
    this.state.filters.push({ op: 'or', field: '__or__', value })
    return this
  }

  not(field: string, compareOp: string, value: unknown) {
    this.state.filters.push({ op: 'not', field, compareOp, value })
    return this
  }

  order(column: string, opts?: { ascending?: boolean }) {
    this.state.orders.push({ column, ascending: opts?.ascending ?? true })
    return this
  }

  limit(limit: number) {
    this.state.limit = limit
    return this
  }

  range(from: number, to: number) {
    this.state.rangeFrom = from
    this.state.rangeTo = to
    return this
  }

  single() {
    this.state.single = true
    return this
  }

  maybeSingle() {
    this.state.maybeSingle = true
    return this
  }

  private execute(): Promise<DbResult> {
    if (!this.pending) {
      const request: QueryRequest = {
        table: this.state.table,
        action: this.state.action,
        select: this.state.select,
        payload: this.state.payload,
        onConflict: this.state.onConflict,
        ignoreDuplicates: this.state.ignoreDuplicates,
        filters: this.state.filters,
        orders: this.state.orders,
        limit: this.state.limit,
        rangeFrom: this.state.rangeFrom,
        rangeTo: this.state.rangeTo,
        count: this.state.count,
        head: this.state.head,
        single: this.state.single,
        maybeSingle: this.state.maybeSingle,
        returning: this.state.returning,
      }
      this.pending = this.executeQuery(request)
    }
    return this.pending
  }

  then<TResult1 = DbResult, TResult2 = never>(
    onfulfilled?:
      | ((value: DbResult) => TResult1 | PromiseLike<TResult1>)
      | null
      | undefined,
    onrejected?:
      | ((reason: unknown) => TResult2 | PromiseLike<TResult2>)
      | null
      | undefined,
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected)
  }

  catch<TResult = never>(
    onrejected?:
      | ((reason: unknown) => TResult | PromiseLike<TResult>)
      | null
      | undefined,
  ): Promise<DbResult | TResult> {
    return this.execute().catch(onrejected)
  }

  finally(onfinally?: (() => void) | null | undefined): Promise<DbResult> {
    return this.execute().finally(onfinally)
  }
}

export interface CompatClientOptions {
  executeQuery: ExecuteQuery
  executeRpc?: ExecuteRpc
  auth: CompatAuthAdapter
  storage?: CompatStorageAdapter
  realtime?: CompatRealtimeAdapter
}

export function createCompatSupabaseClient(options: CompatClientOptions) {
  const storageAdapter: CompatStorageAdapter = options.storage ?? {
    async upload() {
      return {
        data: null,
        error: { message: 'Storage adapter is not configured' },
      }
    },
    getPublicUrl() {
      return { data: { publicUrl: '' } }
    },
  }

  const realtimeAdapter: CompatRealtimeAdapter = options.realtime ?? {
    createChannel() {
      return {
        on() {
          return this
        },
        subscribe(callback?: (status: string) => void) {
          callback?.('SUBSCRIBED')
          return this
        },
      }
    },
    removeChannel() {},
  }

  return {
    from(table: string) {
      return new CompatQueryBuilder(options.executeQuery, table)
    },

    rpc(fn: string, args?: Record<string, unknown>) {
      if (!options.executeRpc) {
        return Promise.resolve({
          data: null,
          error: { message: `RPC is not implemented: ${fn}` },
        } satisfies DbResult)
      }
      return options.executeRpc(fn, args)
    },

    auth: options.auth,

    storage: {
      from(bucket: string) {
        return {
          upload: (
            path: string,
            file: Blob | File,
            uploadOptions?: DbStorageUploadOptions,
          ) => storageAdapter.upload(bucket, path, file, uploadOptions),
          getPublicUrl: (path: string) => storageAdapter.getPublicUrl(bucket, path),
        }
      },
    },

    channel(name: string) {
      return realtimeAdapter.createChannel(name)
    },

    removeChannel(channel: DbRealtimeChannel) {
      realtimeAdapter.removeChannel(channel)
    },
  }
}

export type CompatSupabaseClient = ReturnType<typeof createCompatSupabaseClient>
