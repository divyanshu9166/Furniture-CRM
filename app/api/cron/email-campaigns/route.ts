import { NextRequest, NextResponse } from 'next/server'
import { processDueEmailCampaigns } from '@/lib/email-campaign-runner'

export async function GET(request: NextRequest) {
  const expected = process.env.AUTOMATION_CRON_SECRET ?? process.env.CRON_SECRET
  if (!expected) return NextResponse.json({ error: 'Cron secret is not configured' }, { status: 503 })
  if (request.headers.get('x-cron-secret') !== expected) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    return NextResponse.json({ ok: true, ...(await processDueEmailCampaigns()) })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to process campaigns' }, { status: 500 })
  }
}
