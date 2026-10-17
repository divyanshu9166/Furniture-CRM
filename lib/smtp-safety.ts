import { createHash, randomUUID } from 'node:crypto'
import { isSmtpAccountBlocked } from './email-errors'

type Mailbox = { smtpHost: string; smtpUser: string }
export type SafetyState = {
  id: string; blockedAt: Date | null; blockReason: string | null
  leaseToken: string | null; leaseUntil: Date | null; nextAllowedAt: Date
}
export interface SafetyRepository {
  ensure(id: string): Promise<unknown>
  read(id: string): Promise<SafetyState | null>
  claim(id: string, token: string, now: Date, until: Date): Promise<boolean>
  release(id: string, token: string, next: Date, blocked?: { at: Date; reason: string }): Promise<unknown>
  reset(id: string, blockedAt: Date, actor: string, now: Date): Promise<boolean>
}
export const SMTP_SAFETY_MESSAGE = 'CRM email sending is stopped for this SMTP mailbox and all its aliases after an account/security rejection. Secure the mailbox and resolve the provider suspension first, then ask an administrator to review Email Setup → Sending safety. SMTP login success does not clear this stop.'

export class SmtpSafetyStop extends Error {
  constructor() { super(SMTP_SAFETY_MESSAGE); this.name = 'SmtpSafetyStop' }
}
export function smtpMailboxKey(config: Mailbox) {
  return createHash('sha256').update(`${config.smtpHost.trim().toLowerCase()}\n${config.smtpUser.trim().toLowerCase()}`).digest('hex')
}

export function createSmtpSafety(repo: SafetyRepository, options: { now?: () => number; sleep?: (ms: number) => Promise<void>; spacingMs?: number; waitMs?: number } = {}) {
  const now = options.now ?? Date.now
  const sleep = options.sleep ?? (ms => new Promise(resolve => setTimeout(resolve, ms)))
  const spacingMs = Math.max(1000, options.spacingMs ?? 1000) // application pacing, NOT a provider quota guarantee
  return {
    async status(config: Mailbox) {
      const row = await repo.read(smtpMailboxKey(config))
      return { blocked: !!row?.blockedAt, blockedAt: row?.blockedAt?.toISOString() ?? null, reason: row?.blockReason ?? null }
    },
    async reset(config: Mailbox, blockedAt: string, acknowledge: boolean, actor: string) {
      if (acknowledge !== true || !actor.trim() || !blockedAt || !Number.isFinite(Date.parse(blockedAt))) throw new Error('Review the provider suspension and explicitly confirm recovery before resetting the CRM stop.')
      if (!await repo.reset(smtpMailboxKey(config), new Date(blockedAt), actor, new Date(now()))) throw new Error('Sending safety changed or a send is in progress. Refresh before resetting.')
    },
    async send<T>(config: Mailbox, operation: () => Promise<T>): Promise<T> {
      const id = smtpMailboxKey(config)
      await repo.ensure(id) // failure is closed: never bypass safety when DB/migration is unavailable
      const deadline = now() + (options.waitMs ?? 30000)
      const token = randomUUID()
      for (;;) {
        const row = await repo.read(id)
        if (!row) throw new Error('Email sending safety is unavailable. No SMTP attempt was made.')
        if (row.blockedAt) throw new SmtpSafetyStop()
        const time = now()
        if (await repo.claim(id, token, new Date(time), new Date(time + 120000))) break
        if (time >= deadline) throw new Error('SMTP mailbox is busy or cooling down. No SMTP attempt was made for this recipient; review campaign history before any manual retry.')
        await sleep(Math.min(1000, Math.max(1, deadline - time)))
      }
      let result: T
      try { result = await operation() } catch (error) {
        const blocked = isSmtpAccountBlocked(error)
        try {
          await repo.release(id, token, new Date(now() + spacingMs), blocked ? {
            at: new Date(now()), reason: 'Provider rejected sending for account authentication, suspension, quota, or spam/security policy. Check provider logs; do not repeatedly retry.',
          } : undefined)
        } catch {
          console.error('[smtp-safety] Failed to record SMTP failure. Lease remains fenced; check database recovery and provider logs before retrying.')
        }
        // Keep the original policy error so callers stop the rest of a bulk
        // run even when the safety database becomes unavailable mid-send.
        throw error
      }
      // SMTP already accepted: a bookkeeping failure must not turn this into
      // an apparently failed message that an operator might duplicate/replay.
      try { await repo.release(id, token, new Date(now() + spacingMs)) }
      catch { console.error('[smtp-safety] Accepted message; failed to release safety lease. Further sends remain gated until lease expiry/database recovery.') }
      return result
    },
  }
}
