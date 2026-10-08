import { after, NextRequest, NextResponse } from 'next/server'
import { recordEmailEvent } from '@/lib/email-events'
import { verifyTrackingSignature } from '@/lib/email-tracking'

const PIXEL = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64')
const pixel = () => new NextResponse(PIXEL, { headers: { 'Content-Type': 'image/gif', 'Cache-Control': 'no-store' } })
const html = (body: string, status = 200) => new NextResponse('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Email preferences</title></head><body style="font-family:system-ui,sans-serif;max-width:540px;margin:64px auto;padding:24px;color:#1f2937"><h1>Email preferences</h1>' + body + '</body></html>', { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'" } })
function parseId(value: string | null) {
  if (!value || !/^[1-9]\d*$/.test(value)) return null
  const id = Number(value)
  return Number.isSafeInteger(id) && id <= 2147483647 ? id : null
}

export async function GET(req: NextRequest) {
  const params = new URL(req.url).searchParams
  const recipientId = parseId(params.get('rid'))
  const type = params.get('t')
  const signature = params.get('sig')
  if (!recipientId || !['open', 'click', 'unsubscribe'].includes(type || '')) return pixel()
  let target = ''
  if (type === 'click') {
    try {
      const url = new URL(params.get('url') || '')
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Invalid target')
      target = url.toString()
    } catch { return NextResponse.json({ error: 'Invalid tracking link' }, { status: 400 }) }
  }
  const eventType = type as 'open' | 'click' | 'unsubscribe'
  if (!verifyTrackingSignature(recipientId, eventType, signature, target)) return pixel()
  if (eventType === 'unsubscribe') {
    // Mail scanners/prefetchers follow GET links. Only explicit confirmation
    // changes subscription; the signature still binds this one recipient.
    return html('<p>Stop receiving marketing emails from this business?</p><form method="post" action="/api/email-track"><input type="hidden" name="rid" value="' + recipientId + '"><input type="hidden" name="sig" value="' + signature + '"><button type="submit" style="padding:14px 20px;cursor:pointer">Confirm unsubscribe</button></form>')
  }
  const metadata = { userAgent: (req.headers.get('user-agent') || '').slice(0, 1000), url: target }
  after(async () => { try { await recordEmailEvent(recipientId, eventType, metadata) } catch { console.error('[email-tracking] Unable to save event') } })
  return eventType === 'click' ? NextResponse.redirect(target) : pixel()
}

export async function POST(req: NextRequest) {
  if (!req.headers.get('content-type')?.startsWith('application/x-www-form-urlencoded')) return NextResponse.json({ error: 'Use the signed unsubscribe confirmation form.' }, { status: 405 })
  const body = new URLSearchParams(await req.text())
  const recipientId = parseId(body.get('rid'))
  if (!recipientId || !verifyTrackingSignature(recipientId, 'unsubscribe', body.get('sig'))) return html('<p>This unsubscribe link is invalid.</p>', 400)
  try {
    const result = await recordEmailEvent(recipientId, 'unsubscribe', { userAgent: (req.headers.get('user-agent') || '').slice(0, 1000) })
    return html('<p>' + (result.success ? 'You have been unsubscribed.' : 'This unsubscribe link is no longer valid.') + '</p>', result.success ? 200 : 404)
  } catch { return html('<p>Unable to update preferences. Please try again.</p>', 503) }
}
