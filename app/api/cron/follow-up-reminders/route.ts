import { NextResponse } from 'next/server'
import { runFollowUpReminders } from '@/lib/follow-up-reminders'

// Manual / external scheduler fallback for the daily follow-up reminder sweep.
// The BullMQ daily schedule (instrumentation.ts) is the primary trigger; this
// endpoint lets a platform cron or uptime monitor run it too. Guarded by the
// same secret used by the automations cron.
export async function GET(request: Request) {
    const expected = process.env.AUTOMATION_CRON_SECRET ?? process.env.CRON_SECRET
    if (!expected) {
        return NextResponse.json({ error: 'cron not configured' }, { status: 503 })
    }
    const supplied = request.headers.get('x-cron-secret')
    if (supplied !== expected) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    try {
        const summary = await runFollowUpReminders()
        return NextResponse.json({ ok: true, ...summary })
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error'
        return NextResponse.json({ error: message }, { status: 500 })
    }
}
