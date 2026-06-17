/**
 * app/api/social/contacts/refresh-names/route.ts
 *
 * POST — Backfill display names / avatars for existing social contacts whose
 * `name` is still the raw PSID/IGSID (these were created by the old
 * /api/webhooks/facebook route, which requested the unsupported `name` field
 * and fell back to the PSID).
 *
 * Re-fetches each affected contact's public profile from the Graph API using
 * the stored Page Access Token and updates the record in place.
 *
 * Optional query param:
 *   platform=facebook|instagram   (default: both)
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/db'
import { decrypt } from '@/lib/whatsapp/encryption'
import { getUserProfile, type SocialPlatform } from '@/lib/social/messenger-api'

async function getUserId(): Promise<string | null> {
  const session = await getSession()
  return session?.id ? String(session.id) : null
}

export async function POST(req: NextRequest) {
  const userId = await getUserId()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const platformParam = searchParams.get('platform') as SocialPlatform | null
  const platforms: SocialPlatform[] = platformParam
    ? [platformParam]
    : ['facebook', 'instagram']

  // Resolve a Page Access Token per platform once.
  const tokens: Partial<Record<SocialPlatform, string>> = {}

  const fbConfig = platforms.includes('facebook')
    ? await prisma.fbConfig.findUnique({ where: { user_id: userId } })
    : null
  if (fbConfig?.page_access_token) {
    try { tokens.facebook = decrypt(fbConfig.page_access_token) } catch { /* ignore */ }
  }

  const igConfig = platforms.includes('instagram')
    ? await prisma.igConfig.findUnique({ where: { user_id: userId } })
    : null
  if (igConfig?.page_access_token) {
    try { tokens.instagram = decrypt(igConfig.page_access_token) } catch { /* ignore */ }
  }

  // Find contacts whose name is missing or equals the raw platform_id.
  const candidates = await prisma.socialContact.findMany({
    where: {
      user_id: userId,
      platform: { in: platforms },
    },
  })

  let updated = 0
  let skipped = 0
  let failed = 0

  for (const contact of candidates) {
    const platform = contact.platform as SocialPlatform
    const needsName =
      !contact.name ||
      contact.name === contact.platform_id ||
      /^FB User /.test(contact.name)
    const needsPic = !contact.profile_pic

    if (!needsName && !needsPic) {
      skipped++
      continue
    }

    const token = tokens[platform]
    if (!token) {
      failed++
      continue
    }

    const profile = await getUserProfile({
      userId: contact.platform_id,
      pageAccessToken: token,
      platform,
    })

    if (profile && (profile.name || profile.profile_pic)) {
      await prisma.socialContact.update({
        where: { id: contact.id },
        data: {
          ...(needsName && profile.name ? { name: profile.name } : {}),
          ...(needsPic && profile.profile_pic ? { profile_pic: profile.profile_pic } : {}),
        },
      })
      updated++
    } else {
      failed++
    }
  }

  return NextResponse.json({
    success: true,
    scanned: candidates.length,
    updated,
    skipped,
    failed,
  })
}
