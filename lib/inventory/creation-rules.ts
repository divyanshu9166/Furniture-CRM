import { canonicalInventoryCategory } from './category'

export function inventoryCreationError(category: string) {
  return canonicalInventoryCategory(category) === 'Raw Material'
    ? 'Add/import raw materials from Manufacturing / Raw Materials, where you choose their godown.' : null
}
