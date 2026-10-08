import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { PrismaClient } from '@prisma/client'
import {
  DEFAULT_WALKIN_REQUIREMENTS, requirementOptionsSchema, saveRequirementsSchema,
  readWalkinRequirements, saveWalkinRequirements, assertWalkinRequirement, RequirementsChangedError,
} from './requirements'
import { createWalkinSchema } from '../validations/walkin'

// Isolated delegate fixture: never imports lib/db or connects to customer data.
function fixture(initial?: { options: string[]; revision: number }, failRead = false) {
  let row = initial ? structuredClone(initial) : null
  const historicalVisits = [{ requirement: 'Office Chair' }, { requirement: 'Bed & Mattress' }]
  let writes = 0
  const db = {
    walkinRequirementSettings: {
      findUnique: async () => {
        if (failRead) throw new Error('Database unavailable')
        return row ? { id: 1, ...structuredClone(row) } : null
      },
      create: async ({ data }: { data: { options: string[]; revision: number } }) => {
        if (row) throw Object.assign(new Error('Unique constraint'), { code: 'P2002' })
        writes++
        row = { options: [...data.options], revision: data.revision }
        return { id: 1, ...row }
      },
      updateMany: async ({ where, data }: { where: { revision: number }; data: { options: string[] } }) => {
        if (!row || row.revision !== where.revision) return { count: 0 }
        writes++
        row = { options: [...data.options], revision: row.revision + 1 }
        return { count: 1 }
      },
    },
  } as unknown as Pick<PrismaClient, 'walkinRequirementSettings'>
  return { db, historicalVisits, state: () => structuredClone(row), writes: () => writes }
}

test('no configuration returns independent defaults without writing anything', async () => {
  const f = fixture()
  const first = await readWalkinRequirements(f.db)
  assert.equal(first.revision, 0)
  assert.deepEqual(first.options, DEFAULT_WALKIN_REQUIREMENTS)
  first.options.pop()
  assert.deepEqual((await readWalkinRequirements(f.db)).options, DEFAULT_WALKIN_REQUIREMENTS)
  assert.equal(f.writes(), 0)
})

test('defaults preserve every choice from both former dropdowns', () => {
  const reception = ['Sofa / Sofa Set', 'Bed', 'Dining Table', 'Wardrobe', 'Office Chair', 'TV Unit', 'Bookshelf / Storage', 'Kids Furniture', 'Modular Kitchen', 'Dressing Table', 'Center Table', 'Other']
  const qr = ['Sofa / Sofa Set', 'Bed & Mattress', 'Dining Table', 'Wardrobe', 'Office Furniture', 'TV Unit', 'Bookshelf / Storage', 'Kids Furniture', 'Modular Kitchen', 'Dressing Table', 'Center Table', 'Home Decor', 'Other']
  for (const option of [...reception, ...qr]) assert.ok(DEFAULT_WALKIN_REQUIREMENTS.includes(option))
  assert.ok(requirementOptionsSchema.safeParse(DEFAULT_WALKIN_REQUIREMENTS).success)
})

test('normalizes surrounding and repeated whitespace, preserves Unicode and order', () => {
  assert.deepEqual(requirementOptionsSchema.parse(['  Office   Tables ', 'ऑफिस कुर्सी', 'Other']), ['Office Tables', 'ऑफिस कुर्सी', 'Other'])
})

test('rejects blank, duplicate, too long, empty, and oversized lists', () => {
  for (const options of [[], [' '], ['Office Chair', ' office  chair '], ['a'.repeat(101)], Array.from({ length: 101 }, (_, i) => `Option ${i}`)]) {
    assert.equal(requirementOptionsSchema.safeParse(options).success, false)
  }
  assert.ok(requirementOptionsSchema.safeParse(Array.from({ length: 100 }, (_, i) => `Option ${i}`)).success)
  assert.ok(requirementOptionsSchema.safeParse(['a'.repeat(100)]).success)
})

test('requires an explicit valid revision, including revision zero only for first save', () => {
  for (const revision of [undefined, null, '1', -1, 0.5, 2147483647]) {
    assert.equal(saveRequirementsSchema.safeParse({ options: ['Other'], revision }).success, false)
  }
  assert.ok(saveRequirementsSchema.safeParse({ options: ['Other'], revision: 0 }).success)
})

test('first save persists custom choices and subsequent reads do not restore defaults', async () => {
  const f = fixture()
  const result = await saveWalkinRequirements(f.db, { options: [' Auditorium  Seating ', 'Office Furniture'], revision: 0 })
  assert.deepEqual(result, { options: ['Auditorium Seating', 'Office Furniture'], revision: 1 })
  assert.deepEqual(await readWalkinRequirements(f.db), result)
})

test('rename, remove and reorder edit only future options, never historical visits', async () => {
  const f = fixture({ options: ['Office Chair', 'Bed & Mattress', 'Other'], revision: 3 })
  const history = structuredClone(f.historicalVisits)
  await saveWalkinRequirements(f.db, { options: ['Other', 'Office Seating'], revision: 3 })
  assert.deepEqual(f.state(), { options: ['Other', 'Office Seating'], revision: 4 })
  assert.deepEqual(f.historicalVisits, history)
})

test('concurrent initial saves allow one writer and report a conflict to the other', async () => {
  const f = fixture()
  const results = await Promise.allSettled([
    saveWalkinRequirements(f.db, { options: ['First'], revision: 0 }),
    saveWalkinRequirements(f.db, { options: ['Second'], revision: 0 }),
  ])
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1)
  const rejected = results.find(result => result.status === 'rejected') as PromiseRejectedResult
  assert.ok(rejected.reason instanceof RequirementsChangedError)
  assert.equal(f.writes(), 1)
})

test('concurrent edits cannot silently overwrite the newer version', async () => {
  const f = fixture({ options: ['Original'], revision: 2 })
  const results = await Promise.allSettled([
    saveWalkinRequirements(f.db, { options: ['First'], revision: 2 }),
    saveWalkinRequirements(f.db, { options: ['Second'], revision: 2 }),
  ])
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1)
  assert.equal(f.state()?.revision, 3)
  assert.equal(f.writes(), 1)
})

test('stale saved revisions and unexpectedly missing settings fail without creating a replacement', async () => {
  const f = fixture()
  await assert.rejects(saveWalkinRequirements(f.db, { options: ['Other'], revision: 1 }), RequirementsChangedError)
  assert.equal(f.writes(), 0)
})

test('invalid input is rejected before any write', async () => {
  const f = fixture({ options: ['Other'], revision: 1 })
  await assert.rejects(saveWalkinRequirements(f.db, { options: ['Other', ' other '], revision: 1 }))
  assert.equal(f.writes(), 0)
  assert.deepEqual(f.state(), { options: ['Other'], revision: 1 })
})

test('shared registration guard accepts a current choice and rejects removed or invented options', async () => {
  const f = fixture({ options: ['Office Furniture'], revision: 1 })
  await assertWalkinRequirement(f.db, 'Office Furniture')
  await assert.rejects(assertWalkinRequirement(f.db, 'Office Chair'), RequirementsChangedError)
  await assert.rejects(assertWalkinRequirement(f.db, 'Unknown'), RequirementsChangedError)
  assert.equal(f.writes(), 0)
})

test('database failure and invalid saved configuration never silently return defaults', async () => {
  const f = fixture({ options: [], revision: 1 })
  await assert.rejects(readWalkinRequirements(f.db))
  await assert.rejects(readWalkinRequirements(fixture(undefined, true).db), /Database unavailable/)
})

test('walk-in validation trims selected labels and rejects blank labels', () => {
  const data = { name: 'Visitor', phone: '9876543210', requirement: ' Office   Furniture ' }
  assert.equal(createWalkinSchema.parse(data).requirement, 'Office Furniture')
  assert.equal(createWalkinSchema.safeParse({ ...data, requirement: ' ' }).success, false)
})
