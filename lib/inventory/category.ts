export function canonicalInventoryCategory(name: string) {
  const normalized = name.trim().toLowerCase()
  if (['raw material', 'raw materials'].includes(normalized)) return 'Raw Material'
  if (['consumable', 'consumables', 'consumable items'].includes(normalized)) return 'Consumable'
  return name.trim()
}

export function isManualCategory(name: string) {
  return ['Raw Material', 'Consumable'].includes(canonicalInventoryCategory(name))
}
