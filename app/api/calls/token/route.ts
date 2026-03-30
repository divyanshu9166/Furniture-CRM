import { NextRequest, NextResponse } from 'next/server'

/**
 * GET /api/calls/token
 * Generates a LiveKit access token for browser-based voice calls.
 * Used by the "Browser Call" feature in the CRM call centre page.
 */
export async function GET(req: NextRequest) {
  try {
    const LIVEKIT_URL = process.env.LIVEKIT_URL
    const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY
    const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET

    if (!LIVEKIT_URL || !LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
      return NextResponse.json(
        { error: 'LiveKit not configured' },
        { status: 503 }
      )
    }

    const { createToken, createRoom, dispatchAgent } = await import('@/lib/livekit')

    const roomName = `browser-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const identity = `crm-user-${Date.now()}`

    // Create room and dispatch agent for browser call
    await createRoom(roomName)
    await dispatchAgent(roomName, {
      call_type: 'inbound',
      phone_number: 'browser-call',
      reason: 'Browser test call from CRM',
      customer_name: 'CRM User',
    })

    const token = await createToken(roomName, identity, 'CRM User')

    return NextResponse.json({
      token,
      url: LIVEKIT_URL,
      room: roomName,
    })
  } catch (error) {
    console.error('Failed to generate token:', error)
    return NextResponse.json({ error: 'Failed to generate token' }, { status: 500 })
  }
}
