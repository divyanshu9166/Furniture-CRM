// ------------------------------------------------------------
// Pure, day-granular helpers for follow-up due classification.
// Deterministic (no hidden "now") so the logic is easy to reason about.
// ------------------------------------------------------------

import { indiaDay } from './commerce/rules'
export type DueBucket = 'overdue' | 'today' | 'upcoming'

/** Whole-day difference: (followUpDate - now), positive = future. */
export function daysUntil(followUpDate: Date, now: Date): number {
    const MS = 86_400_000
    return Math.round((Date.parse(followUpDate.toISOString().slice(0, 10)) - Date.parse(indiaDay(now))) / MS)
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
