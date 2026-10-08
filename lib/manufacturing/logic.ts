export const priorityRank: Record<string, number> = { URGENT: 0, CRITICAL: 0, HIGH: 1, MEDIUM: 2, NORMAL: 2, LOW: 3 }
export const roundQuantity = (value: number) => Math.round((value + Number.EPSILON) * 1000) / 1000

export function assertOrderTransition(current: string, target: string) {
  const allowed: Record<string, string[]> = { PLANNED: ['IN_PROGRESS', 'CANCELLED'], IN_PROGRESS: ['ON_HOLD', 'COMPLETED', 'CANCELLED'], ON_HOLD: ['IN_PROGRESS', 'COMPLETED', 'CANCELLED'] }
  if (!allowed[current]?.includes(target)) throw new Error(`Cannot change production from ${current} to ${target}`)
}

export function stepTiming(current: { status: string; startedAt: Date | null; completedAt: Date | null; actualMins: number }, target: string, actualMins?: number, now = new Date()) {
  if (!['PENDING', 'IN_PROGRESS', 'DONE', 'SKIPPED'].includes(target)) throw new Error('Invalid step status')
  if (actualMins !== undefined && (!Number.isSafeInteger(actualMins) || actualMins < 0)) throw new Error('Step minutes must be a non-negative integer')
  if (current.status === 'DONE' && target !== 'DONE') throw new Error('A completed step cannot be reopened; correct timings without resetting its state')
  const startedAt = current.startedAt ?? (target === 'IN_PROGRESS' || target === 'DONE' ? now : null)
  const completedAt = target === 'DONE' ? current.completedAt ?? now : target === 'SKIPPED' ? now : null
  const computed = actualMins ?? (target === 'DONE' && current.status !== 'DONE' && current.startedAt ? Math.max(0, Math.round((now.getTime() - current.startedAt.getTime()) / 60000)) : current.actualMins)
  return { status: target, startedAt, completedAt, actualMins: computed }
}

export function usableOutput(actualQty: number, scrapQty: number, quality: string) {
  if (![actualQty, scrapQty].every(value => Number.isSafeInteger(value) && value >= 0) || scrapQty > actualQty) throw new Error('Invalid produced/scrap quantities')
  return quality === 'PASSED' || quality === 'PARTIAL' ? actualQty - scrapQty : 0
}

export function assertCompletionMembers(plannedMaterials: number[], suppliedMaterials: number[], plannedSteps: number[], suppliedSteps: number[]) {
  if (new Set(plannedMaterials).size !== plannedMaterials.length) throw new Error('Legacy production contains duplicate material lines; review before completing')
  if (new Set(suppliedMaterials).size !== suppliedMaterials.length || suppliedMaterials.length !== plannedMaterials.length || suppliedMaterials.some(id => !plannedMaterials.includes(id))) throw new Error('Record each production material exactly once')
  if (new Set(suppliedSteps).size !== suppliedSteps.length || suppliedSteps.some(id => !plannedSteps.includes(id))) throw new Error('Step timings must belong to this production order and cannot be duplicated')
}

export function productionCost(input: { material: number; labour?: number; machine?: number; overhead: number; actualQty: number; goodQty: number; plannedQty: number; steps: { actualMins: number; plannedMins: number; labourRatePerHour: number; machineCostPerUnit: number; status: string }[] }) {
  const labour = input.labour ?? Math.round(input.steps.reduce((sum, step) => sum + ((step.status === 'SKIPPED' ? 0 : step.status === 'DONE' ? step.actualMins : step.plannedMins) / 60) * step.labourRatePerHour, 0))
  const machine = input.machine ?? Math.round(input.steps.reduce((sum, step) => sum + step.machineCostPerUnit * input.actualQty, 0))
  const total = Math.round(input.material) + labour + machine + input.overhead
  if (![total, labour, machine].every(value => Number.isSafeInteger(value) && value >= 0 && value <= 2147483647)) throw new Error('Production cost exceeds supported whole-rupee range')
  return { labour, machine, total, costPerUnit: input.goodQty > 0 ? Math.round(total / input.goodQty) : 0, yieldRate: input.plannedQty > 0 ? Math.round(input.goodQty / input.plannedQty * 1000) / 10 : 0 }
}

export function weightedCost(stock: number, oldCost: number, received: number, newCost: number) {
  return stock + received > 0 ? Math.round((stock * oldCost + received * newCost) / (stock + received)) : oldCost
}
