import { NextRequest, NextResponse } from 'next/server'

/**
 * POST /api/calls/outbound
 * Triggers an outbound AI call by dispatching a LiveKit agent.
 * Called from the CRM frontend when a user clicks "AI Call" button.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { phoneNumber, reason, customerName } = body

    if (!phoneNumber) {
      return NextResponse.json({ error: 'Phone number is required' }, { status: 400 })
    }

    const LIVEKIT_URL = process.env.LIVEKIT_URL
    const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY
    const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET

    if (!LIVEKIT_URL || !LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
      return NextResponse.json(
        { error: 'LiveKit not configured. Please set LIVEKIT_URL, LIVEKIT_API_KEY, and LIVEKIT_API_SECRET.' },
        { status: 503 }
      )
    }

    // Generate a unique room name
    const roomName = `outbound-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

    // Use LiveKit Server API to create room and dispatch agent
    // We use the REST API directly since we're in a Next.js API route
    const { createToken, createRoom, dispatchAgent } = await import('@/lib/livekit')

    await createRoom(roomName)
    await dispatchAgent(roomName, {
      call_type: 'outbound',
      phone_number: phoneNumber,
      reason: reason || 'Follow-up call',
      customer_name: customerName || '',
    })

    return NextResponse.json({
      success: true,
      data: {
        roomName,
        message: `Outbound call initiated to ${phoneNumber}`,
      },
    })
  } catch (error) {
    console.error('Failed to initiate outbound call:', error)
    return NextResponse.json({ error: 'Failed to initiate call' }, { status: 500 })
  }
}
