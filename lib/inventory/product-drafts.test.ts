import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Prisma, PrismaClient } from '@prisma/client'
import { inventoryTransaction } from './stock'
import { moveInventoryProductToDraft, restoreEmptyGodownStocks } from './product-drafts'

// No lib/db, environment variables or external services: all tests run against
// a copy-on-commit fixture, including failures after a draft/cleanup is written.
const links = {
  bomItem: 'rawMaterialId', billOfMaterials: 'finishedProductId', productionOrder: 'finishedProductId',
  order: 'productId', quotationItem: 'productId', invoiceItem: 'productId',
  purchaseOrderItem: 'productId', purchaseReturnItem: 'productId', stockLedger: 'productId',
  productBatch: 'productId', materialConsumption: 'rawMaterialId', scrapInventory: 'rawMaterialId',
  customOrderInventory: 'productId', godownTransferItem: 'productId', customOrder: 'referenceProductId',
}
function fixture() {
  const item = {
    id: 1, sku: 'RM-010', name: 'ADJUSTER', categoryId: 1, category: { id: 1, name: 'Raw Material' },
    stock: 0, sold: 0, price: 0, bulkPrice: null, brand: 'Example', unitSize: 1,
    createdAt: new Date('2026-01-01'), lastRestocked: null, reorderLevel: 5,
    image: '/uploads/unchanged.png', material: null, color: null, description: 'Existing description',
    warehouseId: null, warehouse: null, hsnCode: '8302', unitOfMeasure: 'PCS', costPrice: 80,
    stockGroupId: null, stockGroup: null,
  }
  let state: Record<string, any[]> = {
    product: [item, { ...structuredClone(item), id: 2, sku: 'OTHER', stock: 9 }],
    godown: [{ id: 1, name: 'Main' }, { id: 2, name: 'Factory' }],
    godownStock: [{ id: 1, productId: 1, godownId: 1, quantity: 0 }, { id: 2, productId: 1, godownId: 2, quantity: 0 }, { id: 3, productId: 2, godownId: 1, quantity: 9 }],
    draft: [], ...Object.fromEntries(Object.keys(links).map(key => [key, []])),
  }
  let failAt = ''
  const calls: string[] = []
  const db = { $transaction: async (operation: (tx: Prisma.TransactionClient) => Promise<unknown>, options: unknown) => {
    assert.deepEqual(options, { isolationLevel: 'Serializable', maxWait: 10000, timeout: 20000 })
    const copy = structuredClone(state)
    const match = (row: any, where: Record<string, any>) => Object.entries(where).every(([key, value]) => row[key] === value)
    const tx: any = {
      $queryRaw: async (_sql: unknown, id: number) => { calls.push('lock'); assert.equal(id, 1); return [] },
      product: {
        findUnique: async ({ where }: any) => structuredClone(copy.product.find(row => row.id === where.id) ?? null),
        create: async ({ data }: any) => { const row = { ...structuredClone(item), ...data, id: Math.max(...copy.product.map(row => row.id)) + 1 }; copy.product.push(row); return row },
        delete: async ({ where }: any) => {
          calls.push('delete'); if (failAt === 'delete') throw new Error('Injected product delete failure')
          assert.equal(copy.godownStock.some(row => row.productId === where.id), false, 'FK must have no remaining balance rows')
          copy.product = copy.product.filter(row => row.id !== where.id)
        },
      },
      godownStock: {
        findMany: async ({ where }: any) => structuredClone(copy.godownStock.filter(row => row.productId === where.productId)),
        deleteMany: async ({ where }: any) => {
          calls.push('cleanup'); assert.deepEqual(where, { productId: 1, quantity: 0 })
          if (failAt === 'cleanup') throw new Error('Injected cleanup failure')
          const before = copy.godownStock.length
          copy.godownStock = copy.godownStock.filter(row => !match(row, where))
          return { count: failAt === 'changed' ? 0 : before - copy.godownStock.length }
        },
        upsert: async ({ where, create, update }: any) => {
          calls.push('restore-location'); if (failAt === 'restore') throw new Error('Injected restore failure')
          assert.deepEqual(update, {})
          const key = where.productId_godownId
          const found = copy.godownStock.find(row => row.productId === key.productId && row.godownId === key.godownId)
          if (found) return found
          const row = { id: Math.max(0, ...copy.godownStock.map(row => row.id)) + 1, ...create }; copy.godownStock.push(row); return row
        },
      },
      godown: { findMany: async ({ where }: any) => copy.godown.filter(row => where.id.in.includes(row.id)) },
      draft: {
        create: async ({ data }: any) => { calls.push('draft'); if (failAt === 'draft') throw new Error('Injected draft failure'); copy.draft.push({ id: copy.draft.length + 1, ...data }) },
        delete: async ({ where }: any) => { copy.draft = copy.draft.filter(row => row.id !== where.id) },
      },
    }
    for (const [model, field] of Object.entries(links)) tx[model] = { count: async ({ where }: any) => {
      assert.deepEqual(where, { [field]: 1 }); return copy[model].filter(row => row[field] === 1).length
    } }
    const result = await operation(tx)
    state = copy
    return result
  } } as unknown as PrismaClient
  return { db, calls, state: () => state, fail: (step: string) => { failAt = step }, run: <T>(operation: (tx: Prisma.TransactionClient) => Promise<T>) => inventoryTransaction(db, operation) }
}

test('zero-quantity godown rows do not block unused raw material removal from the shared workflow', async () => {
  const f = fixture()
  const other = structuredClone(f.state().product[1])
  const now = new Date('2026-10-13T06:00:00Z')
  assert.deepEqual(await f.run(tx => moveInventoryProductToDraft(tx, 1, 'Test Manager', 'Raw Material', now)), { success: true })
  assert.deepEqual(f.state().product, [other])
  assert.deepEqual(f.state().godownStock, [{ id: 3, productId: 2, godownId: 1, quantity: 9 }])
  assert.deepEqual(f.calls, ['lock', 'draft', 'cleanup', 'delete'])
  const draft = f.state().draft[0]
  assert.equal(draft.deletedBy, 'Test Manager')
  assert.equal(draft.sourceType, 'Product')
  assert.equal(draft.sourceId, 'RM-010')
  assert.equal(draft.expiresAt.getTime() - now.getTime(), 30 * 24 * 60 * 60 * 1000)
  assert.deepEqual(draft.data.emptyGodownIds, [1, 2])
  assert.equal(draft.data.costPrice, 80)
  assert.equal(draft.data.hsnCode, '8302')
  assert.equal(draft.data.description, 'Existing description')
  assert.equal(draft.data.image, '/uploads/unchanged.png')
})

test('never-allocated zero-stock items can be removed without creating godowns or ledger history', async () => {
  const f = fixture()
  f.state().godownStock = f.state().godownStock.filter(row => row.productId !== 1)
  await f.run(tx => moveInventoryProductToDraft(tx, 1, 'Manager'))
  assert.deepEqual(f.state().draft[0].data.emptyGodownIds, [])
  assert.equal(f.state().stockLedger.length, 0)
  assert.equal(f.state().godown.length, 2)
})

for (const [title, change] of [
  ['positive product stock', (s: any) => { s.product[0].stock = 3 }],
  ['hidden positive location stock', (s: any) => { s.godownStock[0].quantity = 3 }],
  ['tiny unrounded stock', (s: any) => { s.product[0].stock = 0.00000001 }],
  ['negative location stock', (s: any) => { s.godownStock[0].quantity = -1 }],
  ['offsetting location balances', (s: any) => { s.godownStock[0].quantity = 1; s.godownStock[1].quantity = -1 }],
  ['invalid product balance', (s: any) => { s.product[0].stock = Number.NaN }],
] as const) test(`${title} blocks deletion and preserves all balances`, async () => {
  const f = fixture(); change(f.state()); const before = structuredClone(f.state())
  await assert.rejects(f.run(tx => moveInventoryProductToDraft(tx, 1, 'Manager')), /stock balances|stock remains/)
  assert.deepEqual(f.state(), before)
  assert.deepEqual(f.calls, ['lock'])
})

for (const [model, field] of Object.entries(links)) test(`${model} links/history are preserved even with zero stock`, async () => {
  const f = fixture(); f.state()[model].push({ id: 11, [field]: 1 }); const before = structuredClone(f.state())
  await assert.rejects(f.run(tx => moveInventoryProductToDraft(tx, 1, 'Manager')), /Zero stock does not remove linked history/)
  assert.deepEqual(f.state(), before)
  assert.deepEqual(f.calls, ['lock'])
})

for (const step of ['draft', 'cleanup', 'delete', 'changed']) test(`${step} failure rolls back the snapshot and zero-row cleanup together`, async () => {
  const f = fixture(); const before = structuredClone(f.state()); f.fail(step)
  await assert.rejects(f.run(tx => moveInventoryProductToDraft(tx, 1, 'Manager')), /failure|Stock changed/)
  assert.deepEqual(f.state(), before)
})

test('canonical legacy raw-material categories work, but a finished product cannot use raw-material deletion', async () => {
  for (const name of ['Raw Materials', ' raw material ']) {
    const f = fixture(); f.state().product[0].category.name = name
    await f.run(tx => moveInventoryProductToDraft(tx, 1, 'Manager', 'Raw Material'))
  }
  const f = fixture(); f.state().product[0].category.name = 'Finished Goods'; const before = structuredClone(f.state())
  await assert.rejects(f.run(tx => moveInventoryProductToDraft(tx, 1, 'Manager', 'Raw Material')), /Raw material not found/)
  assert.deepEqual(f.state(), before)
})

test('duplicate deletion produces one recoverable draft, not two', async () => {
  const f = fixture()
  await f.run(tx => moveInventoryProductToDraft(tx, 1, 'Manager'))
  const after = structuredClone(f.state())
  await assert.rejects(f.run(tx => moveInventoryProductToDraft(tx, 1, 'Manager')), /Product not found/)
  assert.deepEqual(f.state(), after)
})

test('invalid IDs cannot write or execute stock cleanup', async () => {
  for (const id of [0, -1, 1.5, NaN, Number.MAX_SAFE_INTEGER + 1]) {
    const f = fixture(); const before = structuredClone(f.state())
    await assert.rejects(f.run(tx => moveInventoryProductToDraft(tx, id, 'Manager')), /Invalid product/)
    assert.deepEqual(f.state(), before); assert.deepEqual(f.calls, [])
  }
})

test('restore reinstates empty godown assignments and metadata without inventing stock or movements', async () => {
  const f = fixture()
  await f.run(tx => moveInventoryProductToDraft(tx, 1, 'Manager'))
  const data = f.state().draft[0].data
  await f.run(async tx => {
    const product = await tx.product.create({ data: { ...data, categoryId: data.categoryId, stock: 0 } })
    await restoreEmptyGodownStocks(tx, product.id, data.emptyGodownIds)
    await tx.draft.delete({ where: { id: 1 } })
  })
  assert.equal(f.state().draft.length, 0)
  const restored = f.state().product.find(row => row.sku === 'RM-010')!
  assert.equal(restored.costPrice, 80); assert.equal(restored.stock, 0)
  assert.deepEqual(f.state().godownStock.filter(row => row.productId === restored.id).map(row => [row.godownId, row.quantity]), [[1, 0], [2, 0]])
  assert.equal(f.state().stockLedger.length, 0)
  assert.equal(f.state().productBatch.length, 0)
})

test('restore skips a removed location, deduplicates IDs and does not create a godown', async () => {
  const f = fixture(); f.state().godownStock = f.state().godownStock.filter(row => row.productId !== 1)
  await f.run(tx => restoreEmptyGodownStocks(tx, 1, [1, 1, 999]))
  assert.equal(f.state().godown.length, 2)
  assert.deepEqual(f.state().godownStock.filter(row => row.productId === 1).map(row => row.godownId), [1])
})

test('legacy drafts without empty location data remain compatible', async () => {
  const f = fixture(); const before = structuredClone(f.state())
  await f.run(tx => restoreEmptyGodownStocks(tx, 1, undefined))
  assert.deepEqual(f.state(), before); assert.deepEqual(f.calls, [])
})

test('malformed location snapshots and a restore write failure leave the draft and data unchanged', async () => {
  for (const ids of [null, '1', [-1], [1.5], ['1']]) {
    const f = fixture(); const before = structuredClone(f.state())
    await assert.rejects(f.run(tx => restoreEmptyGodownStocks(tx, 1, ids)), /Invalid saved location/)
    assert.deepEqual(f.state(), before)
  }
  const f = fixture(); f.fail('restore'); const before = structuredClone(f.state())
  await assert.rejects(f.run(tx => restoreEmptyGodownStocks(tx, 1, [1])), /restore failure/)
  assert.deepEqual(f.state(), before)
})
