import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Prisma } from '@prisma/client'
import { assertCompletionMembers, assertOrderTransition, priorityRank, productionCost, stepTiming, usableOutput, weightedCost } from './logic'
import { changeStep, transitionOrder } from './operations'
import { completeProductionSchema, createBOMSchema, createProductionOrderSchema, qualityCheckSchema } from '../validations/manufacturing'

test('terminal orders cannot restart/resume/complete again', () => {
  for (const current of ['COMPLETED', 'CANCELLED']) for (const target of ['IN_PROGRESS', 'ON_HOLD', 'COMPLETED']) assert.throws(() => assertOrderTransition(current, target), /Cannot change/)
  for (const [current, target] of [['PLANNED', 'IN_PROGRESS'], ['IN_PROGRESS', 'ON_HOLD'], ['ON_HOLD', 'IN_PROGRESS'], ['ON_HOLD', 'COMPLETED']]) assert.doesNotThrow(() => assertOrderTransition(current, target))
})

test('step starts preserve timestamps and DONE cannot reset history', () => {
  const start = new Date('2026-01-01T10:00:00Z'), end = new Date('2026-01-01T11:00:00Z')
  const step = { status: 'IN_PROGRESS', startedAt: start, completedAt: null, actualMins: 0 }
  assert.equal(stepTiming(step, 'IN_PROGRESS', undefined, end).startedAt, start)
  assert.equal(stepTiming(step, 'DONE', undefined, end).actualMins, 60)
  assert.equal(stepTiming(step, 'DONE', 0, end).actualMins, 0)
  assert.throws(() => stepTiming({ ...step, status: 'DONE' }, 'IN_PROGRESS'), /cannot be reopened/)
  assert.throws(() => stepTiming(step, 'DONE', 0.5), /integer/)
})

test('completion rejects missing/duplicate/foreign material and cross-order step timings', () => {
  assert.doesNotThrow(() => assertCompletionMembers([1, 2], [2, 1], [10, 11], [11]))
  for (const args of [[[1, 2], [1], [10], []], [[1, 2], [1, 1], [10], []], [[1, 1], [1, 1], [10], []], [[1], [1], [10], [99]], [[1], [1], [10], [10, 10]]]) {
    assert.throws(() => assertCompletionMembers(...args as [number[], number[], number[], number[]]))
  }
})

test('failed QC has zero usable output/yield and partial output absorbs scrap cost', () => {
  assert.equal(usableOutput(10, 2, 'FAILED'), 0)
  assert.equal(usableOutput(10, 2, 'PARTIAL'), 8)
  assert.throws(() => usableOutput(10, 11, 'PASSED'), /Invalid/)
  const base = { material: 800, overhead: 20, actualQty: 10, goodQty: 8, plannedQty: 10, steps: [{ status: 'DONE', actualMins: 60, plannedMins: 120, labourRatePerHour: 100, machineCostPerUnit: 2 }] }
  assert.deepEqual(productionCost(base), { labour: 100, machine: 20, total: 940, costPerUnit: 118, yieldRate: 80 })
  assert.deepEqual(productionCost({ ...base, goodQty: 0 }), { labour: 100, machine: 20, total: 940, costPerUnit: 0, yieldRate: 0 })
})

test('explicit zero costs are respected; skipped routing has no labour charge', () => {
  const input = { material: 100, overhead: 0, actualQty: 2, goodQty: 2, plannedQty: 2, steps: [{ status: 'SKIPPED', actualMins: 0, plannedMins: 60, labourRatePerHour: 100, machineCostPerUnit: 10 }] }
  assert.equal(productionCost(input).labour, 0)
  assert.equal(productionCost({ ...input, labour: 0, machine: 0 }).total, 100)
  assert.throws(() => productionCost({ ...input, material: Infinity }), /range/)
  assert.equal(weightedCost(10, 100, 10, 200), 150)
})

test('production/BOM validation rejects database-invalid integers, duplicate materials and dates', () => {
  const bom = { name: 'Desk', finishedProductId: 1, items: [{ rawMaterialId: 2, quantity: 0.5 }] }
  assert.equal(createBOMSchema.safeParse(bom).success, true)
  assert.equal(createBOMSchema.safeParse({ ...bom, items: [bom.items[0], bom.items[0]] }).success, false)
  for (const change of [{ plannedQty: 1.5 }, { dueDate: '2026-02-30' }, { dueDate: '2026-01-01', startDate: '2026-01-02' }, { bomId: -1 }]) assert.equal(createProductionOrderSchema.safeParse({ bomId: 1, plannedQty: 2, ...change }).success, false)
  const completion = { productionOrderId: 1, actualQty: 0, qualityStatus: 'FAILED', consumptions: [{ rawMaterialId: 2, actualQty: 0.5 }] }
  assert.equal(completeProductionSchema.safeParse(completion).success, true)
  assert.equal(completeProductionSchema.safeParse({ ...completion, qualityStatus: 'PASSED' }).success, false)
  assert.equal(completeProductionSchema.safeParse({ ...completion, totalLabourCost: 1.5 }).success, false)
  assert.equal(qualityCheckSchema.safeParse({ productionOrderId: 1, qualityStatus: 'PASSED', scrapQty: 0.5 }).success, false)
  assert.ok(priorityRank.URGENT < priorityRank.HIGH && priorityRank.HIGH < priorityRank.MEDIUM && priorityRank.MEDIUM < priorityRank.LOW)
})

function transactionFixture(status = 'PLANNED') {
  const state = { order: { id: 1, status, assignedStaffId: 4, workCenterId: null, startDate: null as Date | null }, step: { id: 10, productionOrderId: 1, status: 'PENDING', startedAt: null as Date | null, completedAt: null as Date | null, actualMins: 0 } }
  async function run<T>(operation: (tx: Prisma.TransactionClient) => Promise<T>) {
    const copy = structuredClone(state)
    const tx = { $queryRaw: async () => [], workCenter: { count: async () => 0 },
      productionOrder: { findUnique: async () => structuredClone(copy.order), update: async ({ data }: { data: object }) => Object.assign(copy.order, data) },
      productionStep: { findMany: async () => [], findUnique: async () => structuredClone(copy.step), findUniqueOrThrow: async () => structuredClone(copy.step), update: async ({ data }: { data: object }) => Object.assign(copy.step, data) },
    } as unknown as Prisma.TransactionClient
    const result = await operation(tx)
    Object.assign(state, copy)
    return result
  }
  return { state, run }
}

test('locked staff ownership and terminal-state guards leave order/steps unchanged', async () => {
  const f = transactionFixture('COMPLETED'), before = structuredClone(f.state)
  await assert.rejects(f.run(tx => transitionOrder(tx, 1, 'IN_PROGRESS')), /Cannot change/)
  await assert.rejects(f.run(tx => changeStep(tx, 10, 'DONE')), /in progress/)
  assert.deepEqual(f.state, before)
  const staff = transactionFixture()
  await assert.rejects(staff.run(tx => transitionOrder(tx, 1, 'IN_PROGRESS', 5)), /not assigned/)
  await staff.run(tx => transitionOrder(tx, 1, 'IN_PROGRESS', 4))
  const originalStart = staff.state.order.startDate
  await staff.run(tx => transitionOrder(tx, 1, 'ON_HOLD'))
  await staff.run(tx => transitionOrder(tx, 1, 'IN_PROGRESS'))
  assert.deepEqual(staff.state.order.startDate, originalStart)
  await staff.run(tx => changeStep(tx, 10, 'DONE', 0, undefined, 4))
  assert.equal(staff.state.step.actualMins, 0)
  assert.equal(staff.state.step.status, 'DONE')
})
