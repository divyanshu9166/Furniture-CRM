import {
  createCompatSupabaseClient,
  type CompatSupabaseClient,
} from './compat-client'
import type { DbSession } from './compat-types'

type AuthListener = (event: string, session: DbSession | null) => void

const authListeners = new Set<AuthListener>()

async function fetchJson<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const res = await fetch(input, init)
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    const message =
      (body && typeof body === 'object' && 'error' in body
        ? String((body as { error?: unknown }).error)
        : `HTTP ${res.status}`) || 'Request failed'
    throw new Error(message)
  }
  return body as T
}

async function getCurrentSession(): Promise<DbSession | null> {
  const me = await fetchJson<{ user?: Record<string, unknown> | null } | null>(
    '/api/auth/me',
    { cache: 'no-store' },
  )
  if (!me?.user) return null
  return { user: me.user as DbSession['user'] }
}

function emitAuth(event: string, session: DbSession | null) {
  for (const listener of authListeners) {
    try {
      listener(event, session)
    } catch {
      // Swallow listener errors to keep auth propagation resilient.
    }
  }
}

let browserClient: CompatSupabaseClient | undefined

export function createClient(): CompatSupabaseClient {
  if (browserClient) return browserClient

  browserClient = createCompatSupabaseClient({
    executeQuery: async (request) => {
      try {
        return await fetchJson('/api/supabase/query', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(request),
        })
      } catch (err) {
        return {
          data: null,
          error: { message: err instanceof Error ? err.message : 'Query failed' },
        }
      }
    },
    executeRpc: async (fn, args) => {
      try {
        return await fetchJson('/api/supabase/rpc', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fn, args }),
        })
      } catch (err) {
        return {
          data: null,
          error: { message: err instanceof Error ? err.message : 'RPC failed' },
        }
      }
    },
    auth: {
      async getSession() {
        try {
          const session = await getCurrentSession()
          return { data: { session }, error: null }
        } catch (err) {
          return {
            data: { session: null },
            error: { message: err instanceof Error ? err.message : 'Failed to read session' },
          }
        }
      },
      async getUser() {
        try {
          const session = await getCurrentSession()
          return { data: { user: session?.user ?? null }, error: null }
        } catch (err) {
          return {
            data: { user: null },
            error: { message: err instanceof Error ? err.message : 'Failed to read user' },
          }
        }
      },
      async signOut() {
        try {
          await fetchJson('/api/auth/logout', { method: 'POST' })
          emitAuth('SIGNED_OUT', null)
          return { error: null }
        } catch (err) {
          return {
            error: {
              message: err instanceof Error ? err.message : 'Sign out failed',
            },
          }
        }
      },
      async signInWithPassword(input) {
        try {
          const payload = await fetchJson<{ user?: Record<string, unknown> | null }>(
            '/api/auth/verify-password',
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(input),
            },
          )
          const user = (payload?.user ?? null) as DbSession['user'] | null
          const session = user ? { user } : null
          emitAuth('SIGNED_IN', session)
          return { data: { session, user }, error: null }
        } catch (err) {
          return {
            data: { session: null, user: null },
            error: {
              message: err instanceof Error ? err.message : 'Invalid credentials',
            },
          }
        }
      },
      async updateUser(input) {
        try {
          const payload = await fetchJson<{ user?: Record<string, unknown> | null }>(
            '/api/auth/update-user',
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(input),
            },
          )
          const user = (payload?.user ?? null) as DbSession['user'] | null
          const session = user ? { user } : null
          emitAuth('USER_UPDATED', session)
          return { data: { user }, error: null }
        } catch (err) {
          return {
            data: { user: null },
            error: {
              message: err instanceof Error ? err.message : 'Failed to update user',
            },
          }
        }
      },
      onAuthStateChange(callback) {
        authListeners.add(callback)
        void getCurrentSession()
          .then((session) => callback('INITIAL_SESSION', session))
          .catch(() => callback('INITIAL_SESSION', null))
        return {
          data: {
            subscription: {
              unsubscribe: () => {
                authListeners.delete(callback)
              },
            },
          },
        }
      },
    },
    storage: {
      async upload(bucket, path, file, options) {
        try {
          const form = new FormData()
          form.set('bucket', bucket)
          form.set('path', path)
          form.set('file', file)
          if (options?.upsert !== undefined) {
            form.set('upsert', options.upsert ? '1' : '0')
          }
          if (options?.contentType) {
            form.set('contentType', options.contentType)
          }
          await fetchJson('/api/supabase/storage/upload', {
            method: 'POST',
            body: form,
          })
          return { data: { path }, error: null }
        } catch (err) {
          return {
            data: null,
            error: {
              message: err instanceof Error ? err.message : 'Upload failed',
            },
          }
        }
      },
      getPublicUrl(bucket, path) {
        return { data: { publicUrl: `/uploads/${bucket}/${path}` } }
      },
    },
  })

  return browserClient
}
