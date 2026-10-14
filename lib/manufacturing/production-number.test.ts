import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient, type Prisma } from '@prisma/client'
import pg from 'pg'
import { lockProductionNumbering } from './production-number'

test('installed PrismaPg rejects void metadata but decodes the corrected numbering lock', async () => {
  // Real adapter decoding with simulated PostgreSQL field metadata. This pool
  // never opens a socket or reads DATABASE_URL; no live records are involved.
  const pool = new pg.Pool()
  const queries: string[] = []
  Object.defineProperty(pool, 'query', { value: async ({ text }: { text: string }) => {
    queries.push(text)
    assert.match(text, /^SELECT pg_advisory_xact_lock\(742013\)(::text)?$/)
    return { fields: [{ name: 'pg_advisory_xact_lock', dataTypeID: text.endsWith('::text') ? 25 : 2278 }], rows: [['']], rowCount: 1 }
  } })
  const adapter = await new PrismaPg(pool).connect()
  try {
    await assert.rejects(adapter.queryRaw({ sql: 'SELECT pg_advisory_xact_lock(742013)', args: [], argTypes: [] }), (error: unknown) => {
      const cause = (error as { cause?: { kind?: string; type?: string } }).cause
      assert.equal(cause?.kind, 'UnsupportedNativeDataType')
      assert.equal(cause?.type, 'void')
      return true
    })
    const tx = { $queryRaw: (sql: TemplateStringsArray) => adapter.queryRaw({ sql: sql.join(''), args: [], argTypes: [] }) } as unknown as Prisma.TransactionClient
    await lockProductionNumbering(tx)
    assert.deepEqual(queries, ['SELECT pg_advisory_xact_lock(742013)', 'SELECT pg_advisory_xact_lock(742013)::text'])
    const client = new PrismaClient({ adapter: new PrismaPg(pool), log: [] })
    try {
      // Check the actual Prisma error wrapping too: this P2010 was hidden
      // behind the generic inventory error seen in the deployed modal.
      await assert.rejects(client.$queryRaw`SELECT pg_advisory_xact_lock(742013)`, (error: unknown) => {
        const dbError = error as { code?: string; meta?: { message?: string } }
        assert.equal(dbError.code, 'P2010')
        assert.match(dbError.meta?.message ?? '', /Failed to deserialize column of type 'void'/)
        return true
      })
      await lockProductionNumbering(client)
      assert.deepEqual(queries.slice(2), ['SELECT pg_advisory_xact_lock(742013)', 'SELECT pg_advisory_xact_lock(742013)::text'])
    } finally { await client.$disconnect() }
  } finally {
    await adapter.dispose()
    await pool.end()
  }
})

test('production creation and permanent cleanup share the type-safe lock without changing its key', () => {
  for (const file of ['../../app/actions/manufacturing.ts', './permanent-cleanup.ts']) {
    const source = readFileSync(new URL(file, import.meta.url), 'utf8')
    assert.match(source, /await lockProductionNumbering\(tx\)/)
    assert.doesNotMatch(source, /\$queryRaw`SELECT pg_advisory_xact_lock/)
  }
})
