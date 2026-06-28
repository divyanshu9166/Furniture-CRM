// ------------------------------------------------------------
// Pure, day-granular helpers for follow-up due classification.
// Deterministic (no hidden "now") so the logic is easy to reason about.
// ------------------------------------------------------------

export type DueBucket = 'overdue' | 'today' | 'upcoming'

/** Strip time-of-day so comparisons are by calendar day in local time. */
function startOfDay(d: Date): number {
    const x = new Date(d)
    x.setHours(0, 0, 0, 0)
    return x.getTime()
}

/** Whole-day difference: (followUpDate - now), positive = future. */
export function daysUntil(followUpDate: Date, now: Date): number {
    const MS = 86_400_000
    return Math.round((startOfDay(followUpDate) - startOfDay(now)) / MS)
}

export function dueBucket(followUpDate: Date, now: Date): DueBucket {
    const diff = daysUntil(followUpDate, now)
    if (diff < 0) return 'overdue'
    if (diff === 0) return 'today'
    return 'upcoming'
}

/** Human label for the due badge, e.g. "Overdue 3d", "Due today", "in 12d". */
export function dueLabel(followUpDate: Date, now: Date): string {
    const diff = daysUntil(followUpDate, now)
    if (diff < 0) return `Overdue ${Math.abs(diff)}d`
    if (diff === 0) return 'Due today'
    if (diff === 1) return 'Tomorrow'
    return `in ${diff}d`
}
