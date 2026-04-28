import { cookies } from 'next/headers'
import { createHmac, timingSafeEqual } from 'crypto'

const SESSION_SECRET = process.env.SESSION_SECRET || 'default-secret-at-least-32-chars-long'
const COOKIE_NAME = 'session'

export interface SessionPayload {
  id: string
  email: string
  name: string
  role: string
  staffId: number | null
  expiresAt: Date
}

function sign(payload: string, secret: string) {
  return createHmac('sha256', secret).update(payload).digest('base64url')
}

export async function encrypt(payload: SessionPayload) {
  const data = JSON.stringify(payload)
  const signature = sign(data, SESSION_SECRET)
  return `${data}.${signature}`
}

export async function decrypt(session: string | undefined): Promise<SessionPayload | null> {
  if (!session) return null

  const [data, signature] = session.split('.')
  if (!data || !signature) return null

  const expectedSignature = sign(data, SESSION_SECRET)
  const signatureBuffer = Buffer.from(signature, 'base64url')
  const expectedSignatureBuffer = Buffer.from(expectedSignature, 'base64url')

  if (
    signatureBuffer.length !== expectedSignatureBuffer.length ||
    !timingSafeEqual(signatureBuffer, expectedSignatureBuffer)
  ) {
    return null
  }

  try {
    const payload = JSON.parse(data) as SessionPayload
    if (new Date(payload.expiresAt) < new Date()) {
      return null
    }
    return payload
  } catch (e) {
    return null
  }
}

export async function createSession(user: Omit<SessionPayload, 'expiresAt'>) {
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
  const session = await encrypt({ ...user, expiresAt })
  const cookieStore = await cookies()

  cookieStore.set(COOKIE_NAME, session, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    expires: expiresAt,
    sameSite: 'lax',
    path: '/',
  })
}

export async function getSession() {
  const cookieStore = await cookies()
  const session = cookieStore.get(COOKIE_NAME)?.value
  return await decrypt(session)
}

export async function deleteSession() {
  const cookieStore = await cookies()
  cookieStore.delete(COOKIE_NAME)
}
