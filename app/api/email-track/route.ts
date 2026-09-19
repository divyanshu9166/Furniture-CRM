import { NextRequest, NextResponse } from 'next/server'
import { recordEmailEvent } from '@/app/actions/email-campaigns'
import { verifyTrackingSignature } from '@/lib/email-tracking'

// 1x1 transparent GIF pixel
const PIXEL = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64')

// Signed URLs are issued per recipient by lib/email.ts. Never record or redirect
// based on an unsigned query string: that would enable open redirects and allow
// one recipient to unsubscribe another.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const recipientId = parseInt(searchParams.get('rid') || '0')
  const type = searchParams.get('t') as 'open' | 'click' | 'unsubscribe' | null
  const redirectUrl = searchParams.get('url')
  const signature = searchParams.get('sig')

  if (!recipientId || !type || !['open', 'click', 'unsubscribe'].includes(type)) {
    return new NextResponse(PIXEL, { headers: { 'Content-Type': 'image/gif', 'Cache-Control': 'no-store' } })
  }

  let target = ''
  if (type === 'click') {
    try {
      const parsed = new URL(redirectUrl || '')
      if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Unsupported protocol')
      target = parsed.toString()
    } catch {
      return NextResponse.json({ error: 'Invalid tracking link' }, { status: 400 })
    }
  }

  if (!verifyTrackingSignature(recipientId, type, signature, target)) {
    return new NextResponse(PIXEL, { headers: { 'Content-Type': 'image/gif', 'Cache-Control': 'no-store' } })
  }

  const metadata: Record<string, unknown> = {}
  const ua = req.headers.get('user-agent')
  if (ua) metadata.userAgent = ua

  if (type === 'unsubscribe') {
    const result = await recordEmailEvent(recipientId, 'unsubscribe', metadata)
    const message = result.success ? 'You have been unsubscribed.' : 'This unsubscribe link is no longer valid.'
    return new NextResponse(`<!doctype html><html><head><title>Email preferences</title></head><body style="font-family:system-ui,sans-serif;max-width:540px;margin:64px auto;padding:24px;color:#1f2937"><h1>Email preferences</h1><p>${message}</p></body></html>`, {
      status: result.success ? 200 : 404,
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
    })
  }

  // Tracking should never make the destination wait on a database write.
  recordEmailEvent(recipientId, type, { ...metadata, url: target }).catch(() => {})

  if (type === 'click') {
    return NextResponse.redirect(target)
  }

  // Return tracking pixel for opens
  return new NextResponse(PIXEL, {
    headers: {
      'Content-Type': 'image/gif',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    },
  })
}

// Legacy endpoint: refuse raw recipient IDs. New emails use signed GET links.
export async function POST(req: NextRequest) {
  return NextResponse.json({ error: 'Use the unsubscribe link included in the email.' }, { status: 405 })
}
