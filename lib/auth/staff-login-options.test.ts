import { test, mock } from 'node:test'
import assert from 'node:assert/strict'
import type { PrismaClient } from '@prisma/client'
import { staffLoginOptionsResponse } from './staff-login-options'
import { loadStaffLoginOptions } from './load-staff-login-options'

// In-memory only: no lib/db import, DATABASE_URL, sessions or live staff records.
function directoryFixture() {
  const records = [
    { id: 1, name: 'Zoya', role: 'Sales', status: 'Active', phone: 'private', basicSalary: 50000, user: { isActive: true, email: 'private-login', hashedPassword: 'private-hash' } },
    { id: 2, name: 'Amit', role: 'Manager', status: 'Active', phone: 'private', basicSalary: 60000, user: { isActive: true, email: 'private-manager', hashedPassword: 'private-hash' } },
    { id: 3, name: 'Disabled', role: 'Sales', status: 'Active', user: { isActive: false } },
    { id: 4, name: 'Former', role: 'Sales', status: 'Inactive', user: { isActive: true } },
    { id: 5, name: 'Unassigned', role: 'Sales', status: 'Active', user: null },
  ]
  let calls = 0
  const db = { staff: { findMany: async (query: unknown) => {
    calls++
    assert.deepEqual(query, {
      where: { status: 'Active', user: { is: { isActive: true } } },
      select: { id: true, name: true, role: true },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    })
    // Deliberately return extra fields to test the response whitelist too.
    return records.filter(row => row.status === 'Active' && row.user?.isActive).sort((a, b) => a.name.localeCompare(b.name))
  } } } as unknown as Pick<PrismaClient, 'staff'>
  return { records, db, calls: () => calls }
}

test('logged-out directory uses a read-only, active-login query and returns names in order', async () => {
  const fixture = directoryFixture()
  const before = structuredClone(fixture.records)
  const response = await staffLoginOptionsResponse(fixture.db)
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { success: true, data: [
    { id: 2, name: 'Amit', role: 'Manager' }, { id: 1, name: 'Zoya', role: 'Sales' },
  ] })
  assert.equal(fixture.calls(), 1)
  assert.deepEqual(fixture.records, before)
})

test('public response never includes usernames, passwords, payroll or contact data', async () => {
  const { db } = directoryFixture()
  const body = await (await staffLoginOptionsResponse(db)).text()
  for (const field of ['user', 'email', 'hashedPassword', 'phone', 'basicSalary', 'private']) assert.equal(body.includes(field), false)
})

test('directory is not cached and disabling/enabling a login is reflected on the next request', async () => {
  const { db, records } = directoryFixture()
  const first = await staffLoginOptionsResponse(db)
  assert.equal(first.headers.get('cache-control'), 'no-store, max-age=0')
  assert.equal(first.headers.get('pragma'), 'no-cache')
  records[0].user!.isActive = false
  records[2].user!.isActive = true
  const second = await (await staffLoginOptionsResponse(db)).json()
  assert.deepEqual(second.data.map((row: { id: number }) => row.id), [2, 3])
})

test('no enabled accounts is a valid empty result, not a database failure', async () => {
  const { db, records } = directoryFixture()
  records.forEach(row => { row.status = 'Inactive' })
  const response = await staffLoginOptionsResponse(db)
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { success: true, data: [] })
})

test('database failure returns a retryable 503 without leaking internal details', async () => {
  const log = mock.method(console, 'error', () => {})
  try {
    const db = { staff: { findMany: async () => { throw new Error('private connection credentials') } } } as unknown as Pick<PrismaClient, 'staff'>
    const response = await staffLoginOptionsResponse(db)
    assert.equal(response.status, 503)
    assert.equal(response.headers.get('cache-control'), 'no-store, max-age=0')
    const body = await response.json()
    assert.equal(body.success, false)
    assert.match(body.error, /retry/i)
    assert.equal(JSON.stringify(body).includes('private'), false)
    assert.equal(log.mock.callCount(), 1)
  } finally { log.mock.restore() }
})

test('client fetch works without admin cookies and explicitly avoids a stale directory', async () => {
  const signal = new AbortController().signal
  const fetcher = (async (url, options) => {
    assert.equal(url, '/api/auth/staff-options')
    assert.deepEqual(options, { cache: 'no-store', signal })
    return Response.json({ success: true, data: [{ id: 2, name: 'Amit', role: 'Manager', email: 'not-public' }] })
  }) as typeof fetch
  assert.deepEqual(await loadStaffLoginOptions(signal, fetcher), [{ id: 2, name: 'Amit', role: 'Manager' }])
})

test('client distinguishes an empty successful directory from request errors', async () => {
  const signal = new AbortController().signal
  assert.deepEqual(await loadStaffLoginOptions(signal, (async () => Response.json({ success: true, data: [] })) as typeof fetch), [])
  for (const status of [401, 500, 503]) {
    await assert.rejects(loadStaffLoginOptions(signal, (async () => Response.json({ error: 'internal' }, { status })) as typeof fetch), /retry/)
  }
})

test('malformed/unauthorized payloads never become a blank successful dropdown', async () => {
  const signal = new AbortController().signal
  for (const payload of [null, {}, { success: false, data: [] }, { success: true, data: null }, { success: true, data: [null] }, { success: true, data: [{ id: '2', name: 'Amit', role: 'Sales' }] }]) {
    await assert.rejects(loadStaffLoginOptions(signal, (async () => Response.json(payload)) as typeof fetch), /retry/)
  }
  await assert.rejects(loadStaffLoginOptions(signal, (async () => new Response('<html>Unexpected page</html>')) as typeof fetch))
})

test('failed requests can be retried and load the directory normally', async () => {
  let calls = 0
  const fetcher = (async () => {
    if (++calls === 1) throw new TypeError('Network unavailable')
    return Response.json({ success: true, data: [{ id: 1, name: 'Zoya', role: 'Sales' }] })
  }) as typeof fetch
  const signal = new AbortController().signal
  await assert.rejects(loadStaffLoginOptions(signal, fetcher))
  assert.equal((await loadStaffLoginOptions(signal, fetcher))[0].id, 1)
})

test('abort signal is passed through so leaving the form cancels the old request', async () => {
  const controller = new AbortController()
  const fetcher = (async (_, options) => {
    assert.equal(options?.signal, controller.signal)
    controller.abort()
    options?.signal?.throwIfAborted()
    throw new Error('Unreachable')
  }) as typeof fetch
  await assert.rejects(loadStaffLoginOptions(controller.signal, fetcher), { name: 'AbortError' })
})
