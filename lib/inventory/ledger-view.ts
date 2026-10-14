// Read-only request coordination. Does not recalculate or mutate stock.
export function createLedgerRequestGuard(initialScope = '') {
  let version = 0
  let busy = false
  let nextCursor: number | null = null
  let selectedScope = initialScope
  return {
    begin(cursor?: number, scope = selectedScope) {
      if (scope !== selectedScope) return null
      if (cursor !== undefined && (busy || cursor !== nextCursor)) return null
      busy = true
      return { version: ++version, cursor }
    },
    isCurrent(request: { version: number }) { return request.version === version },
    finish(request: { version: number }, cursor: number | null) {
      if (request.version !== version) return false
      busy = false; nextCursor = cursor
      return true
    },
    release(request: { version: number }) { if (request.version === version) busy = false },
    invalidate() { version++; busy = false; nextCursor = null },
    selectScope(scope: string) { selectedScope = scope; version++; busy = false; nextCursor = null },
  }
}

export function mergeLedgerEntries<T extends { id: number }>(previous: T[], incoming: T[]) {
  const entries = new Map(previous.map(row => [row.id, row]))
  for (const row of incoming) entries.set(row.id, row)
  return [...entries.values()]
}

export function ledgerQuantityClass(quantity: number) {
  return quantity > 0 ? 'text-success' : quantity < 0 ? 'text-danger' : 'text-muted'
}
