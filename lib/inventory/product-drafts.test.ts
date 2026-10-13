import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Prisma, PrismaClient } from '@prisma/client'
import { inventoryTransaction } from './stock'
import { moveInventoryProductToDraft, moveInventoryProductsToDraft, restoreEmptyGodownStocks } from './product-drafts'
import { restoreProductHistory } from './product-history'
import { restoreProductStockSnapshot } from './product-stock-snapshot'

// No lib/db, environment variables or external services: all tests run against
// a copy-on-commit fixture, including failures after a draft/cleanup is written.
const links = {
  bomItem: 'rawMaterialId', billOfMaterials: 'finishedProductId', productionOrder: 'finishedProductId',
  order: 'productId', quotationItem: 'productId', invoiceItem: 'productId',
  purchaseOrderItem: 'productId', purchaseReturnItem: 'productId',
  materialConsumption: 'rawMaterialId', scrapInventory: 'rawMaterialId',
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
    draft: [], stockLedger: [], productBatch: [], batchMovement: [], invoice: [], purchaseOrder: [], purchaseReturn: [], godownTransfer: [], ...Object.fromEntries(Object.keys(links).map(key => [key, []])),
  }
  let failAt = ''
  const calls: string[] = []
  const db = { $transaction: async (operation: (tx: Prisma.TransactionClient) => Promise<unknown>, options: unknown) => {
    assert.deepEqual(options, { isolationLevel: 'Serializable', maxWait: 10000, timeout: 20000 })
    const copy = structuredClone(state)
    const match = (row: any, where: Record<string, any>) => Object.entries(where).every(([key, value]) => row[key] === value)
    const tx: any = {
      $queryRaw: async (_sql: unknown, id: number) => { calls.push('lock'); assert.equal(Number.isSafeInteger(id) && id > 0, true); return [] },
      product: {
        findUnique: async ({ where }: any) => structuredClone(copy.product.find(row => row.id === where.id) ?? null),
        create: async ({ data }: any) => { const row = { ...structuredClone(item), ...data, id: Math.max(...copy.product.map(row => row.id)) + 1 }; copy.product.push(row); return row },
        update: async ({ where, data }: any) => Object.assign(copy.product.find(row => row.id === where.id), data),
        delete: async ({ where }: any) => {
          calls.push('delete'); if (failAt === 'delete') throw new Error('Injected product delete failure')
          assert.equal(copy.godownStock.some(row => row.productId === where.id), false, 'FK must have no remaining balance rows')
          assert.equal(copy.stockLedger.some(row => row.productId === where.id), false)
          assert.equal(copy.productBatch.some(row => row.productId === where.id), false)
          copy.product = copy.product.filter(row => row.id !== where.id)
        },
      },
      godownStock: {
        findMany: async ({ where }: any) => structuredClone(copy.godownStock.filter(row => row.productId === where.productId)),
        deleteMany: async ({ where }: any) => {
          calls.push('cleanup'); assert.ok(Number.isInteger(where.productId) && where.productId > 0)
          assert.ok(Object.keys(where).every(key => ['productId', 'quantity'].includes(key)))
          if ('quantity' in where) assert.equal(where.quantity, 0)
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
        create: async ({ data }: any) => {
          if (failAt === 'restore-stock') throw new Error('Injected stock restore failure')
          const row = { id: Math.max(0, ...copy.godownStock.map(row => row.id)) + 1, ...data }; copy.godownStock.push(row); return row
        },
      },
      godown: { findMany: async ({ where }: any) => copy.godown.filter(row => where.id.in.includes(row.id)) },
      draft: {
        create: async ({ data }: any) => { calls.push('draft'); if (failAt === 'draft') throw new Error('Injected draft failure'); copy.draft.push({ id: copy.draft.length + 1, ...data }) },
        delete: async ({ where }: any) => { copy.draft = copy.draft.filter(row => row.id !== where.id) },
      },
    }
    for (const [model, field] of Object.entries(links)) tx[model] = { count: async ({ where }: any) => {
      if ('id' in where) return copy[model].filter(row => row.id === where.id).length
      assert.ok(Number.isInteger(where[field]) && where[field] > 0); assert.deepEqual(Object.keys(where), [field]); return copy[model].filter(row => row[field] === where[field]).length
    } }
    for (const model of ['invoice', 'purchaseOrder', 'purchaseReturn', 'godownTransfer']) tx[model] = { count: async ({ where }: any) => copy[model].filter(row => row.id === where.id).length }
    for (const model of ['stockLedger', 'productBatch']) tx[model] = {
      findMany: async ({ where }: any) => structuredClone(copy[model].filter(row => row.productId === where.productId)),
      deleteMany: async ({ where }: any) => {
        calls.push(`remove-${model}`); if (failAt === model) throw new Error('Injected history removal failure')
        copy[model] = copy[model].filter(row => row.productId !== where.productId)
      },
      create: async ({ data }: any) => {
        if (failAt === `restore-${model}`) throw new Error('Injected history restoration failure')
        const row = { ...data, id: Math.max(100, ...copy[model].map(row => row.id)) + 1 }; copy[model].push(row); return row
      },
    }
    tx.batchMovement = {
      findMany: async ({ where }: any) => {
        const productId = where.OR[0].stockLedger.productId
        return copy.batchMovement.filter(row => copy.stockLedger.find(ledger => ledger.id === row.stockLedgerId)?.productId === productId || copy.productBatch.find(batch => batch.id === row.batchId)?.productId === productId).map(row => ({ ...row, stockLedger: copy.stockLedger.find(ledger => ledger.id === row.stockLedgerId), batch: copy.productBatch.find(batch => batch.id === row.batchId) ?? null }))
      },
      deleteMany: async ({ where }: any) => {
        calls.push('remove-movements'); if (failAt === 'batchMovement') throw new Error('Injected history removal failure')
        const ledgerIds = copy.stockLedger.filter(row => row.productId === where.stockLedger.productId).map(row => row.id)
        copy.batchMovement = copy.batchMovement.filter(row => !ledgerIds.includes(row.stockLedgerId))
      },
      create: async ({ data }: any) => { if (failAt === 'restore-batchMovement') throw new Error('Injected history restoration failure'); copy.batchMovement.push({ id: Math.max(100, ...copy.batchMovement.map(row => row.id)) + 1, ...data }) },
    }
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
  assert.deepEqual(f.calls, ['lock', 'draft', 'remove-movements', 'remove-productBatch', 'remove-stockLedger', 'cleanup', 'delete'])
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

function seedHistory(f: ReturnType<typeof fixture>) {
  const time = new Date('2026-01-15T10:00:00Z')
  const common = { productId: 1, godownId: 1, referenceType: 'Manual', referenceId: null, notes: 'Existing manual history', createdBy: 'Original operator', createdAt: time }
  f.state().stockLedger.push({ ...common, id: 10, entryType: 'IN', quantity: 10, balanceAfter: 10 }, { ...common, id: 11, entryType: 'OUT', quantity: -10, balanceAfter: 0 })
  f.state().productBatch.push({ id: 20, productId: 1, batchNumber: 'ORIGINAL-LOT', purchaseDate: time, expiryDate: null, quantity: 10, remainingQty: 0, costPrice: 80, supplierId: null, poId: null, createdAt: time })
  f.state().batchMovement.push({ id: 30, batchId: 20, stockLedgerId: 10, quantity: 10, createdAt: time }, { id: 31, batchId: 20, stockLedgerId: 11, quantity: -10, createdAt: time })
}

test('ledger-only item now deletes successfully instead of failing on history', async () => {
  const f = fixture(); seedHistory(f); f.state().productBatch = []; f.state().batchMovement = []
  await f.run(tx => moveInventoryProductToDraft(tx, 1, 'Manager'))
  assert.equal(f.state().stockLedger.length, 0)
  assert.equal(f.state().draft[0].data.inventoryHistory.ledger.length, 2)
})

for (const category of ['Raw Material', 'Consumable', 'Furniture']) test(`${category} deletion removes its ledger, depleted batches and allocations with a complete snapshot`, async () => {
  const f = fixture(); seedHistory(f); f.state().product[0].category.name = category
  f.state().stockLedger.push({ ...structuredClone(f.state().stockLedger[0]), productId: 2, id: 99 })
  await f.run(tx => moveInventoryProductToDraft(tx, 1, 'Manager'))
  assert.deepEqual(f.state().stockLedger.map(row => row.id), [99])
  assert.equal(f.state().productBatch.length, 0); assert.equal(f.state().batchMovement.length, 0)
  const history = f.state().draft[0].data.inventoryHistory
  assert.deepEqual(history.ledger.map((row: any) => row.id), [10, 11])
  assert.equal(history.batches[0].batchNumber, 'ORIGINAL-LOT')
  assert.deepEqual(history.movements.map((row: any) => row.quantity), [10, -10])
})

test('history restoration preserves timestamps, quantities and allocation links while remapping new IDs', async () => {
  const f = fixture(); seedHistory(f)
  await f.run(tx => moveInventoryProductToDraft(tx, 1, 'Manager'))
  const data = f.state().draft[0].data
  await f.run(async tx => {
    const product = await tx.product.create({ data: { ...data, stock: 0 } })
    await restoreEmptyGodownStocks(tx, product.id, data.emptyGodownIds)
    await restoreProductHistory(tx, product.id, data.inventoryHistory)
    await tx.draft.delete({ where: { id: 1 } })
  })
  const s = f.state(); const productId = s.product.find(row => row.sku === 'RM-010')!.id
  assert.equal(s.draft.length, 0)
  assert.deepEqual(s.stockLedger.map(row => [row.productId, row.quantity, row.balanceAfter, row.createdAt.toISOString()]), [[productId, 10, 10, '2026-01-15T10:00:00.000Z'], [productId, -10, 0, '2026-01-15T10:00:00.000Z']])
  assert.equal(s.productBatch[0].remainingQty, 0)
  assert.equal(s.batchMovement[0].stockLedgerId, s.stockLedger[0].id)
  assert.equal(s.batchMovement[1].stockLedgerId, s.stockLedger[1].id)
  assert.equal(s.batchMovement[0].batchId, s.productBatch[0].id)
  assert.notEqual(s.stockLedger[0].id, 10)
  assert.notEqual(s.productBatch[0].id, 20)
})

for (const step of ['batchMovement', 'productBatch', 'stockLedger', 'delete']) test(`removal failure at ${step} rolls back ALL history and the draft`, async () => {
  const f = fixture(); seedHistory(f); const before = structuredClone(f.state()); f.fail(step)
  await assert.rejects(f.run(tx => moveInventoryProductToDraft(tx, 1, 'Manager')), /failure/)
  assert.deepEqual(f.state(), before)
})

for (const step of ['stockLedger', 'productBatch', 'batchMovement']) test(`history restore failure at ${step} preserves the draft and rolls back reconstructed records`, async () => {
  const f = fixture(); seedHistory(f); await f.run(tx => moveInventoryProductToDraft(tx, 1, 'Manager'))
  const before = structuredClone(f.state()); const data = f.state().draft[0].data; f.fail(`restore-${step}`)
  await assert.rejects(f.run(async tx => { const product = await tx.product.create({ data: { ...data, stock: 0 } }); await restoreProductHistory(tx, product.id, data.inventoryHistory); await tx.draft.delete({ where: { id: 1 } }) }), /failure/)
  assert.deepEqual(f.state(), before)
})

test('nonzero lot balances, cross-product allocations and document-backed ledger references remain protected', async () => {
  for (const change of [
    (s: any) => { s.productBatch[0].remainingQty = 1 },
    (s: any) => { s.productBatch[0].productId = 2 },
    (s: any) => { s.stockLedger[0].referenceType = 'Invoice'; s.stockLedger[0].referenceId = 42; s.invoice.push({ id: 42 }) },
  ]) {
    const f = fixture(); seedHistory(f); change(f.state()); const before = structuredClone(f.state())
    await assert.rejects(f.run(tx => moveInventoryProductToDraft(tx, 1, 'Manager')), /Cannot delete/)
    assert.deepEqual(f.state(), before)
  }
})

test('bulk deletion deduplicates IDs, deletes permitted item history and reports protected stock without changing it', async () => {
  const f = fixture(); seedHistory(f); const other = structuredClone(f.state().product[1])
  const result = await moveInventoryProductsToDraft(f.db, [2, 1, 1], 'Manager')
  assert.deepEqual(result.movedIds, [1])
  assert.equal(result.errors[0].id, 2)
  assert.deepEqual(f.state().product, [other])
  assert.equal(f.state().draft.length, 1)
  assert.equal(f.state().stockLedger.length, 0)
})

test('missing history godown and tampered allocation snapshot cannot consume the draft', async () => {
  const f = fixture(); seedHistory(f); await f.run(tx => moveInventoryProductToDraft(tx, 1, 'Manager'))
  const saved = structuredClone(f.state().draft[0].data.inventoryHistory)
  saved.movements[0].stockLedgerId = 999
  const before = structuredClone(f.state())
  await assert.rejects(f.run(tx => restoreProductHistory(tx, 2, saved)), /Invalid inventory history/)
  assert.deepEqual(f.state(), before)
  f.state().godown = []
  await assert.rejects(f.run(tx => restoreProductHistory(tx, 2, f.state().draft[0].data.inventoryHistory)), /godown.*missing/)
})

test('empty invoice/production tables do not block old orphaned ledger references', async () => {
  for (const referenceType of ['Invoice', 'Production']) {
    const f = fixture(); seedHistory(f)
    f.state().stockLedger[0].referenceType = referenceType; f.state().stockLedger[0].referenceId = 42
    await f.run(tx => moveInventoryProductToDraft(tx, 1, 'Manager'))
    assert.equal(f.state().stockLedger.length, 0)
    assert.equal(f.state().draft[0].data.inventoryHistory.ledger[0].referenceId, 42)
  }
})

test('explicit stocked raw-material archive saves split balances and non-depleted history for exact restoration', async () => {
  const f = fixture(); seedHistory(f)
  f.state().product[0].stock = 2.5; f.state().product[0].unitSize = 5
  f.state().godownStock[0].quantity = 1.75; f.state().godownStock[1].quantity = 0.75
  f.state().productBatch[0].remainingQty = 2.5
  const before = structuredClone(f.state())
  await f.run(tx => moveInventoryProductToDraft(tx, 1, 'Manager', 'Raw Material', new Date('2026-10-13'), true))
  assert.deepEqual(f.state().product, [before.product[1]])
  assert.deepEqual(f.state().godownStock, [before.godownStock[2]])
  const data = f.state().draft[0].data
  assert.deepEqual(data.stockSnapshot, { version: 1, productStock: 2.5, locations: [{ godownId: 1, quantity: 1.75 }, { godownId: 2, quantity: 0.75 }] })
  assert.equal(data.inventoryHistory.batches[0].remainingQty, 2.5)
  await f.run(async tx => {
    const created = await tx.product.create({ data: { ...data, stock: 0 } })
    await restoreProductStockSnapshot(tx, created.id, data.stockSnapshot)
    await restoreProductHistory(tx, created.id, data.inventoryHistory)
    await tx.draft.delete({ where: { id: 1 } })
  })
  const restored = f.state().product.find(row => row.sku === 'RM-010')!
  assert.equal(restored.stock, 2.5) // Never multiplied by pack size again.
  assert.equal(restored.unitSize, 5)
  assert.deepEqual(f.state().godownStock.filter(row => row.productId === restored.id).map(row => row.quantity), [1.75, 0.75])
  assert.equal(f.state().stockLedger.length, before.stockLedger.length) // No fake receipt.
  assert.equal(f.state().productBatch[0].remainingQty, 2.5)
  assert.equal(f.state().draft.length, 0)
  assert.deepEqual(f.state().product.find(row => row.id === 2), before.product[1])
})

test('legacy unallocated nonzero stock archives/restores without inventing a godown or ledger', async () => {
  const f = fixture(); f.state().product[0].stock = 7.25
  f.state().godownStock = f.state().godownStock.filter(row => row.productId !== 1)
  await f.run(tx => moveInventoryProductToDraft(tx, 1, 'Manager', 'Raw Material', new Date(), true))
  const data = f.state().draft[0].data
  await f.run(async tx => {
    const created = await tx.product.create({ data: { ...data, stock: 0 } })
    await restoreProductStockSnapshot(tx, created.id, data.stockSnapshot)
  })
  const restored = f.state().product.find(row => row.sku === 'RM-010')!
  assert.equal(restored.stock, 7.25)
  assert.equal(f.state().godownStock.some(row => row.productId === restored.id), false)
  assert.equal(f.state().stockLedger.length, 0)
})

test('stocked archive never bypasses mismatches, batch over-allocation or business/document links', async () => {
  for (const change of [
    (s: any) => { s.godownStock[0].quantity = 2 },
    (s: any) => { s.productBatch[0].remainingQty = 4 },
    (s: any) => { s.invoiceItem.push({ id: 1, productId: 1 }) },
    (s: any) => { s.bomItem.push({ id: 1, rawMaterialId: 1 }) },
    (s: any) => { s.stockLedger[0].referenceType = 'Invoice'; s.stockLedger[0].referenceId = 42; s.invoice.push({ id: 42 }) },
    (s: any) => { s.product[0].stock = NaN },
  ]) {
    const f = fixture(); seedHistory(f); f.state().product[0].stock = 2.5; f.state().godownStock[0].quantity = 2.5
    change(f.state()); const before = structuredClone(f.state())
    await assert.rejects(f.run(tx => moveInventoryProductToDraft(tx, 1, 'Manager', 'Raw Material', new Date(), true)))
    assert.deepEqual(f.state(), before)
  }
})

test('stocked archive is explicit and raw-material-only', async () => {
  const f = fixture(); f.state().product[0].stock = 2; f.state().godownStock[0].quantity = 2
  const before = structuredClone(f.state())
  await assert.rejects(f.run(tx => moveInventoryProductToDraft(tx, 1, 'Manager', 'Raw Material')), /stock remains/)
  await assert.rejects(f.run(tx => moveInventoryProductToDraft(tx, 1, 'Manager', undefined, new Date(), true)), /only for explicitly/)
  assert.deepEqual(f.state(), before)
  f.state().product[0].category.name = 'Consumable'
  await assert.rejects(f.run(tx => moveInventoryProductToDraft(tx, 1, 'Manager', 'Raw Material', new Date(), true)), /Raw material not found/)
})

for (const failure of ['draft', 'cleanup', 'delete', 'changed', 'stockLedger', 'productBatch', 'batchMovement']) test(`stocked archive ${failure} failure preserves every original balance/history`, async () => {
  const f = fixture(); seedHistory(f); f.state().product[0].stock = 2.5; f.state().godownStock[0].quantity = 2.5
  f.state().productBatch[0].remainingQty = 2.5
  f.fail(failure); const before = structuredClone(f.state())
  await assert.rejects(f.run(tx => moveInventoryProductToDraft(tx, 1, 'Manager', 'Raw Material', new Date(), true)))
  assert.deepEqual(f.state(), before)
})

test('malformed/missing-godown stock restore and write failure cannot consume saved draft', async () => {
  for (const failure of ['missing', 'invalid', 'restore-stock', 'restore-stockLedger']) {
    const f = fixture(); seedHistory(f); f.state().product[0].stock = 2.5; f.state().godownStock[0].quantity = 2.5
    f.state().productBatch[0].remainingQty = 2.5
    await f.run(tx => moveInventoryProductToDraft(tx, 1, 'Manager', 'Raw Material', new Date(), true))
    if (failure === 'missing') f.state().godown = []
    if (failure === 'invalid') f.state().draft[0].data.stockSnapshot.locations[0].quantity = 99
    f.fail(failure); const before = structuredClone(f.state()); const data = f.state().draft[0].data
    await assert.rejects(f.run(async tx => {
      const created = await tx.product.create({ data: { ...data, stock: 0 } })
      await restoreProductStockSnapshot(tx, created.id, data.stockSnapshot)
      await restoreProductHistory(tx, created.id, data.inventoryHistory)
      await tx.draft.delete({ where: { id: 1 } })
    }))
    assert.deepEqual(f.state(), before)
  }
})

test('bulk stocked archive removes zero and nonzero unused raw materials independently', async () => {
  const f = fixture(); const result = await moveInventoryProductsToDraft(f.db, [1, 2, 2], 'Manager', 'Raw Material', true)
  assert.deepEqual(result.movedIds, [1, 2]); assert.deepEqual(result.errors, [])
  assert.equal(f.state().product.length, 0); assert.equal(f.state().godownStock.length, 0)
  assert.equal(f.state().draft[1].data.stockSnapshot.productStock, 9)
})

test('stock restore rejects conflicting saved product quantity before any balance write', async () => {
  const f = fixture(); const before = structuredClone(f.state())
  await assert.rejects(f.run(tx => restoreProductStockSnapshot(tx, 1, { version: 1, productStock: 3, locations: [{ godownId: 1, quantity: 3 }] }, 2)), /disagree/)
  assert.deepEqual(f.state(), before)
})
