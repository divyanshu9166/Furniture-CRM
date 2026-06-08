/**
 * lib/social/messenger-api.ts
 *
 * Thin wrapper around the Meta Messenger Platform API v21.0.
 * Used for BOTH Facebook Page messages and Instagram DMs — they share the
 * same /me/messages endpoint; the difference is the Page Access Token.
 *
 * References:
 *  - https://developers.facebook.com/docs/messenger-platform/send-messages
 *  - https://developers.facebook.com/docs/messenger-platform/instagram/features/send-message
 */

const GRAPH_API_BASE = 'https://graph.facebook.com/v21.0'

export type SocialPlatform = 'facebook' | 'instagram'

// ── Types ──────────────────────────────────────────────────────────────────

export interface MessengerSendResult {
  messageId: string // mid
  recipientId: string
}

interface GraphErrorResponse {
  error?: {
    message?: string
    type?: string
    code?: number
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

async function throwGraphError(res: Response, context: string): Promise<never> {
  let body: GraphErrorResponse = {}
  try {
    body = await res.json()
  } catch { /* ignore */ }

  const message = body.error?.message ?? `HTTP ${res.status}`
  throw new Error(`[messenger-api] ${context}: ${message}`)
}

async function graphPost(
  endpoint: string,
  accessToken: string,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const url = `${GRAPH_API_BASE}${endpoint}?access_token=${encodeURIComponent(accessToken)}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    await throwGraphError(res, endpoint)
  }
  return res.json()
}

// ── Sending Functions ───────────────────────────────────────────────────────

/**
 * Send a plain text message to a Facebook or Instagram user.
 *
 * @param recipientId  PSID (Facebook) or IGSID (Instagram)
 * @param pageAccessToken  Permanent Page Access Token
 * @param text  Message text (max 2000 chars for IG, 640 for FB quick replies)
 */
export async function sendTextMessage(opts: {
  recipientId: string
  pageAccessToken: string
  text: string
}): Promise<MessengerSendResult> {
  const { recipientId, pageAccessToken, text } = opts

  const data = await graphPost('/me/messages', pageAccessToken, {
    recipient: { id: recipientId },
    message: { text },
    messaging_type: 'RESPONSE',
  })

  return {
    messageId: data.message_id as string,
    recipientId: data.recipient_id as string,
  }
}

/**
 * Show typing bubble to the recipient (fire-and-forget, failures ignored).
 */
export async function setTypingOn(opts: {
  recipientId: string
  pageAccessToken: string
}): Promise<void> {
  const { recipientId, pageAccessToken } = opts
  try {
    await graphPost('/me/messages', pageAccessToken, {
      recipient: { id: recipientId },
      sender_action: 'typing_on',
    })
  } catch (err) {
    console.warn('[messenger-api] typing_on failed (non-critical):', err)
  }
}

/**
 * Mark the conversation as seen (fire-and-forget).
 */
export async function markSeen(opts: {
  recipientId: string
  pageAccessToken: string
}): Promise<void> {
  const { recipientId, pageAccessToken } = opts
  try {
    await graphPost('/me/messages', pageAccessToken, {
      recipient: { id: recipientId },
      sender_action: 'mark_seen',
    })
  } catch (err) {
    console.warn('[messenger-api] mark_seen failed (non-critical):', err)
  }
}

/**
 * Fetch a user's public profile (name + profile pic).
 * Works for both Facebook (PSID) and Instagram (IGSID).
 * Returns null on failure — profile fetch is non-critical.
 */
export async function getUserProfile(opts: {
  userId: string
  pageAccessToken: string
  platform: SocialPlatform
}): Promise<{ name: string; profile_pic?: string } | null> {
  const { userId, pageAccessToken, platform } = opts

  // Instagram profile fields are limited vs Facebook
  const fields = platform === 'instagram'
    ? 'name,profile_pic'
    : 'name,profile_pic'

  try {
    const url = `${GRAPH_API_BASE}/${userId}?fields=${fields}&access_token=${encodeURIComponent(pageAccessToken)}`
    const res = await fetch(url)
    if (!res.ok) return null
    const data = await res.json() as { name?: string; profile_pic?: string }
    return {
      name: data.name ?? userId,
      profile_pic: data.profile_pic,
    }
  } catch {
    return null
  }
}
