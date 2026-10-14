import test from 'node:test'
import assert from 'node:assert/strict'
import { permanentBomCleanupError } from './cleanup-error'

test('cleanup database errors are actionable without exposing database queries or credentials', (t) => {
  const logs: unknown[][] = []
  t.mock.method(console, 'error', (...args: unknown[]) => { logs.push(args) })
  for (const code of ['P2021', 'P2022', 'P2010']) {
    const error = Object.assign(new Error('Sensitive connection URL and raw query'), { code })
    const message = permanentBomCleanupError(error, 'preview')
    assert.match(message, /No cleanup records were changed/)
    assert.doesNotMatch(message, /Sensitive|raw query/)
    assert.match(message, code === 'P2010' ? /check app logs/ : /pending Prisma migrations/)
    assert.deepEqual(logs.at(-1), ['[manufacturing:bom-cleanup:preview]', { code }])
  }
})

test('cleanup preserves validation, concurrent change and foreign-key protections', (t) => {
  t.mock.method(console, 'error', () => {})
  assert.equal(permanentBomCleanupError(new Error('Refresh the preview before deleting'), 'delete'), 'Refresh the preview before deleting')
  assert.match(permanentBomCleanupError({ code: 'P2034' }, 'delete'), /concurrently/)
  assert.match(permanentBomCleanupError({ code: 'P2003' }, 'delete'), /linked to other records/)
  assert.match(permanentBomCleanupError(null, 'preview'), /Unable to save/)
})
