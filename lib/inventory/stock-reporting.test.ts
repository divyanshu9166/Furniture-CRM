import test from 'node:test'
import assert from 'node:assert/strict'
import { quantitiesByUnit, stockedProductCount } from './godown-values'
import { buildStockAudit } from './stock-audit'
import { removeInChunks } from './bulk-removal'
import { draftNeedsGodown } from './godown-management'

test('stock count is distinct across godowns; quantities never mix KG/MTR/PCS or multiply packs', () => {
  const rows = [
    { productId: 1, quantity: 4, product: { unitOfMeasure: 'PCS' } },
    { productId: 1, quantity: 6, product: { unitOfMeasure: 'PCS' } },
    { productId: 2, quantity: 0.8, product: { unitOfMeasure: 'kg' } },
    { productId: 3, quantity: 12, product: { unitOfMeasure: 'MTR' } },
    { productId: 4, quantity: 0, product: { unitOfMeasure: 'PCS' } },
  ]
  const before = structuredClone(rows)
  assert.equal(stockedProductCount(rows), 3)
  assert.deepEqual(quantitiesByUnit(rows), [{ unit: 'KG', quantity: 0.8 }, { unit: 'MTR', quantity: 12 }, { unit: 'PCS', quantity: 10 }])
  assert.deepEqual(rows, before)
})

test('read-only audit distinguishes mismatches, legacy unallocated stock and pack/base units', () => {
  const product = { id: 1, sku: 'RM', name: 'Fabric', stock: 100, unitSize: 10, unitOfMeasure: 'MTR', godownStocks: [{ godownId: 1, quantity: 100 }], batches: [{ remainingQty: 75 }] }
  const products = [product, { ...product, id: 2, stock: 8, godownStocks: [{ godownId: 1, quantity: 18 }], batches: [] }, { ...product, id: 3, godownStocks: [], batches: [] }, { ...product, id: 4, batches: [{ remainingQty: 101 }] }]
  const before = structuredClone(products); const report = buildStockAudit(products)
  assert.equal(report.productCount, 4); assert.equal(report.issueCount, 3)
  assert.equal(report.rows.find(row => row.id === 1)?.entryQuantity, 10)
  assert.deepEqual(report.rows.find(row => row.id === 1)?.issues, [])
  assert.match(report.rows.find(row => row.id === 2)!.issues.join(), /differs/)
  assert.match(report.rows.find(row => row.id === 3)!.issues.join(), /no godown allocation/)
  assert.match(report.rows.find(row => row.id === 4)!.issues.join(), /batch/)
  assert.deepEqual(products, before)
})

test('invalid/negative/overallocated audit balances are reported, never silently repaired', () => {
  for (const quantity of [-1, NaN, Infinity]) {
    const products = [{ id: 1, sku: 'RM', name: 'Fabric', stock: quantity, unitSize: 1, unitOfMeasure: 'PCS', godownStocks: [{ godownId: 1, quantity }], batches: [] }]
    const before = structuredClone(products)
    assert.equal(buildStockAudit(products).issueCount, 1)
    assert.deepEqual(products, before)
  }
})

test('253-item deletion uses bounded requests, keeps per-item errors and accurate progress', async () => {
  const ids = Array.from({ length: 253 }, (_, index) => index + 1)
  const calls: number[][] = []; const progress: number[] = []
  const result = await removeInChunks([...ids, 1], async chunk => {
    calls.push(chunk)
    return { success: true, data: { movedIds: chunk.filter(id => id !== 2), errors: chunk.includes(2) ? [{ id: 2, error: 'Protected by BOM' }] : [] } }
  }, done => progress.push(done))
  assert.equal(calls.length, 11); assert.ok(calls.every(chunk => chunk.length <= 25))
  assert.equal(result.movedIds.length, 252); assert.deepEqual(result.errors, [{ id: 2, error: 'Protected by BOM' }])
  assert.equal(progress.at(-1), 253)
})

test('interrupted bulk response retains confirmed progress and never auto-retries uncertain removals', async () => {
  const ids = Array.from({ length: 60 }, (_, index) => index + 1); let requests = 0
  const result = await removeInChunks(ids, async chunk => {
    requests++
    if (requests === 2) throw new Error('network lost')
    return { success: true, data: { movedIds: chunk, errors: [] } }
  })
  assert.equal(requests, 2); assert.equal(result.movedIds.length, 25); assert.equal(result.errors.length, 35)
  assert.match(result.errors[0].error, /Refresh before retrying/)
})

test('missing/conflicting bulk results cannot masquerade as successful deletion', async () => {
  const result = await removeInChunks([1, 2, 3], async () => ({ success: true, data: { movedIds: [1, 2, 999], errors: [{ id: 2, error: 'Conflict' }] } }))
  assert.deepEqual(result.movedIds, [1]); assert.deepEqual(result.errors.map(row => row.id), [2, 3])
})

test('malformed bulk payload reports uncertainty instead of losing selection or retrying', async () => {
  let calls = 0
  const result = await removeInChunks([1, 2], async () => { calls++; return { success: true, data: {} } as never })
  assert.equal(calls, 1); assert.deepEqual(result.movedIds, []); assert.equal(result.errors.length, 2)
})

test('stock snapshots protect original godowns even without ledger history', () => {
  assert.equal(draftNeedsGodown({ stockSnapshot: { locations: [{ godownId: 2, quantity: 50 }] } }, 2), true)
  assert.equal(draftNeedsGodown({ stockSnapshot: { locations: [{ godownId: 2, quantity: 0 }] } }, 2), true)
  assert.equal(draftNeedsGodown({ stockSnapshot: { locations: [] } }, 2), false)
})
