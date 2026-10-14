import { inventoryError } from '../inventory/stock'

export function permanentBomCleanupError(error: unknown, stage: 'preview' | 'delete') {
  const code = (error as { code?: unknown } | null)?.code
  if (typeof code === 'string') {
    // No query, credentials, customer data or deletion reason in diagnostics.
    console.error(`[manufacturing:bom-cleanup:${stage}]`, { code })
  }
  if (code === 'P2021' || code === 'P2022') {
    return 'Manufacturing database schema is not up to date. Ask your administrator to apply the pending Prisma migrations and restart the rebuilt app. No cleanup records were changed.'
  }
  if (code === 'P2010') {
    return 'Unable to load manufacturing database records. Ask your administrator to check app logs for [manufacturing:bom-cleanup] and the underlying database error. No cleanup records were changed.'
  }
  return inventoryError(error)
}
