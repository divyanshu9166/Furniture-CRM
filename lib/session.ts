import { cookies } from 'next/headers'

const SESSION_SECRET = process.env.SESSION_SECRET || 'default-secret-at-least-32-chars-long'
const COOKIE_NAME = 'session'
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
}

export interface SessionPayload {
  id: string
  email: string
  name: string
  role: string
  staffId: number | null
  expiresAt: Date
}

// Edge-compatible base64url encode/decode
function b64urlEncode(str: string) {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(str).toString('base64url');
  }
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function b64urlDecode(str: string) {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(str, 'base64url').toString('utf8');
  }
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/');
  return atob(b64);
}

// Edge-compatible HMAC signing using Web Crypto API
async function sign(payload: string, secret: string) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(payload)
  );

  // Convert ArrayBuffer to base64url
  const uint8View = new Uint8Array(signature);
  const base64 = typeof Buffer !== 'undefined' 
    ? Buffer.from(uint8View).toString('base64url')
    : btoa(String.fromCharCode(...uint8View)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
    
  return base64;
}

export async function encrypt(payload: SessionPayload) {
  const data = b64urlEncode(JSON.stringify(payload))
  const signature = await sign(data, SESSION_SECRET)
  return `${data}.${signature}`
}

// Edge compatible constant-time comparison
function timingSafeEqualEdge(a: string, b: string) {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

export async function decrypt(session: string | undefined): Promise<SessionPayload | null> {
  if (!session) return null

  const [data, signature] = session.split('.')
  if (!data || !signature) return null

  const expectedSignature = await sign(data, SESSION_SECRET)

  if (!timingSafeEqualEdge(signature, expectedSignature)) {
    return null
  }

  try {
    const payload = JSON.parse(b64urlDecode(data)) as SessionPayload
    if (new Date(payload.expiresAt) < new Date()) {
      return null
    }
    return payload
  } catch (e) {
    return null
  }
}

export async function createSession(user: Omit<SessionPayload, 'expiresAt'>) {
  const { value: session, expiresAt } = await buildSessionCookie(user)
  const cookieStore = await cookies()

  cookieStore.set(COOKIE_NAME, session, {
    ...COOKIE_OPTIONS,
    expires: expiresAt,
  })
}

export async function buildSessionCookie(user: Omit<SessionPayload, 'expiresAt'>) {
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
  const value = await encrypt({ ...user, expiresAt })
  return { value, expiresAt }
}

export async function setSessionCookie(
  response: { cookies: { set: (name: string, value: string, options: Record<string, unknown>) => void } },
  user: Omit<SessionPayload, 'expiresAt'>,
) {
  const { value, expiresAt } = await buildSessionCookie(user)
  response.cookies.set(COOKIE_NAME, value, {
    ...COOKIE_OPTIONS,
    expires: expiresAt,
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

export function clearSessionCookie(
  response: { cookies: { delete: (name: string) => void } },
) {
  response.cookies.delete(COOKIE_NAME)
}
