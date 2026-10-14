import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import type { Prisma } from '@prisma/client'
import { archiveFailedProductionOrder, restoreArchivedProductionOrder } from './archive'
import { canArchiveFailedProductionOrder, matchesProductionArchiveView } from './archive-rules'
import { lockedOrder, transitionOrder } from './operations'

const timestamp = new Date('2026-10-13T10:00:00Z')
function fixture(status = 'COMPLETED', qualityStatus = 'FAILED', failUpdate = false) {
  const holder = { state: {
    order: { id: 1, displayId: 'PRD-0001', status, qualityStatus, archivedAt: null as Date | null, archivedBy: null as string | null, archiveReason: null as string | null, assignedStaffId: 7, actualQty: 1, plannedQty: 1, totalMaterialCost: 100, totalCost: 150, bomId: 2, customOrderId: 3, finishedProductId: 4 },
    // These intentionally remain linked; archiving must NEVER touch them.
    stock: [{ productId: 4, quantity: 5 }], consumptions: [{ rawMaterialId: 5, actualQty: 2 }],
    ledger: [{ referenceId: 1, quantity: -2 }], batches: [{ remainingQty: 7 }],
    steps: [{ id: 1, status: 'DONE' }], scrap: [{ productionOrderId: 1, quantity: 1 }], customInventory: [{ productionOrderId: 1, quantity: 1 }],
  } }
  const calls: string[] = []
  async function run<T>(operation: (tx: Prisma.TransactionClient) => Promise<T>) {
    const copy = structuredClone(holder.state)
    const tx = {
      $queryRaw: async (sql: TemplateStringsArray, id: number) => { assert.match(sql.join('?'), /ProductionOrder.*FOR UPDATE/); assert.equal(id, 1); calls.push('lock'); return [] },
      productionOrder: {
        findUnique: async ({ where }: { where: { id: number } }) => where.id === 1 ? structuredClone(copy.order) : null,
        update: async ({ where, data }: { where: { id: number }; data: Record<string, unknown> }) => {
          assert.equal(where.id, 1)
          assert.ok(Object.keys(data).every(key => ['archivedAt', 'archivedBy', 'archiveReason'].includes(key)), 'No operational fields may change')
          Object.assign(copy.order, data); calls.push('metadata-update')
          if (failUpdate) throw new Error('Injected metadata failure')
          return structuredClone(copy.order)
        },
      },
    } as unknown as Prisma.TransactionClient
    const result = await operation(tx); holder.state = copy; return result
  }
  return { holder, calls, run }
}

const request = { id: 1, confirmation: 'PRD-0001', reason: 'Failed QC — keep history, hide from current list' }
test('failed completed order archives reversibly without touching any stock/history or business link', async () => {
  const f = fixture(); const before = structuredClone(f.holder.state)
  await f.run(tx => archiveFailedProductionOrder(tx, request, 'Signed-in Manager', timestamp))
  assert.deepEqual(f.holder.state, { ...before, order: { ...before.order, archivedAt: timestamp, archivedBy: 'Signed-in Manager', archiveReason: request.reason } })
  assert.deepEqual(f.calls, ['lock', 'metadata-update'])
  await f.run(tx => restoreArchivedProductionOrder(tx, 1))
  assert.deepEqual(f.holder.state, { ...before, order: { ...before.order, archivedBy: 'Signed-in Manager', archiveReason: request.reason } })
})

for (const [status, quality] of [['PLANNED', 'FAILED'], ['IN_PROGRESS', 'FAILED'], ['ON_HOLD', 'FAILED'], ['CANCELLED', 'FAILED'], ['COMPLETED', 'PASSED'], ['COMPLETED', 'PARTIAL'], ['COMPLETED', 'PENDING']]) test(`${status}/${quality} cannot be archived as a failed completed job`, async () => {
  const f = fixture(status, quality); const before = structuredClone(f.holder.state)
  await assert.rejects(f.run(tx => archiveFailedProductionOrder(tx, request, 'Manager')), /Only completed/)
  assert.deepEqual(f.holder.state, before)
  assert.equal(canArchiveFailedProductionOrder(f.holder.state.order), false)
})

test('invalid IDs, blank/oversized reasons, forged actor and wrong confirmation cannot mutate records', async () => {
  for (const input of [{ ...request, id: 0 }, { ...request, id: -1 }, { ...request, id: 1.5 }, { ...request, reason: ' ' }, { ...request, reason: 'x'.repeat(501) }, { ...request, actor: 'Forged admin' }, { ...request, confirmation: 'PRD-OTHER' }]) {
    const f = fixture(); const before = structuredClone(f.holder.state)
    await assert.rejects(f.run(tx => archiveFailedProductionOrder(tx, input, 'Manager')))
    assert.deepEqual(f.holder.state, before)
  }
})

test('duplicate archive/restore requests are idempotent and preserve first archive actor/reason', async () => {
  const f = fixture()
  await f.run(tx => archiveFailedProductionOrder(tx, request, 'First Manager', timestamp))
  const archived = structuredClone(f.holder.state)
  await f.run(tx => archiveFailedProductionOrder(tx, { ...request, reason: 'Changed reason' }, 'Other Manager', new Date('2026-11-01')))
  assert.deepEqual(f.holder.state, archived)
  await f.run(tx => restoreArchivedProductionOrder(tx, 1))
  const restored = structuredClone(f.holder.state)
  await f.run(tx => restoreArchivedProductionOrder(tx, 1))
  assert.deepEqual(f.holder.state, restored)
})

test('metadata write failure rolls back archive and restore completely', async () => {
  for (const restore of [false, true]) {
    const f = fixture('COMPLETED', 'FAILED', true)
    if (restore) f.holder.state.order.archivedAt = timestamp
    const before = structuredClone(f.holder.state)
    await assert.rejects(f.run(tx => restore ? restoreArchivedProductionOrder(tx, 1) : archiveFailedProductionOrder(tx, request, 'Manager')), /Injected/)
    assert.deepEqual(f.holder.state, before)
  }
})

test('archived job locks block lifecycle/QC-style edits until restored, including assigned staff', async () => {
  const f = fixture(); f.holder.state.order.archivedAt = timestamp
  const before = structuredClone(f.holder.state)
  await assert.rejects(f.run(tx => lockedOrder(tx, 1)), /read-only/)
  await assert.rejects(f.run(tx => lockedOrder(tx, 1, 7)), /read-only/)
  await assert.rejects(f.run(tx => lockedOrder(tx, 1, 8)), /not assigned/)
  await assert.rejects(f.run(tx => transitionOrder(tx, 1, 'IN_PROGRESS')), /read-only/)
  assert.deepEqual(f.holder.state, before)
})

test('current/archived filters change visibility only, not QC/status/analytics data', () => {
  const jobs = [{ status: 'COMPLETED', qualityStatus: 'FAILED', archivedAt: timestamp }, { status: 'COMPLETED', qualityStatus: 'FAILED', archivedAt: null }]
  const before = structuredClone(jobs)
  assert.equal(jobs.filter(job => matchesProductionArchiveView(job, 'CURRENT')).length, 1)
  assert.equal(jobs.filter(job => matchesProductionArchiveView(job, 'ARCHIVED')).length, 1)
  assert.equal(jobs.filter(job => matchesProductionArchiveView(job, 'ALL')).length, 2)
  assert.equal(canArchiveFailedProductionOrder(jobs[0]), false)
  assert.equal(canArchiveFailedProductionOrder(jobs[1]), true)
  assert.deepEqual(jobs, before)
})

test('additive migration leaves existing orders/history intact; archive controls exist in both layouts', () => {
  const sql = readFileSync(new URL('../../prisma/migrations/20261013153000_production_order_archive/migration.sql', import.meta.url), 'utf8')
  assert.equal((sql.match(/ADD COLUMN/g) || []).length, 3)
  assert.doesNotMatch(sql, /^\s*(DELETE|UPDATE|DROP|TRUNCATE)\b/im)
  const page = readFileSync(new URL('../../app/(dashboard)/manufacturing/page.js', import.meta.url), 'utf8')
  assert.equal((page.match(/title="Archive failed order"/g) || []).length, 2)
  assert.equal((page.match(/title="Restore archived order"/g) || []).length, 2)
  assert.match(page, /option value="ARCHIVED"/)
  const actions = readFileSync(new URL('../../app/actions/manufacturing.ts', import.meta.url), 'utf8')
  assert.match(actions, /archiveFailedProduction\(input[\s\S]*?requireRole\('ADMIN', 'MANAGER'\)/)
  assert.match(actions, /restoreArchivedProduction\(id[\s\S]*?requireRole\('ADMIN', 'MANAGER'\)/)
  assert.match(actions, /assignedStaffId: staffId, archivedAt: null/)
})
