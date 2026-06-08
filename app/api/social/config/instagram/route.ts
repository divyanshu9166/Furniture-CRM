/**
 * app/api/social/config/instagram/route.ts
 * GET / POST / DELETE — Instagram Business DM configuration
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

  const config = await prisma.igConfig.findUnique({ where: { user_id: userId } })

  if (!config) {
    return NextResponse.json({ connected: false, config: null })
  }

  let connected = false
  let igUsername = config.ig_username
  let reason = ''

  try {
    const token = decrypt(config.page_access_token)
    // Verify the Instagram account is accessible via the linked Page token
    const res = await fetch(
      `https://graph.facebook.com/v21.0/${config.ig_account_id}?fields=name,username&access_token=${encodeURIComponent(token)}`,
    )
    const data = await res.json()
    if (res.ok && data.id) {
      connected = true
      igUsername = data.username ?? config.ig_username
      if (igUsername && igUsername !== config.ig_username) {
        await prisma.igConfig.update({
          where: { user_id: userId },
          data: { ig_username: igUsername, status: 'connected', connected_at: new Date() },
        })
      }
    } else {
      reason = data.error?.message ?? 'API connection failed'
    }
  } catch {
    reason = 'Network error'
  }

  return NextResponse.json({
    connected,
    reason,
    config: {
      id: config.id,
      ig_account_id: config.ig_account_id,
      page_id: config.page_id,
      page_name: config.page_name,
      ig_username: igUsername,
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
  const { ig_account_id, page_id, page_access_token, app_secret, verify_token } = body

  if (!ig_account_id?.trim()) {
    return NextResponse.json({ error: 'Instagram Business Account ID is required' }, { status: 400 })
  }
  if (!page_id?.trim()) {
    return NextResponse.json({ error: 'Linked Facebook Page ID is required' }, { status: 400 })
  }
  if (!page_access_token?.trim()) {
    return NextResponse.json({ error: 'Page Access Token is required' }, { status: 400 })
  }

  // Verify the IG account is accessible
  let igUsername: string | null = null
  let pageName: string | null = null
  try {
    const token = page_access_token.trim()

    // Check the IG account
    const igRes = await fetch(
      `https://graph.facebook.com/v21.0/${ig_account_id.trim()}?fields=name,username&access_token=${encodeURIComponent(token)}`,
    )
    const igData = await igRes.json()
    if (!igRes.ok || !igData.id) {
      return NextResponse.json(
        { error: igData.error?.message ?? 'Invalid Instagram Account ID or token' },
        { status: 400 },
      )
    }
    igUsername = igData.username ?? null

    // Also fetch the Page name for display
    const pageRes = await fetch(
      `https://graph.facebook.com/v21.0/${page_id.trim()}?fields=name&access_token=${encodeURIComponent(token)}`,
    )
    const pageData = await pageRes.json()
    if (pageRes.ok && pageData.name) {
      pageName = pageData.name
    }
  } catch {
    return NextResponse.json({ error: 'Could not reach Meta API to verify credentials' }, { status: 502 })
  }

  const encryptedToken = encrypt(page_access_token.trim())
  const encryptedSecret = app_secret?.trim() ? encrypt(app_secret.trim()) : null

  await prisma.igConfig.upsert({
    where: { user_id: userId },
    create: {
      user_id: userId,
      ig_account_id: ig_account_id.trim(),
      page_id: page_id.trim(),
      page_name: pageName,
      ig_username: igUsername,
      page_access_token: encryptedToken,
      app_secret: encryptedSecret,
      verify_token: verify_token?.trim() || null,
      status: 'connected',
      connected_at: new Date(),
    },
    update: {
      ig_account_id: ig_account_id.trim(),
      page_id: page_id.trim(),
      page_name: pageName,
      ig_username: igUsername,
      page_access_token: encryptedToken,
      app_secret: encryptedSecret ?? undefined,
      verify_token: verify_token?.trim() || null,
      status: 'connected',
      connected_at: new Date(),
    },
  })

  return NextResponse.json({
    success: true,
    ig_username: igUsername,
    page_name: pageName,
    message: igUsername
      ? `Connected to @${igUsername}`
      : 'Instagram configuration saved',
  })
}

// ── DELETE ──────────────────────────────────────────────────────────────────

export async function DELETE(req: NextRequest) {
  const userId = await getCurrentUserId()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  await prisma.igConfig.deleteMany({ where: { user_id: userId } })
  return NextResponse.json({ success: true })
}
