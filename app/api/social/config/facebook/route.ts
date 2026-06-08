/**
 * app/api/social/config/facebook/route.ts
 * GET / POST / DELETE — Facebook Page messaging configuration
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/db'
import { decrypt, encrypt } from '@/lib/whatsapp/encryption'

async function getCurrentUserId(): Promise<string | null> {
  const session = await getSession()
  return session?.id ? String(session.id) : null
}

// ── GET — load current config ───────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const userId = await getCurrentUserId()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const config = await prisma.fbConfig.findUnique({ where: { user_id: userId } })

  if (!config) {
    return NextResponse.json({ connected: false, config: null })
  }

  // Verify connectivity by calling Graph API
  let connected = false
  let pageName = config.page_name
  let reason = ''

  try {
    const token = decrypt(config.page_access_token)
    const res = await fetch(
      `https://graph.facebook.com/v21.0/me?fields=name,id&access_token=${encodeURIComponent(token)}`,
    )
    const data = await res.json()
    if (res.ok && data.id) {
      connected = true
      pageName = data.name ?? config.page_name
      // Update page name if it changed
      if (pageName && pageName !== config.page_name) {
        await prisma.fbConfig.update({
          where: { user_id: userId },
          data: { page_name: pageName, status: 'connected', connected_at: new Date() },
        })
      }
    } else {
      reason = data.error?.message ?? 'API connection failed'
    }
  } catch (err) {
    reason = 'Network error'
  }

  return NextResponse.json({
    connected,
    reason,
    config: {
      id: config.id,
      page_id: config.page_id,
      page_name: pageName,
      status: connected ? 'connected' : 'disconnected',
      has_access_token: true,
      has_app_secret: !!config.app_secret,
      verify_token: config.verify_token,
      connected_at: config.connected_at,
    },
  })
}

// ── POST — save / update config ─────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const userId = await getCurrentUserId()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { page_id, page_access_token, app_secret, verify_token } = body

  if (!page_id?.trim()) {
    return NextResponse.json({ error: 'Page ID is required' }, { status: 400 })
  }
  if (!page_access_token?.trim()) {
    return NextResponse.json({ error: 'Page Access Token is required' }, { status: 400 })
  }

  // Verify the token works before saving
  let pageName: string | null = null
  try {
    const res = await fetch(
      `https://graph.facebook.com/v21.0/me?fields=name,id&access_token=${encodeURIComponent(page_access_token.trim())}`,
    )
    const data = await res.json()
    if (!res.ok || !data.id) {
      return NextResponse.json(
        { error: data.error?.message ?? 'Invalid Page Access Token — please check and try again' },
        { status: 400 },
      )
    }
    pageName = data.name ?? null
  } catch {
    return NextResponse.json({ error: 'Could not reach Meta API to verify token' }, { status: 502 })
  }

  const encryptedToken = encrypt(page_access_token.trim())
  const encryptedSecret = app_secret?.trim() ? encrypt(app_secret.trim()) : null

  await prisma.fbConfig.upsert({
    where: { user_id: userId },
    create: {
      user_id: userId,
      page_id: page_id.trim(),
      page_name: pageName,
      page_access_token: encryptedToken,
      app_secret: encryptedSecret,
      verify_token: verify_token?.trim() || null,
      status: 'connected',
      connected_at: new Date(),
    },
    update: {
      page_id: page_id.trim(),
      page_name: pageName,
      page_access_token: encryptedToken,
      app_secret: encryptedSecret ?? undefined,
      verify_token: verify_token?.trim() || null,
      status: 'connected',
      connected_at: new Date(),
    },
  })

  return NextResponse.json({
    success: true,
    page_name: pageName,
    message: pageName ? `Connected to "${pageName}"` : 'Facebook configuration saved',
  })
}

// ── DELETE — remove config ──────────────────────────────────────────────────

export async function DELETE(req: NextRequest) {
  const userId = await getCurrentUserId()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  await prisma.fbConfig.deleteMany({ where: { user_id: userId } })
  return NextResponse.json({ success: true })
}
