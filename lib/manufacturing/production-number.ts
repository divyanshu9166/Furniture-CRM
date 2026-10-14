import type { Prisma } from '@prisma/client'

export async function lockProductionNumbering(tx: Prisma.TransactionClient) {
  // The lock returns PostgreSQL void (OID 2278), which PrismaPg cannot decode.
  // Casting only the result preserves the same transaction-scoped lock/key.
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(742013)::text`
}

export function productionNumber(displayId: string) {
  const match = /^PRD-(\d+)$/.exec(displayId)
  return match ? BigInt(match[1]) : BigInt(0)
}

export function nextProductionDisplayId(maximum: bigint) {
  const next = maximum + BigInt(1)
  if (maximum < BigInt(0) || next > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('Production number limit reached')
  return `PRD-${String(next).padStart(4, '0')}`
}
