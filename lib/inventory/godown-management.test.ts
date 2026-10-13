import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import type { Prisma } from '@prisma/client'
import { saveBranch, removeBranch, saveGodown, chooseDefaultGodown, removeGodown, requestStockTransfer, cancelPendingTransfer, draftNeedsGodown } from './godown-management'
import { updateBranchSchema, updateGodownSchema, createTransferSchema } from '../validations/godown'
import { godownTotals, godownUnitValue } from './godown-values'

type Branch = { id: number; name: string; isHeadOffice: boolean }
type Godown = { id: number; name: string; type: string; isDefault: boolean; branchId: number | null; capacity: number | null; _count: { ledgerEntries: number; transfersFrom: number; transfersTo: number; orders: number } }
type Product = { id: number; name: string; sku: string; stock: number }
type Stock = { id: number; productId: number; godownId: number; quantity: number }
type Transfer = { id: number; status: string; requestedBy: string; displayId: string; items: unknown[] }
const now = new Date('2026-10-13T00:00:00Z')
// Copy-on-commit fixture, no lib/db import, real connections or DATABASE_URL.
function fixture(failDelete = false) {
  const holder = { state: {
    branches: [{ id: 1, name: 'HQ', isHeadOffice: true }] as Branch[],
    godowns: [1, 2].map(id => ({ id, name: `Unit ${id}`, type: 'Factory', isDefault: id === 1, branchId: 1, capacity: 50, _count: { ledgerEntries: 0, transfersFrom: 0, transfersTo: 0, orders: 0 } })) as Godown[],
    products: [{ id: 1, name: 'Fabric', sku: 'FABRIC', stock: 2.5 }] as Product[],
    stocks: [{ id: 1, productId: 1, godownId: 1, quantity: 2.5 }, { id: 2, productId: 1, godownId: 2, quantity: 0 }] as Stock[],
    ledger: [] as unknown[],
    drafts: [] as { sourceType: string; expiresAt: Date; data: unknown }[],
    transfers: [] as Transfer[],
  } }
  const locks: string[] = []
  const run = async <T>(operation: (tx: Prisma.TransactionClient) => Promise<T>) => {
    const s = structuredClone(holder.state)
    const tx = {
      $queryRaw: async (query: TemplateStringsArray, ...values: unknown[]) => { locks.push(query.join('?') + JSON.stringify(values)); return [] },
      branch: {
        findUnique: async ({ where }: { where: { id: number } }) => s.branches.find(b => b.id === where.id) ?? null,
        updateMany: async ({ data }: { data: Partial<Branch> }) => s.branches.forEach(b => Object.assign(b, data)),
        create: async ({ data }: { data: Omit<Branch, 'id'> }) => { const row = { id: s.branches.length + 1, ...data }; s.branches.push(row); return row },
        update: async ({ where, data }: { where: { id: number }; data: Partial<Branch> }) => Object.assign(s.branches.find(b => b.id === where.id)!, data),
        delete: async ({ where }: { where: { id: number } }) => { s.branches = s.branches.filter(b => b.id !== where.id) },
      },
      godown: {
        findUnique: async ({ where }: { where: { id: number } }) => s.godowns.find(g => g.id === where.id) ?? null,
        count: async ({ where }: { where?: { branchId?: number; id?: { in: number[] } } } = {}) => s.godowns.filter(g => !where || (where.branchId === undefined || g.branchId === where.branchId) && (!where.id || where.id.in.includes(g.id))).length,
        updateMany: async ({ data }: { data: Partial<Godown> }) => s.godowns.forEach(g => Object.assign(g, data)),
        create: async ({ data }: { data: Omit<Godown, 'id' | '_count'> }) => { const row = { id: s.godowns.length + 1, _count: { ledgerEntries: 0, transfersFrom: 0, transfersTo: 0, orders: 0 }, ...data }; s.godowns.push(row); return row },
        update: async ({ where, data }: { where: { id: number }; data: Partial<Godown> }) => Object.assign(s.godowns.find(g => g.id === where.id)!, data),
        delete: async ({ where }: { where: { id: number } }) => { if (failDelete) throw new Error('Injected FK failure'); s.godowns = s.godowns.filter(g => g.id !== where.id) },
      },
      product: { findUnique: async ({ where }: { where: { id: number } }) => s.products.find(p => p.id === where.id) ?? null },
      godownStock: {
        findMany: async ({ where }: { where: { productId?: number; godownId?: number } }) => s.stocks.filter(row => (where.productId === undefined || row.productId === where.productId) && (where.godownId === undefined || row.godownId === where.godownId)).map(row => ({ ...row, product: s.products.find(p => p.id === row.productId)! })),
        findUnique: async ({ where }: { where: { productId_godownId: { productId: number; godownId: number } } }) => s.stocks.find(row => row.productId === where.productId_godownId.productId && row.godownId === where.productId_godownId.godownId) ?? null,
        aggregate: async ({ where }: { where: { productId: number } }) => ({ _sum: { quantity: s.stocks.filter(row => row.productId === where.productId).reduce((sum, row) => sum + row.quantity, 0) } }),
        deleteMany: async ({ where }: { where: { godownId: number; quantity: number } }) => { s.stocks = s.stocks.filter(row => !(row.godownId === where.godownId && row.quantity === where.quantity)) },
      },
      draft: { findMany: async ({ where }: { where: { sourceType: string; expiresAt: { gte: Date } } }) => s.drafts.filter(d => d.sourceType === where.sourceType && d.expiresAt >= where.expiresAt.gte) },
      godownTransfer: {
        create: async ({ data }: { data: { requestedBy: string; displayId: string; items: { create: unknown[] } } }) => { const row = { id: s.transfers.length + 1, status: 'Pending', ...data, items: data.items.create }; s.transfers.push(row); return row },
        findUnique: async ({ where }: { where: { id: number } }) => s.transfers.find(t => t.id === where.id) ?? null,
        update: async ({ where, data }: { where: { id: number }; data: Partial<Transfer> }) => Object.assign(s.transfers.find(t => t.id === where.id)!, data),
      },
    } as unknown as Prisma.TransactionClient
    const result = await operation(tx)
    holder.state = s
    return result
  }
  return { holder, run, locks }
}

test('partial edit validation has no creation defaults and rejects unsafe/empty edits', () => {
  assert.deepEqual(updateGodownSchema.parse({ name: ' Renamed ' }), { name: 'Renamed' })
  assert.deepEqual(updateBranchSchema.parse({ name: 'New HQ' }), { name: 'New HQ' })
  assert.deepEqual(updateGodownSchema.parse({ branchId: null, capacity: null }), { branchId: null, capacity: null })
  for (const data of [{}, { stock: 100 }, { capacity: 0 }, { branchId: 0 }, { name: ' ' }]) assert.equal(updateGodownSchema.safeParse(data).success, false)
})

test('godown metadata edits preserve type/default/physical totals and clear optional fields', async () => {
  const f = fixture(); const before = structuredClone(f.holder.state)
  await f.run(tx => saveGodown(tx, { name: 'Factory renamed', branchId: null, capacity: null }, 1))
  assert.deepEqual(f.holder.state.godowns[0], { ...before.godowns[0], name: 'Factory renamed', branchId: null, capacity: null })
  for (const key of ['stocks', 'products', 'ledger', 'transfers'] as const) assert.deepEqual(f.holder.state[key], before[key])
  assert.ok(f.locks.some(lock => lock.includes('pg_advisory_xact_lock')))
})

test('branch name edit preserves HQ; explicitly selecting a new HQ replaces previous flag', async () => {
  const f = fixture()
  await f.run(tx => saveBranch(tx, { name: 'HQ renamed' }, 1))
  assert.equal(f.holder.state.branches[0].isHeadOffice, true)
  await f.run(tx => saveBranch(tx, { name: 'Second HQ', isHeadOffice: true }))
  assert.deepEqual(f.holder.state.branches.map(b => b.isHeadOffice), [false, true])
})

test('first godown is default and another default can only be selected explicitly', async () => {
  const f = fixture(); f.holder.state.godowns = []; f.holder.state.stocks = []
  await f.run(tx => saveGodown(tx, { name: 'First', isDefault: false }))
  assert.equal(f.holder.state.godowns[0].isDefault, true)
  await f.run(tx => saveGodown(tx, { name: 'Second' }))
  assert.deepEqual(f.holder.state.godowns.map(g => g.isDefault), [true, false])
  await f.run(tx => chooseDefaultGodown(tx, 2))
  assert.deepEqual(f.holder.state.godowns.map(g => g.isDefault), [false, true])
})

test('invalid/missing branch, godown and unsetting current default fail without data changes', async () => {
  const f = fixture(); const before = structuredClone(f.holder.state)
  for (const operation of [() => f.run(tx => saveGodown(tx, { name: 'Bad', branchId: 999 })), () => f.run(tx => saveGodown(tx, { isDefault: false }, 1)), () => f.run(tx => chooseDefaultGodown(tx, 999)), () => f.run(tx => saveGodown(tx, { name: 'Missing' }, 999)), () => f.run(tx => saveBranch(tx, { name: 'Missing' }, 999))]) {
    await assert.rejects(operation())
    assert.deepEqual(f.holder.state, before)
  }
})

test('branch deletion requires all godowns to be explicitly detached', async () => {
  const f = fixture(); const before = structuredClone(f.holder.state)
  await assert.rejects(f.run(tx => removeBranch(tx, 1)), /with godowns/)
  assert.deepEqual(f.holder.state, before)
  for (const g of f.holder.state.godowns) g.branchId = null
  await f.run(tx => removeBranch(tx, 1))
  assert.equal(f.holder.state.branches.length, 0)
  assert.deepEqual(f.holder.state.products, before.products)
})

test('empty godown deletion cleans only its zero assignments; other balances and products survive', async () => {
  const f = fixture(); const before = structuredClone(f.holder.state)
  await f.run(tx => removeGodown(tx, 2, now))
  assert.deepEqual(f.holder.state.stocks, [before.stocks[0]])
  assert.deepEqual(f.holder.state.godowns, [before.godowns[0]])
  assert.deepEqual(f.holder.state.products, before.products)
  assert.deepEqual(f.holder.state.ledger, before.ledger)
})

for (const quantity of [1, -1, NaN, Infinity]) test(`deleting nonzero/invalid godown (${quantity}) preserves all data`, async () => {
  const f = fixture(); f.holder.state.stocks[1].quantity = quantity
  const before = structuredClone(f.holder.state)
  await assert.rejects(f.run(tx => removeGodown(tx, 2, now)), /nonzero or invalid/)
  assert.deepEqual(f.holder.state, before)
})

for (const link of ['ledgerEntries', 'transfersFrom', 'transfersTo', 'orders'] as const) test(`linked ${link} prevents godown deletion`, async () => {
  const f = fixture(); f.holder.state.godowns[1]._count[link] = 1
  const before = structuredClone(f.holder.state)
  await assert.rejects(f.run(tx => removeGodown(tx, 2, now)), /history/)
  assert.deepEqual(f.holder.state, before)
})

test('empty default, total mismatch and final FK failure cannot partially delete assignments', async () => {
  const defaultFixture = fixture(); defaultFixture.holder.state.stocks = []; defaultFixture.holder.state.products = []
  const beforeDefault = structuredClone(defaultFixture.holder.state)
  await assert.rejects(defaultFixture.run(tx => removeGodown(tx, 1, now)), /another default/)
  assert.deepEqual(defaultFixture.holder.state, beforeDefault)
  const mismatch = fixture(); mismatch.holder.state.products[0].stock = 9
  const beforeMismatch = structuredClone(mismatch.holder.state)
  await assert.rejects(mismatch.run(tx => removeGodown(tx, 2, now)), /Stock mismatch/)
  assert.deepEqual(mismatch.holder.state, beforeMismatch)
  const failure = fixture(true); const beforeFailure = structuredClone(failure.holder.state)
  await assert.rejects(failure.run(tx => removeGodown(tx, 2, now)), /FK failure/)
  assert.deepEqual(failure.holder.state, beforeFailure)
})

test('recoverable product ledger snapshots protect required godown; expired ones do not', async () => {
  const f = fixture()
  f.holder.state.drafts.push({ sourceType: 'Product', expiresAt: new Date('2026-11-01'), data: { inventoryHistory: { ledger: [{ godownId: 2 }] } } })
  const before = structuredClone(f.holder.state)
  await assert.rejects(f.run(tx => removeGodown(tx, 2, now)), /Drafts/)
  assert.deepEqual(f.holder.state, before)
  f.holder.state.drafts[0].expiresAt = new Date('2026-10-01')
  await f.run(tx => removeGodown(tx, 2, now))
  assert.equal(f.holder.state.drafts.length, 1) // No purge or snapshot alteration.
  assert.equal(draftNeedsGodown(null, 2), false)
  assert.equal(draftNeedsGodown({ inventoryHistory: { ledger: 'invalid' } }, 2), false)
})

const transferInput = { fromGodownId: 1, toGodownId: 2, requestedBy: 'Forged admin', items: [{ productId: 1, name: 'Forged product', sku: 'FAKE', quantity: 0.75 }] }
test('transfer records authoritative metadata and actor without moving or reserving stock', async () => {
  const f = fixture(); const before = structuredClone(f.holder.state)
  await f.run(tx => requestStockTransfer(tx, transferInput, 'Signed-in Manager'))
  const transfer = f.holder.state.transfers[0]
  assert.equal(transfer.requestedBy, 'Signed-in Manager')
  assert.equal(transfer.status, 'Pending')
  assert.deepEqual(transfer.items, [{ productId: 1, name: 'Fabric', sku: 'FABRIC', quantity: 0.75 }])
  assert.deepEqual(f.holder.state.stocks, before.stocks)
  assert.deepEqual(f.holder.state.products, before.products)
  assert.deepEqual(f.holder.state.ledger, before.ledger)
})

test('source availability, missing locations, duplicates and incomplete rows reject entire request', async () => {
  const f = fixture(); const before = structuredClone(f.holder.state)
  for (const input of [{ ...transferInput, toGodownId: 999 }, { ...transferInput, items: [{ productId: 1, quantity: 3 }] }, { ...transferInput, items: [transferInput.items[0], transferInput.items[0]] }, { ...transferInput, items: [transferInput.items[0], { productId: 0, quantity: 1 }] }, { ...transferInput, items: [transferInput.items[0], { productId: 999, quantity: 1 }] }]) {
    await assert.rejects(f.run(tx => requestStockTransfer(tx, input, 'Manager')))
    assert.deepEqual(f.holder.state, before)
  }
  assert.equal(createTransferSchema.safeParse({ ...transferInput, items: Array.from({ length: 201 }, (_, i) => ({ productId: i + 1, quantity: 1 })) }).success, false)
})

test('pending cancellation is idempotent, preserves stock/history and protects completed transfer', async () => {
  const f = fixture()
  await f.run(tx => requestStockTransfer(tx, transferInput, 'Manager'))
  const before = structuredClone(f.holder.state)
  await f.run(tx => cancelPendingTransfer(tx, 1))
  assert.equal(f.holder.state.transfers[0].status, 'Cancelled')
  const cancelled = structuredClone(f.holder.state)
  await f.run(tx => cancelPendingTransfer(tx, 1))
  assert.deepEqual(f.holder.state, cancelled)
  assert.deepEqual(f.holder.state.stocks, before.stocks)
  assert.deepEqual(f.holder.state.ledger, before.ledger)
  f.holder.state.transfers[0].status = 'Completed'
  const completed = structuredClone(f.holder.state)
  await assert.rejects(f.run(tx => cancelPendingTransfer(tx, 1)), /Only a pending/)
  await assert.rejects(f.run(tx => cancelPendingTransfer(tx, 999)), /not found/)
  assert.deepEqual(f.holder.state, completed)
})

test('stock view and summary share category-aware value including zero cost', () => {
  assert.equal(godownUnitValue({ category: 'raw materials', price: 999, costPrice: 30 }), 30)
  assert.equal(godownUnitValue({ category: { name: 'Consumable Items' }, price: 999, costPrice: 0 }), 0)
  assert.equal(godownUnitValue({ category: { name: 'Office Chairs' }, price: 200, costPrice: 120 }), 200)
  const rows = [{ quantity: 1.5, product: { category: 'Raw Material', unitOfMeasure: 'KG', costPrice: 100, price: 999 } }, { quantity: 2, product: { category: 'Furniture', unitOfMeasure: 'PCS', costPrice: 50, price: 200 } }]
  const before = structuredClone(rows)
  const result = godownTotals(rows, 10)
  assert.equal(result.totalValue, 550)
  assert.equal(result.totalCostValue, 250)
  assert.equal(result.totalItems, 3.5)
  assert.equal(result.utilization, null)
  assert.equal(result.mixedUnits, true)
  assert.equal(godownTotals([rows[0]], 10).utilization, 15)
  assert.deepEqual(rows, before)
})

test('transfer migration widens only the quantity column and preserves existing integer values', () => {
  const sql = readFileSync(new URL('../../prisma/migrations/20261013110000_godown_fractional_transfers/migration.sql', import.meta.url), 'utf8')
  assert.match(sql, /ALTER TABLE "GodownTransferItem"\s+ALTER COLUMN "quantity" TYPE DOUBLE PRECISION USING "quantity"::double precision;/)
  assert.doesNotMatch(sql, /^\s*(DELETE|TRUNCATE|DROP|UPDATE)\b/im)
  for (const integer of [0, 1, 999, 2147483647, -2147483648]) assert.equal(Number(BigInt(integer)), integer)
})
