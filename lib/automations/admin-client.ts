import {
  createCompatSupabaseClient,
  type CompatSupabaseClient,
} from '@/lib/supabase/compat-client'
import { executeQuery, executeRpc } from '@/lib/supabase/query-engine'

let _adminClient: CompatSupabaseClient | null = null

export function supabaseAdmin(): CompatSupabaseClient {
  if (_adminClient) return _adminClient

  _adminClient = createCompatSupabaseClient({
    executeQuery: (request) => executeQuery(request, { admin: true }),
    executeRpc: (fn, args) => executeRpc(fn, args, { admin: true }),
    auth: {
      async getSession() {
        return { data: { session: null }, error: null }
      },
      async getUser() {
        return { data: { user: null }, error: null }
      },
      async signOut() {
        return { error: null }
      },
      async signInWithPassword() {
        return {
          data: { session: null, user: null },
          error: { message: 'Not supported on admin client' },
        }
      },
      async updateUser() {
        return {
          data: { user: null },
          error: { message: 'Not supported on admin client' },
        }
      },
      onAuthStateChange() {
        return {
          data: {
            subscription: {
              unsubscribe() {},
            },
          },
        }
      },
    },
  })

  return _adminClient
}
