import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createSmtpSafety, smtpMailboxKey, SmtpSafetyStop, type SafetyState, type SafetyRepository } from './smtp-safety'
import { emailFailureMessage, isSmtpAccountBlocked } from './email-errors'

const config = { smtpHost: 'smtp.hostinger.com', smtpUser: 'info@example.com' }
function fixture(failure = '') {
  let time = Date.parse('2026-10-17T09:00:00Z')
  const rows = new Map<string, SafetyState>()
  const resets: string[] = []
  const repo: SafetyRepository = {
    ensure: async id => {
      if (failure === 'schema') throw Object.assign(new Error('Missing table'), { code: 'P2021' })
      if (!rows.has(id)) rows.set(id, { id, blockedAt: null, blockReason: null, leaseToken: null, leaseUntil: null, nextAllowedAt: new Date(time) })
    },
    read: async id => rows.get(id) ?? null,
    claim: async (id, token, now, until) => {
      const row = rows.get(id)!
      if (row.blockedAt || row.nextAllowedAt > now || (row.leaseUntil && row.leaseUntil > now)) return false
      Object.assign(row, { leaseToken: token, leaseUntil: until }); return true
    },
    release: async (id, token, next, blocked) => {
      if (failure === 'release') throw new Error('DB unavailable')
      const row = rows.get(id)!
      if (row.leaseToken !== token) return
      Object.assign(row, { leaseToken: null, leaseUntil: null, nextAllowedAt: next }, blocked ? { blockedAt: blocked.at, blockReason: blocked.reason } : {})
    },
    reset: async (id, expected, actor, now) => {
      const row = rows.get(id)
      if (!row?.blockedAt || row.blockedAt.getTime() !== expected.getTime() || (row.leaseUntil && row.leaseUntil > now)) return false
      row.blockedAt = null; row.blockReason = null; resets.push(actor); return true
    },
  }
  const options = { now: () => time, sleep: async (ms: number) => { time += ms } }
  return { rows, repo, resets, clock: () => time, worker: () => createSmtpSafety(repo, options) }
}

test('SMTP aliases, case changes, and port/password edits share one mailbox key', () => {
  assert.equal(smtpMailboxKey(config), smtpMailboxKey({ smtpHost: ' SMTP.HOSTINGER.COM ', smtpUser: ' INFO@EXAMPLE.COM ' }))
  assert.notEqual(smtpMailboxKey(config), smtpMailboxKey({ ...config, smtpUser: 'other@example.com' }))
  assert.notEqual(smtpMailboxKey(config), smtpMailboxKey({ ...config, smtpHost: 'other.example.com' }))
  assert.match(smtpMailboxKey(config), /^[a-f0-9]{64}$/)
})

test('separate workers serialize and pace the same mailbox without replaying any operation', async () => {
  const f = fixture(); const a = f.worker(), b = f.worker()
  let active = 0; let maximum = 0; const starts: number[] = []
  const operation = async () => { active++; maximum = Math.max(maximum, active); starts.push(f.clock()); await Promise.resolve(); active--; return 'accepted' }
  assert.deepEqual(await Promise.all([a.send(config, operation), b.send(config, operation)]), ['accepted', 'accepted'])
  assert.equal(maximum, 1); assert.equal(starts.length, 2); assert.ok(starts[1] - starts[0] >= 1000)
})

for (const message of ['554 5.7.1 Outbound sending is disabled for this account', '554 5.7.1 message blocked due to spam policy', '535 5.7.8 Authentication failed', 'Daily sending limit exceeded']) {
  test(`persistent stop survives worker recreation: ${message}`, async () => {
    const f = fixture(); let calls = 0
    await assert.rejects(f.worker().send(config, async () => { calls++; throw new Error(message) }))
    const afterRestart = f.worker()
    assert.equal((await afterRestart.status(config)).blocked, true)
    await assert.rejects(afterRestart.send({ ...config }, async () => { calls++; return 'unsafe' }), SmtpSafetyStop)
    assert.equal(calls, 1)
    assert.doesNotMatch(JSON.stringify([...f.rows.values()]), /535|554|password|secret/)
  })
}

test('a rejected recipient does not suspend the mailbox; suppression never requires a send', async () => {
  const f = fixture(); const safety = f.worker()
  await assert.rejects(safety.send(config, async () => { throw new Error('550 5.1.1 Recipient not found') }))
  assert.equal((await safety.status(config)).blocked, false)
  assert.equal(await safety.send(config, async () => 'accepted'), 'accepted')
})

test('recovery requires exact stop revision and acknowledgement; no SMTP call is made by reset', async () => {
  const f = fixture(); const safety = f.worker()
  await assert.rejects(safety.send(config, async () => { throw new Error('Sending suspended') }))
  const status = await safety.status(config)
  await assert.rejects(safety.reset(config, status.blockedAt!, false, 'Admin'))
  await assert.rejects(safety.reset(config, '2026-10-16T00:00:00Z', true, 'Admin'))
  await assert.rejects(safety.reset(config, status.blockedAt!, true, ''))
  assert.equal((await safety.status(config)).blocked, true)
  await safety.reset(config, status.blockedAt!, true, 'Signed-in Admin')
  assert.equal((await safety.status(config)).blocked, false)
  assert.deepEqual(f.resets, ['Signed-in Admin'])
  await assert.rejects(safety.reset(config, status.blockedAt!, true, 'Admin'))
})

test('missing migration/database fails closed before any SMTP operation', async () => {
  let calls = 0; const f = fixture('schema')
  await assert.rejects(f.worker().send(config, async () => { calls++; return 'unsafe' }), (error: unknown) => {
    assert.match(emailFailureMessage(error), /Apply pending Prisma migrations/); return true
  })
  assert.equal(calls, 0)
})

test('accepted SMTP outcome is retained if lease-release bookkeeping fails', async (t) => {
  t.mock.method(console, 'error', () => {})
  const f = fixture('release'); let calls = 0
  assert.equal(await f.worker().send(config, async () => { calls++; return 'accepted' }), 'accepted')
  assert.equal(calls, 1)
  assert.ok(f.rows.get(smtpMailboxKey(config))?.leaseToken)
})

test('account classifier treats auth/security/quota failures differently from missing recipients', () => {
  assert.equal(isSmtpAccountBlocked(Object.assign(new Error('Login failed'), { code: 'EAUTH' })), true)
  assert.equal(isSmtpAccountBlocked(new Error('550 5.1.1 User unknown')), false)
  assert.equal(isSmtpAccountBlocked(new Error('SMTP did not accept this recipient')), false)
})

test('migration is additive, and guard persistence never stores SMTP passwords or edits campaign history', () => {
  const sql = readFileSync(new URL('../prisma/migrations/20261017120000_smtp_sending_safety/migration.sql', import.meta.url), 'utf8')
  assert.match(sql, /CREATE TABLE "SmtpSendingSafety"/)
  assert.doesNotMatch(sql, /^\s*(DROP|UPDATE|DELETE|TRUNCATE)\b/im)
  const service = readFileSync(new URL('./smtp-safety-service.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(service, /smtpPass|emailRecipient|emailCampaign|deleteMany/)
  assert.match(service, /where: \{ id, leaseToken: token \}/)
  assert.match(service, /where: \{ id, blockedAt, OR:/)
})
