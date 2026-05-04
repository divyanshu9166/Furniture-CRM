import { NextRequest, NextResponse } from 'next/server'
import { syncIndiaMartPullLeadsCron } from '@/app/actions/indiamart'

export async function GET(req: NextRequest) {
  const apiSecret = req.headers.get('x-api-secret') || ''

  try {
    const result = await syncIndiaMartPullLeadsCron(apiSecret)
    if (!result.success) {
      if (result.error === 'Unauthorized') {
        return NextResponse.json(result, { status: 401 })
      }
      if (result.error === 'CRM_API_SECRET is not configured on server') {
        return NextResponse.json(result, { status: 500 })
      }
      return NextResponse.json(result, { status: 400 })
    }

    return NextResponse.json(result)
  } catch (err) {
    console.error('[indiamart-sync] Error:', err)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
