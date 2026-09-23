import { createHmac, timingSafeEqual } from 'crypto'

export type EmailTrackingType = 'open' | 'click' | 'unsubscribe'

function getSigningSecret() {
  return process.env.EMAIL_TRACKING_SECRET || process.env.SESSION_SECRET || process.env.NEXTAUTH_SECRET
}

export function isEmailTrackingConfigured() {
  return !!getPublicAppUrl() && !!getSigningSecret()
}

export function getPublicAppUrl() {
  const value = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || process.env.APP_URL
  if (!value?.trim()) return null

  try {
    const url = new URL(value.trim())
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) return null
    if (process.env.NODE_ENV === 'production' && url.protocol !== 'https:') return null
    url.pathname = url.pathname.replace(/\/+$/, '')
    return url.toString().replace(/\/$/, '')
  } catch {
    return null
  }
}

function signaturePayload(recipientId: number, type: EmailTrackingType, target = '') {
  return `${recipientId}:${type}:${target}`
}

export function createTrackingSignature(recipientId: number, type: EmailTrackingType, target = '') {
  const secret = getSigningSecret()
  if (!secret) return null
  return createHmac('sha256', secret).update(signaturePayload(recipientId, type, target)).digest('base64url')
}

export function verifyTrackingSignature(recipientId: number, type: EmailTrackingType, signature: string | null, target = '') {
  if (!signature) return false
  const expected = createTrackingSignature(recipientId, type, target)
  if (!expected || expected.length !== signature.length) return false
  return timingSafeEqual(Buffer.from(expected), Buffer.from(signature))
}

export function trackingUrl(recipientId: number, type: EmailTrackingType, target = '') {
  const appUrl = getPublicAppUrl()
  const signature = createTrackingSignature(recipientId, type, target)
  if (!appUrl || !signature) return null

  const params = new URLSearchParams({ rid: String(recipientId), t: type, sig: signature })
  if (target) params.set('url', target)
  return `${appUrl}/api/email-track?${params.toString()}`
}

export function addTrackingToEmail(html: string, recipientId: number) {
  const openPixel = trackingUrl(recipientId, 'open')
  const unsubscribeUrl = trackingUrl(recipientId, 'unsubscribe')

  // Track only absolute web links. mailto:, phone, anchors, and malformed links are left untouched.
  const withTrackedLinks = html.replace(/<a\b([^>]*?)\bhref=(['"])(.*?)\2([^>]*)>/gi, (match, before, quote, href, after) => {
    try {
      const parsed = new URL(href)
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return match
      const trackedUrl = trackingUrl(recipientId, 'click', parsed.toString())
      return trackedUrl ? `<a${before}href=${quote}${trackedUrl}${quote}${after}>` : match
    } catch {
      return match
    }
  })

  const unsubscribe = unsubscribeUrl
    ? `<div style="text-align:center;margin-top:30px;padding-top:20px;border-top:1px solid #eee;font-size:11px;color:#777;"><a href="${unsubscribeUrl}" style="color:#777;">Unsubscribe</a></div>`
    : ''
  const pixel = openPixel ? `<img src="${openPixel}" width="1" height="1" style="display:none;" alt="" />` : ''

  return `${withTrackedLinks}${unsubscribe}${pixel}`
}
