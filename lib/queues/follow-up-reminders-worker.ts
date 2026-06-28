/**
 * lib/queues/follow-up-reminders-worker.ts
 *
 * BullMQ worker + daily schedule for the WhatsApp follow-up reminders.
 *
 * A repeatable (cron) job runs once a day. BullMQ stores the next run time
 * in Redis and wakes only at that moment — no polling, near-zero idle CPU.
 * The sweep finds follow-ups whose date has arrived and sends one approved
 * WhatsApp template each, then marks them REMINDED so they never re-fire.
 *
 * Schedule is configurable via env:
 *   FOLLOWUP_REMINDERS_CRON  (default "0 9 * * *"  — 9 AM daily)
 *   FOLLOWUP_REMINDERS_TZ    (default "Asia/Kolkata")
 */

import { createFollowUpReminderWorker, getFollowUpReminderQueue } from './jobs'
import { runFollowUpReminders } from '@/lib/follow-up-reminders'
import type { Job } from 'bullmq'

let started = false

export function startFollowUpReminderWorker() {
    if (started) return
    started = true

    const worker = createFollowUpReminderWorker(async (_job: Job) => {
        const summary = await runFollowUpReminders()
        console.log('[follow-up-reminders] run complete:', summary)
    })

    worker.on('failed', (job, err) => {
        console.error(`[follow-up-reminders] job ${job?.id} failed:`, err?.message)
    })

    // Idempotent daily schedule — upsert so server restarts never duplicate it.
    const pattern = process.env.FOLLOWUP_REMINDERS_CRON || '0 9 * * *'
    const tz = process.env.FOLLOWUP_REMINDERS_TZ || 'Asia/Kolkata'

    const queue = getFollowUpReminderQueue()
    queue
        .upsertJobScheduler(
            'daily-follow-up-reminders',
            { pattern, tz },
            { name: 'run', data: {} },
        )
        .then(() => console.log(`[follow-up-reminders] scheduled (${pattern}, ${tz})`))
        .catch((err) => console.error('[follow-up-reminders] schedule failed:', err?.message))

    console.log('[follow-up-reminders] worker started')
}
