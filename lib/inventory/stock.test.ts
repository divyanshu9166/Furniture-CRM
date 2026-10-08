import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Prisma, PrismaClient } from '@prisma/client'
import { completeStockTransfer, inventoryTransaction, moveStock, moveTotalStock, reconcileStock } from './stock'
import { createProductSchema, updateProductSchema, updateStockSchema } from '../validations/product'
import { createTransferSchema } from '../validations/godown'
import { assertBatchCoverage, batchSchema } from '../validations/batch'
import { ageInDays, agingBracket } from './aging'
import { createInventoryProduct, updateInventoryMetadata } from './products'
import { planBatchIssue } from './batches'

// An isolated transactional fixture: never loads lib/db or a DATABASE_URL.
type State = {
  products: { id: number; sku?: string; name: string; stock: number; lastRestocked: Date | null }[]
  categories: { id: number; name: string }[]
  warehouses: { id: number; name: string }[]
  locations: { id: number; name: string; isDefault: boolean }[]
  stocks: { id: number; productId: number; godownId: number; quantity: number }[]
  ledger: Record<string, unknown>[]
  batches: { id: number; productId: number; batchNumber: string; quantity: number; remainingQty: number; costPrice: number; purchaseDate: Date; expiryDate: Date | null }[]
  batchMovements: { id: number; batchId?: number | null; stockLedgerId: number; quantity: number }[]
  transfers: { id: number; displayId: string; status: string; fromGodownId: number; toGodownId: number; items: { productId: number; quantity: number }[] }[]
}

function fixture(stock = 10, allocated = true, failLedgerAt?: number) {
  const holder = { state: {
    products: [{ id: 1, sku: 'TAPE', name: 'Packing tape', stock, lastRestocked: new Date('2026-01-01') }],
    categories: [], warehouses: [], batches: [], batchMovements: [],
    locations: [{ id: 1, name: 'Main', isDefault: true }, { id: 2, name: 'Store', isDefault: false }],
    stocks: allocated ? [{ id: 1, productId: 1, godownId: 1, quantity: stock }] : [],
    ledger: [], transfers: [{ id: 1, displayId: 'TRF-TEST', status: 'Pending', fromGodownId: 1, toGodownId: 2, items: [{ productId: 1, quantity: 4 }] }],
  } as State }
  // The fixture supports only the database operations exercised by the engine.
  function txFor(s: State) {
    const tx = {
      $queryRaw: async () => [],
      product: {
        findUnique: async ({ where }: { where: { id?: number; sku?: string } }) => structuredClone(s.products.find(p => where.id ? p.id === where.id : p.sku === where.sku) ?? null),
        create: async ({ data }: { data: { name: string; sku: string; stock: number } }) => {
          const p = { id: s.products.length + 1, lastRestocked: null, ...data }; s.products.push(p); return structuredClone(p)
        },
        findUniqueOrThrow: async ({ where }: { where: { id: number } }) => {
          const p = s.products.find(p => p.id === where.id)
          if (!p) throw new Error('Product not found')
          return p
        },
        update: async ({ where, data }: { where: { id: number }; data: Partial<State['products'][0]> }) => {
          const p = s.products.find(p => p.id === where.id)
          if (!p) throw new Error('Product not found')
          return Object.assign(p, data)
        },
      },
      category: { upsert: async ({ create }: { create: { name: string } }) => { const cat = { id: s.categories.length + 1, ...create }; s.categories.push(cat); return cat } },
      warehouse: { upsert: async ({ create }: { create: { name: string } }) => { const wh = { id: s.warehouses.length + 1, ...create }; s.warehouses.push(wh); return wh } },
      stockGroup: { findUnique: async () => null },
      productBatch: {
        findMany: async ({ where }: { where: { productId: number } }) => structuredClone(s.batches.filter(lot => lot.productId === where.productId && lot.remainingQty > 0)),
        create: async ({ data }: { data: Omit<State['batches'][0], 'id' | 'expiryDate'> }) => { const lot = { id: s.batches.length + 1, expiryDate: null, ...data }; s.batches.push(lot); return lot },
        update: async ({ where, data }: { where: { id: number }; data: { remainingQty: { increment?: number; decrement?: number } } }) => {
          const lot = s.batches.find(lot => lot.id === where.id)!
          lot.remainingQty += (data.remainingQty.increment ?? 0) - (data.remainingQty.decrement ?? 0)
          return lot
        },
      },
      batchMovement: {
        create: async ({ data }: { data: Omit<State['batchMovements'][0], 'id'> }) => { const m = { id: s.batchMovements.length + 1, ...data }; s.batchMovements.push(m); return m },
        findMany: async ({ where }: { where: { stockLedger: { productId: number; referenceType: string; referenceId: number } } }) => s.batchMovements.filter(m => {
          const ledger = s.ledger.find(entry => entry.id === m.stockLedgerId)
          return ledger && Object.entries(where.stockLedger).every(([key, value]) => ledger[key] === value)
        }).map(m => ({ ...m, batch: structuredClone(s.batches.find(lot => lot.id === m.batchId) ?? null) })),
      },
      godown: {
        findFirst: async () => s.locations.find(g => g.isDefault) ?? s.locations[0] ?? null,
        findUnique: async ({ where }: { where: { id: number } }) => s.locations.find(g => g.id === where.id) ?? null,
        create: async ({ data }: { data: Omit<State['locations'][0], 'id'> }) => { const g = { id: s.locations.length + 1, ...data }; s.locations.push(g); return g },
      },
      godownStock: {
        findMany: async ({ where }: { where: { productId: number; quantity?: { gt: number } } }) => s.stocks.filter(row => row.productId === where.productId && (!where.quantity || row.quantity > where.quantity.gt)).sort((a, b) => a.godownId - b.godownId),
        findUnique: async ({ where }: { where: { productId_godownId: { productId: number; godownId: number } } }) => {
          const key = where.productId_godownId
          return s.stocks.find(row => row.productId === key.productId && row.godownId === key.godownId) ?? null
        },
        create: async ({ data }: { data: Omit<State['stocks'][0], 'id'> }) => { const row = { id: s.stocks.length + 1, ...data }; s.stocks.push(row); return row },
        upsert: async ({ where, create, update }: { where: { productId_godownId: { productId: number; godownId: number } }; create: Omit<State['stocks'][0], 'id'>; update: { quantity: number } }) => {
          const key = where.productId_godownId
          const row = s.stocks.find(row => row.productId === key.productId && row.godownId === key.godownId)
          if (row) return Object.assign(row, update)
          const created = { id: s.stocks.length + 1, ...create }; s.stocks.push(created); return created
        },
        aggregate: async ({ where }: { where: { productId: number } }) => ({ _sum: { quantity: s.stocks.filter(row => row.productId === where.productId).reduce((sum, row) => sum + row.quantity, 0) } }),
      },
      stockLedger: { create: async ({ data }: { data: Record<string, unknown> }) => {
        if (failLedgerAt === s.ledger.length + 1) throw new Error('Injected ledger failure')
        const row = { id: s.ledger.length + 1, ...data }; s.ledger.push(row); return row
      } },
      godownTransfer: {
        findUnique: async ({ where }: { where: { id: number } }) => s.transfers.find(t => t.id === where.id) ?? null,
        update: async ({ where, data }: { where: { id: number }; data: Partial<State['transfers'][0]> }) => Object.assign(s.transfers.find(t => t.id === where.id)!, data),
      },
    }
    return tx as unknown as Prisma.TransactionClient
  }
  const db = {
    $transaction: async <T>(operation: (tx: Prisma.TransactionClient) => Promise<T>) => {
      const snapshot = structuredClone(holder.state)
      const result = await operation(txFor(snapshot))
      holder.state = snapshot
      return result
    },
  } as unknown as PrismaClient
  return { holder, db, run: <T>(operation: (tx: Prisma.TransactionClient) => Promise<T>) => inventoryTransaction(db, operation) }
}

test('opening stock creates one item with pack conversion and matching ledger', async () => {
  const f = fixture()
  const data = createProductSchema.parse({ sku: 'NEW', name: 'Cloth rolls', category: 'Consumable', price: 0, stock: 2, unitSize: 3, godownId: 2 })
  const created = await f.run(tx => createInventoryProduct(tx, data, 'Manager'))
  assert.equal(created.stock, 6)
  assert.equal(f.holder.state.stocks.find(row => row.productId === created.id)?.quantity, 6)
  assert.equal(f.holder.state.ledger[0].quantity, 6)
  assert.equal(f.holder.state.products[0].stock, 10)
})

test('opening ledger failure rolls back the new product, category and warehouse', async () => {
  const f = fixture(10, true, 1)
  const before = structuredClone(f.holder.state)
  const data = createProductSchema.parse({ sku: 'NEW', name: 'Gloves', category: 'Consumable', warehouse: 'Label', price: 0, stock: 3 })
  await assert.rejects(f.run(tx => createInventoryProduct(tx, data, 'Manager')), /ledger failure/)
  assert.deepEqual(f.holder.state, before)
})

test('duplicate SKU and missing location cannot create a partial item', async () => {
  const f = fixture()
  const before = structuredClone(f.holder.state)
  for (const extra of [{ sku: 'TAPE' }, { sku: 'NEW', godownId: 999 }]) {
    const data = createProductSchema.parse({ name: 'New item', category: 'Consumable', price: 0, stock: 2, ...extra })
    await assert.rejects(f.run(tx => createInventoryProduct(tx, data, 'Manager')))
    assert.deepEqual(f.holder.state, before)
  }
})

test('daily use preserves matching totals, ledger quantity, reason and notes', async () => {
  const f = fixture()
  await f.run(tx => moveStock(tx, 1, 1, -3, 'OUT', { notes: 'Daily consumption — packing desk', createdBy: 'Manager' }))
  assert.equal(f.holder.state.products[0].stock, 7)
  assert.equal(f.holder.state.stocks[0].quantity, 7)
  assert.equal(f.holder.state.ledger[0].quantity, -3)
  assert.equal(f.holder.state.ledger[0].balanceAfter, 7)
  assert.match(String(f.holder.state.ledger[0].notes), /packing desk/)
})

test('insufficient stock fails without changing balance or audit history', async () => {
  const f = fixture()
  const before = structuredClone(f.holder.state)
  await assert.rejects(f.run(tx => moveStock(tx, 1, 1, -11, 'OUT')), /Insufficient stock/)
  assert.deepEqual(f.holder.state, before)
})

test('existing location mismatch is preserved and blocks a movement', async () => {
  const f = fixture()
  f.holder.state.stocks[0].quantity = 8
  const before = structuredClone(f.holder.state)
  await assert.rejects(f.run(tx => moveStock(tx, 1, 1, 2, 'IN')), /Stock mismatch/)
  assert.deepEqual(f.holder.state, before)
})

test('legacy opening stock is preserved when receiving into another location', async () => {
  const f = fixture(10, false)
  await f.run(tx => moveStock(tx, 1, 2, 3, 'IN'))
  assert.equal(f.holder.state.products[0].stock, 13)
  assert.deepEqual(f.holder.state.stocks.map(row => row.quantity), [10, 3])
  assert.match(String(f.holder.state.ledger[0].notes), /Opening balance/)
})

test('failed legacy operation rolls back even the opening allocation', async () => {
  const f = fixture(10, false)
  const before = structuredClone(f.holder.state)
  await assert.rejects(f.run(tx => moveStock(tx, 1, 999, 3, 'IN')), /not found/)
  assert.deepEqual(f.holder.state, before)
})

test('global deduction uses multiple locations without changing unrelated stock', async () => {
  const f = fixture(10)
  f.holder.state.stocks[0].quantity = 4
  f.holder.state.stocks.push({ id: 2, productId: 1, godownId: 2, quantity: 6 })
  await f.run(tx => moveTotalStock(tx, 1, -7, 'PRODUCTION'))
  assert.equal(f.holder.state.products[0].stock, 3)
  assert.deepEqual(f.holder.state.stocks.map(row => row.quantity), [0, 3])
  assert.equal(f.holder.state.ledger.reduce((sum, entry) => sum + Number(entry.quantity), 0), -7)
})

test('transfer conserves total stock, preserves restock age and cannot be replayed', async () => {
  const f = fixture()
  await f.run(tx => completeStockTransfer(tx, 1, 'Manager'))
  assert.equal(f.holder.state.products[0].stock, 10)
  assert.deepEqual(f.holder.state.stocks.map(row => row.quantity), [6, 4])
  assert.equal(f.holder.state.ledger.reduce((sum, entry) => sum + Number(entry.quantity), 0), 0)
  assert.equal(f.holder.state.products[0].lastRestocked?.toISOString(), '2026-01-01T00:00:00.000Z')
  const before = structuredClone(f.holder.state)
  await assert.rejects(f.run(tx => completeStockTransfer(tx, 1, 'Manager')), /pending transfer/)
  assert.deepEqual(f.holder.state, before)
})

test('multi-item transfer failure rolls back earlier item and status', async () => {
  const f = fixture()
  f.holder.state.products.push({ id: 2, name: 'Gloves', stock: 1, lastRestocked: null })
  f.holder.state.stocks.push({ id: 2, productId: 2, godownId: 1, quantity: 1 })
  f.holder.state.transfers[0].items.push({ productId: 2, quantity: 2 })
  const before = structuredClone(f.holder.state)
  await assert.rejects(f.run(tx => completeStockTransfer(tx, 1, 'Manager')), /Insufficient stock/)
  assert.deepEqual(f.holder.state, before)
})

test('non-finite movements are refused', async () => {
  for (const quantity of [NaN, Infinity, -Infinity]) {
    const f = fixture()
    await assert.rejects(f.run(tx => moveStock(tx, 1, 1, quantity, 'IN')), /finite/)
    assert.equal(f.holder.state.ledger.length, 0)
  }
})

test('approved reconciliation preserves prior history and requires unchanged balances', async () => {
  const f = fixture()
  f.holder.state.stocks[0].quantity = 7
  const before = structuredClone(f.holder.state)
  await assert.rejects(f.run(tx => reconcileStock(tx, 1, 'LOCATIONS', 10, 8, 'Manager')), /Balances changed/)
  assert.deepEqual(f.holder.state, before)
  await f.run(tx => reconcileStock(tx, 1, 'LOCATIONS', 10, 7, 'Manager'))
  assert.equal(f.holder.state.products[0].stock, 7)
  assert.equal(f.holder.state.ledger[0].quantity, 0)
  assert.match(String(f.holder.state.ledger[0].notes), /product balance 10, location total 7/)
})

test('product-based reconciliation adjusts locations to the approved product total', async () => {
  const f = fixture()
  f.holder.state.stocks[0].quantity = 7
  await f.run(tx => reconcileStock(tx, 1, 'PRODUCT', 10, 7, 'Manager'))
  assert.equal(f.holder.state.products[0].stock, 10)
  assert.equal(f.holder.state.stocks[0].quantity, 10)
  assert.equal(f.holder.state.ledger[1].quantity, 3)
})

test('only serialization conflicts retry and retry is bounded', async () => {
  let calls = 0
  const db = { $transaction: async () => { calls++; throw Object.assign(new Error('Conflict'), { code: 'P2034' }) } } as unknown as PrismaClient
  await assert.rejects(inventoryTransaction(db, async () => 1), /Conflict/)
  assert.equal(calls, 3)
  calls = 0
  const validationDb = { $transaction: async () => { calls++; throw new Error('Invalid stock') } } as unknown as PrismaClient
  await assert.rejects(inventoryTransaction(validationDb, async () => 1), /Invalid stock/)
  assert.equal(calls, 1)
})

test('negative legacy product balance can be corrected using verified non-negative locations', async () => {
  const f = fixture(4)
  f.holder.state.products[0].stock = -2
  await f.run(tx => reconcileStock(tx, 1, 'LOCATIONS', -2, 4, 'Manager'))
  assert.equal(f.holder.state.products[0].stock, 4)
  assert.equal(f.holder.state.stocks[0].quantity, 4)
  assert.match(String(f.holder.state.ledger[0].notes), /product balance -2/)
})

test('product validation rejects invalid database integers and bypass stock updates', () => {
  const input = { sku: 'TAPE', name: 'Tape', category: 'Consumable', price: 0, stock: 1.5, costPrice: 15 }
  assert.equal(createProductSchema.safeParse(input).success, true)
  for (const change of [{ price: 1.5 }, { stock: -1 }, { reorderLevel: 2.5 }, { name: ' ' }, { godownId: -1 }]) {
    assert.equal(createProductSchema.safeParse({ ...input, ...change }).success, false)
  }
  assert.equal(updateProductSchema.safeParse({ stock: 100 }).success, false)
  assert.equal(updateStockSchema.safeParse({ id: 1, stock: 1.5, mode: 'REMOVE' }).success, true)
})

test('transfer rejects duplicate products and fractional line quantities', () => {
  const item = { productId: 1, name: 'Tape', sku: 'TAPE', quantity: 2 }
  assert.equal(createTransferSchema.safeParse({ fromGodownId: 1, toGodownId: 2, items: [item, item] }).success, false)
  assert.equal(createTransferSchema.safeParse({ fromGodownId: 1, toGodownId: 2, items: [{ ...item, quantity: 1.5 }] }).success, false)
})

test('batch validation rejects impossible dates/over-allocation and accepts fractional base units', () => {
  const input = { productId: 1, batchNumber: 'LOT-1', quantity: 5, remainingQty: 5, purchaseDate: '2026-01-01' }
  assert.equal(batchSchema.safeParse(input).success, true)
  for (const change of [{ remainingQty: 6 }, { purchaseDate: '2026-02-30' }, { expiryDate: '2025-01-01' }]) {
    assert.equal(batchSchema.safeParse({ ...input, ...change }).success, false)
  }
  assert.equal(batchSchema.safeParse({ ...input, quantity: 1.5, remainingQty: 0.25 }).success, true)
})

test('aging uses all bracket boundaries and never reports a negative age', () => {
  assert.deepEqual([0, 30, 31, 60, 61, 90, 91, 180, 181].map(agingBracket), ['0-30 days', '0-30 days', '31-60 days', '31-60 days', '61-90 days', '61-90 days', '91-180 days', '91-180 days', '180+ days'])
  assert.equal(ageInDays('2026-02-01', new Date('2026-01-01')), 0)
})

test('batch coverage prevents new over-allocation and supports incremental legacy corrections', () => {
  assert.doesNotThrow(() => assertBatchCoverage(20, 10, 10))
  assert.throws(() => assertBatchCoverage(20, 50, 1), /exceed/)
  assert.throws(() => assertBatchCoverage(20, 50, 50, 50), /exceed/)
  assert.throws(() => assertBatchCoverage(20, 50, 51, 50), /exceed/)
  assert.doesNotThrow(() => assertBatchCoverage(20, 50, 49, 50))
  assert.doesNotThrow(() => assertBatchCoverage(20, 50, 0, 50))
  assert.doesNotThrow(() => assertBatchCoverage(20, 0, 20, 50))
  assert.throws(() => assertBatchCoverage(20, 0, -1), /Invalid/)
})

test('FEFO precedes FIFO, expiry blocks issues and fractional untracked stock is accounted for', () => {
  const now = new Date('2026-10-08T10:00:00Z')
  const lot = (id: number, expiry: string | null, purchase: string, remainingQty = 2) => ({ id, quantity: remainingQty, remainingQty, costPrice: 20, expiryDate: expiry ? new Date(expiry) : null, purchaseDate: new Date(purchase) })
  const lots = [lot(1, null, '2026-01-01'), lot(2, '2026-10-10', '2026-05-01'), lot(3, '2026-10-09', '2026-06-01'), lot(4, '2026-10-07', '2026-02-01')]
  assert.deepEqual(planBatchIssue(lots, 8.5, 6.5, false, now).map(row => [row.batchId, row.quantity]), [[3, 2], [2, 2], [1, 2], [null, 0.5]])
  assert.throws(() => planBatchIssue(lots, 8.5, 7, false, now), /expired/)
  assert.equal(planBatchIssue(lots, 8.5, 7, true, now)[0].batchId, 4)
  assert.throws(() => planBatchIssue(lots, 7, 1, false, now), /exceed/)
  assert.throws(() => planBatchIssue(lots, 8.5, 3, true, now, [1]), /Insufficient/)
})

test('automatic receipt/issue allocation and original-lot reversal are atomic', async () => {
  const f = fixture(0)
  await f.run(tx => moveStock(tx, 1, 1, 4.5, 'IN', { referenceType: 'PurchaseOrder', referenceId: 8, batchCostPrice: 20 }))
  assert.equal(f.holder.state.batches[0].remainingQty, 4.5)
  assert.equal(f.holder.state.batches[0].costPrice, 20)
  const date = f.holder.state.batches[0].purchaseDate
  await f.run(tx => moveStock(tx, 1, 1, -1.25, 'SALE', { referenceType: 'Order', referenceId: 5 }))
  assert.equal(f.holder.state.batches[0].remainingQty, 3.25)
  await f.run(tx => moveStock(tx, 1, 1, 1.25, 'RETURN', { referenceType: 'Order', referenceId: 5, reverseBatches: true }))
  assert.equal(f.holder.state.batches[0].remainingQty, 4.5)
  assert.deepEqual(f.holder.state.batches[0].purchaseDate, date)
  assert.equal(f.holder.state.batches.length, 1)
  assert.equal(f.holder.state.batchMovements.reduce((sum, m) => sum + m.quantity, 0), f.holder.state.products[0].stock)
})

test('expired/overallocated lot failures roll back the physical ledger and balances', async () => {
  const f = fixture(4)
  f.holder.state.batches.push({ id: 1, productId: 1, batchNumber: 'EXPIRED', quantity: 4, remainingQty: 4, costPrice: 10, purchaseDate: new Date('2020-01-01'), expiryDate: new Date('2020-02-01') })
  const before = structuredClone(f.holder.state)
  await assert.rejects(f.run(tx => moveStock(tx, 1, 1, -1, 'PRODUCTION')), /expired/)
  assert.deepEqual(f.holder.state, before)
  await f.run(tx => moveStock(tx, 1, 1, -1, 'ADJUSTMENT', { notes: 'Approved expired disposal' }))
  assert.equal(f.holder.state.batches[0].remainingQty, 3)
})

test('later-location failure rolls back earlier automatic lot depletion', async () => {
  const f = fixture(8, true, 2)
  f.holder.state.stocks[0].quantity = 4
  f.holder.state.stocks.push({ id: 2, productId: 1, godownId: 2, quantity: 4 })
  f.holder.state.batches.push({ id: 1, productId: 1, batchNumber: 'LOT', quantity: 8, remainingQty: 8, costPrice: 10, purchaseDate: new Date('2026-01-01'), expiryDate: null })
  const before = structuredClone(f.holder.state)
  await assert.rejects(f.run(tx => moveTotalStock(tx, 1, -6, 'PRODUCTION')), /ledger failure/)
  assert.deepEqual(f.holder.state, before)
})

test('location transfer does not consume product-level lots or duplicate receipt allocations', async () => {
  const f = fixture(0)
  await f.run(tx => moveStock(tx, 1, 1, 4, 'IN'))
  const movements = f.holder.state.batchMovements.length
  await f.run(tx => completeStockTransfer(tx, 1, 'Manager'))
  assert.equal(f.holder.state.batches[0].remainingQty, 4)
  assert.equal(f.holder.state.batchMovements.length, movements)
  assert.equal(f.holder.state.products[0].stock, 4)
})

test('raw-material metadata and stock failure roll back together; recorded units cannot change', async () => {
  const f = fixture(4), before = structuredClone(f.holder.state)
  await assert.rejects(f.run(async tx => {
    await updateInventoryMetadata(tx, 1, { name: 'Changed name', costPrice: 25 })
    await moveTotalStock(tx, 1, -5, 'OUT')
  }), /Insufficient stock/)
  assert.deepEqual(f.holder.state, before)
  await assert.rejects(f.run(tx => updateInventoryMetadata(tx, 1, { unitOfMeasure: 'KG' })), /cannot change/)
  assert.deepEqual(f.holder.state, before)
})
