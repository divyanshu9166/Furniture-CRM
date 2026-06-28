// ------------------------------------------------------------
// Deterministic "contact me later" intent parser.
//
// Detects messages like "call me after 10 days", "follow up next month",
// "ping me tomorrow", "reach out in 2 weeks" and resolves them to a future
// date. It only matches when BOTH a contact cue AND a future timeframe are
// present, so phrases like "I called you 2 days ago" or "possession in 2
// years" don't trigger a false follow-up.
// ------------------------------------------------------------

export interface FollowUpIntent {
    matched: boolean
    date?: Date
    amount?: number
    unit?: 'day' | 'week' | 'month'
    reason?: string
}

const CONTACT_CUE =
    /\b(call|contact|ping|reach(?:\s*out)?|get\s*back|follow[\s-]*up|followup|text|message|connect|revert|call\s*back|callback)\b/i

// Past-tense / "ago" guard — never treat retrospective mentions as intent.
const PAST_HINT = /\bago\b|\byesterday\b|\blast\s+(week|month|day)\b/i

const WORD_NUMBERS: Record<string, number> = {
    a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6,
    seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
    fifteen: 15, twenty: 20, thirty: 30, couple: 2, few: 3,
}

function toNumber(token: string): number | null {
    const t = token.toLowerCase().trim()
    if (/^\d+$/.test(t)) {
        const n = parseInt(t, 10)
        return n > 0 && n <= 365 ? n : null
    }
    return WORD_NUMBERS[t] ?? null
}

function addDays(d: Date, n: number): Date {
    const x = new Date(d)
    x.setDate(x.getDate() + n)
    return x
}

// Calendar-correct month add (e.g. Jan 31 + 1 month → Feb 28/29).
function addMonths(d: Date, n: number): Date {
    const x = new Date(d)
    const day = x.getDate()
    x.setDate(1)
    x.setMonth(x.getMonth() + n)
    const lastDay = new Date(x.getFullYear(), x.getMonth() + 1, 0).getDate()
    x.setDate(Math.min(day, lastDay))
    return x
}

export function parseFollowUpIntent(rawText: string, now: Date = new Date()): FollowUpIntent {
    const text = String(rawText || '').toLowerCase().trim()
    if (!text) return { matched: false }
    if (!CONTACT_CUE.test(text)) return { matched: false }
    if (PAST_HINT.test(text)) return { matched: false }

    const numToken = '(\\d{1,3}|a|an|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|thirty|couple|few)'

    const reason = `Auto-created from chat: "${rawText.trim().slice(0, 120)}"`

    // tomorrow → +1 day
    if (/\btomorrow\b/.test(text)) {
        return { matched: true, date: addDays(now, 1), amount: 1, unit: 'day', reason }
    }

    // next week / next month
    if (/\bnext\s+week\b/.test(text)) {
        return { matched: true, date: addDays(now, 7), amount: 1, unit: 'week', reason }
    }
    if (/\bnext\s+month\b/.test(text)) {
        return { matched: true, date: addMonths(now, 1), amount: 1, unit: 'month', reason }
    }

    // "after/in N <unit>"  or  "N <unit> later"
    const patterns = [
        new RegExp(`\\b(?:after|in|within)\\s+${numToken}\\s*(day|days|week|weeks|month|months)\\b`, 'i'),
        new RegExp(`\\b${numToken}\\s*(day|days|week|weeks|month|months)\\s+later\\b`, 'i'),
    ]

    for (const re of patterns) {
        const m = text.match(re)
        if (m) {
            const amount = toNumber(m[1])
            if (!amount) continue
            const unitRaw = m[2].toLowerCase()
            if (unitRaw.startsWith('day')) {
                return { matched: true, date: addDays(now, amount), amount, unit: 'day', reason }
            }
            if (unitRaw.startsWith('week')) {
                return { matched: true, date: addDays(now, amount * 7), amount, unit: 'week', reason }
            }
            if (unitRaw.startsWith('month')) {
                return { matched: true, date: addMonths(now, amount), amount, unit: 'month', reason }
            }
        }
    }

    return { matched: false }
}
