import bcrypt from 'bcryptjs'
import {
  createCompatSupabaseClient,
  type CompatSupabaseClient,
} from './compat-client'
import { executeQuery, executeRpc } from './query-engine'
import { createSession, deleteSession, getSession as getCookieSession } from '@/lib/session'
import { prisma } from '@/lib/db'

async function loadDbUser(session: Awaited<ReturnType<typeof getCookieSession>>) {
  if (!session?.id) return null
  const userId = Number(session.id)
  if (!Number.isFinite(userId)) return null
  return prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      staffId: true,
      createdAt: true,
      hashedPassword: true,
    },
  })
}

function sessionUserFrom(
  session: Awaited<ReturnType<typeof getCookieSession>>,
  dbUser: Awaited<ReturnType<typeof loadDbUser>>,
) {
  if (!session) return null
  return {
    id: String(session.id),
    email: dbUser?.email ?? session.email,
    name: dbUser?.name ?? session.name,
    role: dbUser?.role ?? session.role,
    staffId: dbUser?.staffId ?? session.staffId,
    created_at: dbUser?.createdAt?.toISOString?.() ?? null,
  }
}

export async function createClient(): Promise<CompatSupabaseClient> {
  const session = await getCookieSession()
  const dbUser = await loadDbUser(session)
  const sessionUser = sessionUserFrom(session, dbUser)

  const ctx = {
    userId: sessionUser?.id ?? null,
    admin: false,
  }

  return createCompatSupabaseClient({
    executeQuery: (request) => executeQuery(request, ctx),
    executeRpc: (fn, args) => executeRpc(fn, args, ctx),
    auth: {
      async getSession() {
        return {
          data: { session: sessionUser ? { user: sessionUser } : null },
          error: null,
        }
      },
      async getUser() {
        return {
          data: { user: sessionUser ?? null },
          error: null,
        }
      },
      async signOut() {
        await deleteSession()
        return { error: null }
      },
      async signInWithPassword(input) {
        const email = String(input.email ?? '').trim().toLowerCase()
        const password = String(input.password ?? '')
        const user = await prisma.user.findUnique({ where: { email } })
        if (!user) {
          return {
            data: { session: null, user: null },
            error: { message: 'Invalid credentials' },
          }
        }
        const ok = await bcrypt.compare(password, user.hashedPassword)
        if (!ok) {
          return {
            data: { session: null, user: null },
            error: { message: 'Invalid credentials' },
          }
        }
        await createSession({
          id: String(user.id),
          email: user.email,
          name: user.name,
          role: user.role,
          staffId: user.staffId,
        })
        const nextUser = {
          id: String(user.id),
          email: user.email,
          name: user.name,
          role: user.role,
          staffId: user.staffId,
          created_at: user.createdAt.toISOString(),
        }
        return {
          data: { session: { user: nextUser }, user: nextUser },
          error: null,
        }
      },
      async updateUser(input) {
        if (!sessionUser?.id) {
          return {
            data: { user: null },
            error: { message: 'Unauthorized' },
          }
        }
        const userId = Number(sessionUser.id)
        if (!Number.isFinite(userId)) {
          return {
            data: { user: null },
            error: { message: 'Invalid session' },
          }
        }

        const updates: { email?: string; hashedPassword?: string } = {}
        if (input.email) {
          updates.email = String(input.email).trim().toLowerCase()
        }
        if (input.password) {
          updates.hashedPassword = await bcrypt.hash(String(input.password), 12)
        }
        if (!Object.keys(updates).length) {
          return {
            data: { user: sessionUser },
            error: null,
          }
        }

        const updated = await prisma.user.update({
          where: { id: userId },
          data: updates,
        })

        await createSession({
          id: String(updated.id),
          email: updated.email,
          name: updated.name,
          role: updated.role,
          staffId: updated.staffId,
        })

        return {
          data: {
            user: {
              id: String(updated.id),
              email: updated.email,
              name: updated.name,
              role: updated.role,
              staffId: updated.staffId,
              created_at: updated.createdAt.toISOString(),
            },
          },
          error: null,
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
}
