import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createLedgerRequestGuard, mergeLedgerEntries, ledgerQuantityClass } from './ledger-view'

test('late responses cannot overwrite a newer refresh or stop its loading state', () => {
  const guard = createLedgerRequestGuard()
  const old = guard.begin()!
  const latest = guard.begin()!
  assert.equal(guard.isCurrent(old), false)
  assert.equal(guard.finish(old, 90), false)
  guard.release(old)
  assert.equal(guard.begin(90), null)
  assert.equal(guard.isCurrent(latest), true)
  assert.equal(guard.finish(latest, 80), true)
  assert.ok(guard.begin(80))
})

test('changing filters invalidates pending pages and rejects stale refresh closures', () => {
  const guard = createLedgerRequestGuard('1|2')
  const old = guard.begin(undefined, '1|2')!
  guard.finish(old, 70)
  const pendingPage = guard.begin(70, '1|2')!
  guard.selectScope('3|2')
  assert.equal(guard.isCurrent(pendingPage), false)
  assert.equal(guard.finish(pendingPage, 60), false)
  assert.equal(guard.begin(undefined, '1|2'), null)
  assert.equal(guard.begin(70, '3|2'), null)
  const latest = guard.begin(undefined, '3|2')!
  assert.equal(guard.finish(latest, 40), true)
  assert.ok(guard.begin(40, '3|2'))
})

test('repeated older-page clicks cannot start overlapping or replayed requests', () => {
  const guard = createLedgerRequestGuard()
  assert.equal(guard.begin(100), null)
  const first = guard.begin()!; guard.finish(first, 100)
  const page = guard.begin(100)!
  assert.equal(guard.begin(100), null)
  guard.finish(page, 50)
  assert.equal(guard.begin(100), null)
  assert.ok(guard.begin(50))
})

test('failed append releases busy state but keeps the cursor for explicit retry', () => {
  const guard = createLedgerRequestGuard()
  const first = guard.begin()!; guard.finish(first, 100)
  const failed = guard.begin(100)!; guard.release(failed)
  assert.ok(guard.begin(100))
})

test('refresh supersedes a pending append; end-of-history cannot load again', () => {
  const guard = createLedgerRequestGuard()
  const first = guard.begin()!; guard.finish(first, 100)
  const old = guard.begin(100)!
  const refresh = guard.begin()!
  assert.equal(guard.finish(old, 50), false)
  guard.finish(refresh, null)
  assert.equal(guard.begin(50), null)
  assert.equal(guard.begin(100), null)
})

test('unmount/invalidation ignores pending responses and drops old cursors', () => {
  const guard = createLedgerRequestGuard()
  const request = guard.begin()!
  guard.invalidate()
  assert.equal(guard.isCurrent(request), false)
  assert.equal(guard.finish(request, 100), false)
  assert.equal(guard.begin(100), null)
  assert.ok(guard.begin())
})

test('append preserves order, updates matching IDs, deduplicates rows and never mutates input', () => {
  const previous = [{ id: 3, quantity: 5, balanceAfter: 25 }, { id: 2, quantity: -2, balanceAfter: 20 }]
  const incoming = [{ id: 2, quantity: -2, balanceAfter: 20 }, { id: 1, quantity: 0, balanceAfter: 22 }, { id: 1, quantity: 0, balanceAfter: 22 }]
  const before = structuredClone({ previous, incoming })
  assert.deepEqual(mergeLedgerEntries(previous, incoming), [...previous, incoming[1]])
  assert.deepEqual({ previous, incoming }, before)
  assert.deepEqual(mergeLedgerEntries([], incoming), [incoming[0], incoming[1]])
})

test('zero-quantity audit/reconciliation entries are neutral, not stock deductions', () => {
  assert.equal(ledgerQuantityClass(0), 'text-muted')
  assert.equal(ledgerQuantityClass(-0), 'text-muted')
  assert.equal(ledgerQuantityClass(1), 'text-success')
  assert.equal(ledgerQuantityClass(-1), 'text-danger')
})

test('both views retain the same read action and godown-local saved balance', () => {
  for (const file of ['../../app/(dashboard)/inventory/page.js', '../../app/(dashboard)/godowns/page.js']) {
    const source = readFileSync(new URL(file, import.meta.url), 'utf8')
    assert.match(source, /getStockLedger.*from '@\/app\/actions\/godowns'/)
    assert.match(source, /ledgerQuantityClass\(e.quantity\)/)
    assert.match(source, /e.quantity < 0 \? <ArrowDown/)
    assert.match(source, /e.balanceAfter/)
    assert.match(source, /godown balance after that movement/)
  }
  const inventory = readFileSync(new URL('../../app/(dashboard)/inventory/page.js', import.meta.url), 'utf8')
  assert.match(inventory, /if \(!ledgerRequests.current.isCurrent\(request\)\) return/)
  assert.match(inventory, /setLedgerError\(res\?\.error/)
  assert.match(inventory, /mergeLedgerEntries\(cursor \? previous : \[\], res.data\)/)
  assert.match(inventory, /onClick=\{\(\) => loadLedger\(\)\}/)
  assert.match(inventory, /ledgerError && <p role="alert"/)
})
