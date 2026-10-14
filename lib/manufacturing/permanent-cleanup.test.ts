import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import type { Prisma } from '@prisma/client'
import { previewPermanentBomCleanup, permanentlyDeleteBomAndFailedJobs } from './permanent-cleanup'
import { productionNumber, nextProductionDisplayId } from './production-number'

type Consumption = { id: number; rawMaterialId: number; actualQty: number }
type Job = { id: number; bomId: number; displayId: string; status: string; qualityStatus: string; archivedAt: Date | null; finishedProductId: number; customOrderId: number | null; totalCost: number; consumptions: Consumption[]; productionSteps: { id: number; status: string }[]; customInventoryItems: { id: number }[] }
type Ledger = { id: number; productId: number; referenceType: string | null; referenceId: number | null; notes: string | null; quantity: number; balanceAfter: number; createdBy: string; createdAt: Date }
type Scrap = { id: number; productionOrderId: number | null; materialConsumptionId: number | null; rawMaterialId: number; quantity: number; status: string }
type Bom = { id: number; name: string; isActive: boolean; items: { id: number; rawMaterialId: number }[]; steps: { id: number }[] }

// Copy-on-commit transaction fixture. Intentionally exposes no stock/product/
// batch update or delete methods: permanent document cleanup cannot call them.
function fixture(failure = '') {
  const job: Job = { id: 1, bomId: 1, displayId: 'PRD-0001', status: 'COMPLETED', qualityStatus: 'FAILED', archivedAt: new Date('2026-10-13'), finishedProductId: 4, customOrderId: null, totalCost: 53, consumptions: [{ id: 11, rawMaterialId: 5, actualQty: 2 }], productionSteps: [{ id: 21, status: 'DONE' }], customInventoryItems: [] }
  const entry = (id: number, referenceType: string, referenceId: number, productId = 5): Ledger => ({ id, referenceType, referenceId, productId, notes: `Original ${id}`, quantity: -2, balanceAfter: 8, createdBy: 'Original worker', createdAt: new Date('2026-07-23') })
  const holder = { state: {
    boms: [{ id: 1, name: 'kosmo 900 desk', isActive: false, items: [{ id: 1, rawMaterialId: 5 }], steps: [{ id: 1 }] }, { id: 2, name: 'Other recipe', isActive: true, items: [{ id: 2, rawMaterialId: 5 }], steps: [] }] as Bom[],
    jobs: [job, { ...structuredClone(job), id: 2, bomId: 2, displayId: 'PRD-0002', qualityStatus: 'PASSED', archivedAt: null, consumptions: [{ id: 12, rawMaterialId: 5, actualQty: 1 }], productionSteps: [{ id: 22, status: 'DONE' }] }],
    ledger: [entry(101, 'Production', 1), entry(102, 'ProductionQC', 1, 4), entry(103, 'Scrap', 301), entry(201, 'Production', 2), entry(202, 'Manual', 1)],
    scrap: [{ id: 301, productionOrderId: 1, materialConsumptionId: 11, rawMaterialId: 5, quantity: 1, status: 'DISPOSED' }, { id: 302, productionOrderId: 2, materialConsumptionId: 12, rawMaterialId: 5, quantity: 3, status: 'IN_STOCK' }] as Scrap[],
    audit: [] as { id: number; bomId: number; maxOrderNumber: bigint; counts: unknown; deletedBy: string; reason: string }[],
    products: [{ id: 4, stock: 0, costPrice: 100 }, { id: 5, stock: 8, costPrice: 25 }],
    godownStocks: [{ productId: 5, godownId: 1, quantity: 8 }],
    batches: [{ id: 91, productId: 5, quantity: 10, remainingQty: 8 }],
    movements: [{ id: 81, batchId: 91, stockLedgerId: 101, quantity: -2 }],
    invoices: [{ id: 7, productId: 4, amount: 3300 }],
  } }
  const calls: string[] = []
  async function run<T>(operation: (tx: Prisma.TransactionClient) => Promise<T>) {
    const s = structuredClone(holder.state)
    const fail = (stage: string) => { if (failure === stage) throw new Error(`Injected ${stage} failure`) }
    const tx = {
      $queryRaw: async (sql: TemplateStringsArray, ...values: unknown[]) => { calls.push(sql.join('?') + JSON.stringify(values)); return [] },
      billOfMaterials: {
        findUnique: async ({ where }: { where: { id: number } }) => structuredClone(s.boms.find(row => row.id === where.id) ?? null),
        findUniqueOrThrow: async ({ where }: { where: { id: number } }) => { const bom = s.boms.find(row => row.id === where.id); if (!bom) throw new Error('BOM not found'); return structuredClone(bom) },
        delete: async ({ where }: { where: { id: number } }) => { assert.equal(s.jobs.some(row => row.bomId === where.id), false); s.boms = s.boms.filter(row => row.id !== where.id); fail('bom') },
      },
      productionOrder: {
        findMany: async ({ where, take }: { where: { bomId: number }; take: number }) => structuredClone(s.jobs.filter(row => row.bomId === where.bomId).sort((a, b) => a.id - b.id).slice(0, take)),
        deleteMany: async ({ where }: { where: { id: { in: number[] }; bomId: number; status: string; qualityStatus: string; archivedAt: { not: null } } }) => {
          const removed = s.jobs.filter(row => where.id.in.includes(row.id) && row.bomId === where.bomId && row.status === where.status && row.qualityStatus === where.qualityStatus && row.archivedAt !== null)
          assert.ok(removed.every(row => !row.consumptions.length && !row.productionSteps.length))
          s.jobs = s.jobs.filter(row => !removed.includes(row)); fail('orders')
          return { count: failure === 'orders-count' ? 0 : removed.length }
        },
      },
      stockLedger: {
        findMany: async ({ where, take }: { where: { referenceType: string | { in: string[] }; referenceId: { in: number[] } }; take: number }) => structuredClone(s.ledger.filter(row => (typeof where.referenceType === 'string' ? row.referenceType === where.referenceType : where.referenceType.in.includes(row.referenceType!)) && where.referenceId.in.includes(row.referenceId!)).sort((a, b) => a.id - b.id).slice(0, take)),
        updateMany: async ({ where, data }: { where: { id: number; referenceId: number; referenceType: string }; data: Partial<Ledger> }) => {
          assert.deepEqual(Object.keys(data).sort(), ['notes', 'referenceId', 'referenceType'])
          const row = s.ledger.find(row => row.id === where.id && row.referenceId === where.referenceId && row.referenceType === where.referenceType)
          if (row) Object.assign(row, data); fail('ledger')
          return { count: failure === 'ledger-count' ? 0 : row ? 1 : 0 }
        },
      },
      scrapInventory: {
        findMany: async ({ where, take }: { where: { OR: [{ productionOrderId: { in: number[] } }, { materialConsumptionId: { in: number[] } }] }; take: number }) => structuredClone(s.scrap.filter(row => where.OR[0].productionOrderId.in.includes(row.productionOrderId!) || where.OR[1].materialConsumptionId.in.includes(row.materialConsumptionId!)).sort((a, b) => a.id - b.id).slice(0, take)),
        deleteMany: async ({ where }: { where: { id: { in: number[] } } }) => { const before = s.scrap.length; s.scrap = s.scrap.filter(row => !where.id.in.includes(row.id)); fail('scrap'); return { count: failure === 'scrap-count' ? 0 : before - s.scrap.length } },
      },
      materialConsumption: { deleteMany: async ({ where }: { where: { productionOrderId: { in: number[] } } }) => { let count = 0; for (const job of s.jobs.filter(row => where.productionOrderId.in.includes(row.id))) { count += job.consumptions.length; job.consumptions = [] } fail('consumptions'); return { count: failure === 'consumptions-count' ? 0 : count } } },
      productionStep: { deleteMany: async ({ where }: { where: { productionOrderId: { in: number[] } } }) => { let count = 0; for (const job of s.jobs.filter(row => where.productionOrderId.in.includes(row.id))) { count += job.productionSteps.length; job.productionSteps = [] } fail('steps'); return { count: failure === 'steps-count' ? 0 : count } } },
      productionCleanupAudit: { create: async ({ data }: { data: Omit<typeof s.audit[number], 'id'> }) => { const row = { id: s.audit.length + 1, ...data }; s.audit.push(row); fail('audit'); return row } },
    } as unknown as Prisma.TransactionClient
    const result = await operation(tx); holder.state = s; return result
  }
  return { holder, run, calls }
}

async function requestFor(f: ReturnType<typeof fixture>) {
  const preview = await f.run(tx => previewPermanentBomCleanup(tx, 1))
  return { bomId: 1, revision: preview.revision, confirmation: preview.confirmation, reason: 'Permanent cleanup requested by owner', acknowledge: true as const }
}

test('preview is read-only and names the exact BOM, jobs, removed records and preserved ledger', async () => {
  const f = fixture(); const before = structuredClone(f.holder.state)
  const preview = await f.run(tx => previewPermanentBomCleanup(tx, 1))
  assert.equal(preview.bomName, 'kosmo 900 desk'); assert.equal(preview.confirmation, 'DELETE BOM 1')
  assert.deepEqual(preview.orders.map(row => row.displayId), ['PRD-0001'])
  assert.deepEqual(preview.counts, { orders: 1, bomItems: 1, bomSteps: 1, productionSteps: 1, consumptions: 1, scrapHistory: 1, retainedLedger: 3, removedJobCosts: 53 })
  assert.deepEqual(preview.blockers, []); assert.deepEqual(f.holder.state, before)
  assert.match(f.calls[0], /pg_advisory_xact_lock\(742013\)/)
})

test('permanent cleanup deletes only selected recipe/archived failed jobs while preserving stock, allocations and invoices', async () => {
  const f = fixture(); const request = await requestFor(f); const before = structuredClone(f.holder.state)
  const result = await f.run(tx => permanentlyDeleteBomAndFailedJobs(tx, request, 'Signed-in Admin'))
  assert.deepEqual(f.holder.state.boms, [before.boms[1]]); assert.deepEqual(f.holder.state.jobs, [before.jobs[1]])
  assert.deepEqual(f.holder.state.scrap, [before.scrap[1]])
  for (const key of ['products', 'godownStocks', 'batches', 'movements', 'invoices'] as const) assert.deepEqual(f.holder.state[key], before[key])
  for (const id of [101, 102, 103]) {
    const row = f.holder.state.ledger.find(row => row.id === id)!; const original = before.ledger.find(row => row.id === id)!
    assert.deepEqual(row, { ...original, referenceType: 'ProductionCleanup', referenceId: null, notes: row.notes })
    assert.match(row.notes!, /Original/); assert.match(row.notes!, /Signed-in Admin/)
  }
  assert.deepEqual(f.holder.state.ledger.filter(row => row.id >= 200), before.ledger.filter(row => row.id >= 200))
  assert.equal(f.holder.state.audit[0].maxOrderNumber, BigInt(1)); assert.equal(result.auditId, 1)
})

for (const [status, quality, archived] of [['IN_PROGRESS', 'FAILED', true], ['PLANNED', 'FAILED', true], ['ON_HOLD', 'FAILED', true], ['CANCELLED', 'FAILED', true], ['COMPLETED', 'PASSED', true], ['COMPLETED', 'PARTIAL', true], ['COMPLETED', 'FAILED', false]] as const) test(`${status}/${quality}/${archived} blocks all cleanup, even with fresh preview`, async () => {
  const f = fixture(); Object.assign(f.holder.state.jobs[0], { status, qualityStatus: quality, archivedAt: archived ? new Date('2026-10-13') : null })
  const request = await requestFor(f); const before = structuredClone(f.holder.state)
  await assert.rejects(f.run(tx => permanentlyDeleteBomAndFailedJobs(tx, request, 'Admin')), /only archived/)
  assert.deepEqual(f.holder.state, before)
})

for (const blocker of ['customer-order', 'customer-inventory', 'live-scrap', 'invalid-scrap', 'cross-scrap', 'unknown-scrap', 'foreign-ledger', 'foreign-scrap-ledger']) test(`${blocker} is protected without any partial cleanup`, async () => {
  const f = fixture(); const s = f.holder.state
  if (blocker === 'customer-order') s.jobs[0].customOrderId = 100
  if (blocker === 'customer-inventory') s.jobs[0].customInventoryItems = [{ id: 100 }]
  if (blocker === 'live-scrap') s.scrap[0].status = 'IN_STOCK'
  if (blocker === 'invalid-scrap') s.scrap[0].quantity = -1
  if (blocker === 'cross-scrap') s.scrap[0].productionOrderId = 2
  if (blocker === 'unknown-scrap') s.scrap[0].status = 'UNKNOWN'
  if (blocker === 'foreign-ledger') s.ledger[0].productId = 999
  if (blocker === 'foreign-scrap-ledger') s.ledger[2].productId = 999
  const request = await requestFor(f); const before = structuredClone(s)
  await assert.rejects(f.run(tx => permanentlyDeleteBomAndFailedJobs(tx, request, 'Admin')))
  assert.deepEqual(f.holder.state, before)
})

test('stale previews caused by new jobs, restored jobs, recipe edits or ledger changes cannot delete', async () => {
  for (const change of ['new-job', 'restored', 'recipe', 'ledger']) {
    const f = fixture(); const request = await requestFor(f)
    if (change === 'new-job') f.holder.state.jobs.push({ ...structuredClone(f.holder.state.jobs[0]), id: 3, displayId: 'PRD-0003' })
    if (change === 'restored') f.holder.state.jobs[0].archivedAt = null
    if (change === 'recipe') f.holder.state.boms[0].name = 'Changed name'
    if (change === 'ledger') f.holder.state.ledger[0].notes = 'Changed notes'
    const before = structuredClone(f.holder.state)
    await assert.rejects(f.run(tx => permanentlyDeleteBomAndFailedJobs(tx, request, 'Admin')), /changed.*Refresh/)
    assert.deepEqual(f.holder.state, before)
  }
})

test('explicit confirmation, acknowledgement, valid scope and bounded reason are mandatory', async () => {
  const f = fixture(); const valid = await requestFor(f)
  for (const change of [{ acknowledge: false }, { confirmation: 'DELETE BOM 2' }, { reason: '' }, { reason: 'x'.repeat(501) }, { revision: 'bad' }, { bomId: -1 }, { actor: 'Forged admin' }]) {
    const before = structuredClone(f.holder.state)
    await assert.rejects(f.run(tx => permanentlyDeleteBomAndFailedJobs(tx, { ...valid, ...change }, 'Admin')))
    assert.deepEqual(f.holder.state, before)
  }
})

for (const failure of ['audit', 'ledger', 'ledger-count', 'scrap', 'scrap-count', 'consumptions', 'consumptions-count', 'steps', 'steps-count', 'orders', 'orders-count', 'bom']) test(`${failure} failure rolls back every affected record including audit and ledger notes`, async () => {
  const f = fixture(failure); const request = await requestFor(f); const before = structuredClone(f.holder.state)
  await assert.rejects(f.run(tx => permanentlyDeleteBomAndFailedJobs(tx, request, 'Admin')))
  assert.deepEqual(f.holder.state, before)
})

test('duplicate cleanup cannot create another audit or change unrelated entities', async () => {
  const f = fixture(); const request = await requestFor(f)
  await f.run(tx => permanentlyDeleteBomAndFailedJobs(tx, request, 'Admin'))
  const after = structuredClone(f.holder.state)
  await assert.rejects(f.run(tx => permanentlyDeleteBomAndFailedJobs(tx, request, 'Admin')), /BOM not found/)
  assert.deepEqual(f.holder.state, after)
})

test('deleted production numbers are retained without resetting or reusing display IDs', async () => {
  const f = fixture(); f.holder.state.jobs[0].displayId = 'PRD-0099'
  const request = await requestFor(f); await f.run(tx => permanentlyDeleteBomAndFailedJobs(tx, request, 'Admin'))
  assert.equal(nextProductionDisplayId(f.holder.state.audit[0].maxOrderNumber), 'PRD-0100')
  assert.equal(productionNumber('Legacy custom'), BigInt(0))
  assert.throws(() => nextProductionDisplayId(BigInt(Number.MAX_SAFE_INTEGER)), /limit/)
})

test('bounded history blocks deletion rather than timing out with partial results', async () => {
  const f = fixture(); const original = f.holder.state.ledger[0]
  f.holder.state.ledger.push(...Array.from({ length: 1001 }, (_, index) => ({ ...original, id: 1000 + index })))
  const request = await requestFor(f); const before = structuredClone(f.holder.state)
  await assert.rejects(f.run(tx => permanentlyDeleteBomAndFailedJobs(tx, request, 'Admin')), /too large/)
  assert.deepEqual(f.holder.state, before)
})

test('cleanup API is admin-only and additive migration does not touch existing records', () => {
  const actions = readFileSync(new URL('../../app/actions/manufacturing.ts', import.meta.url), 'utf8')
  assert.match(actions, /permanentlyDeleteBOM\(input[\s\S]*?requireRole\('ADMIN'\)/)
  assert.match(actions, /getPermanentBomCleanupPreview\(bomId[\s\S]*?requireRole\('ADMIN'\)/)
  assert.match(actions, /GREATEST[\s\S]*MAX\("maxOrderNumber"\)[\s\S]*ProductionCleanupAudit/)
  const sql = readFileSync(new URL('../../prisma/migrations/20261014100000_production_cleanup_audit/migration.sql', import.meta.url), 'utf8')
  assert.doesNotMatch(sql, /^\s*(DELETE|UPDATE|DROP|TRUNCATE)\b/im)
  assert.match(sql, /CREATE TABLE "ProductionCleanupAudit"/)
})
