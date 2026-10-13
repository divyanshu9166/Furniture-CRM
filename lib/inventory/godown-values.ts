import { isManualCategory } from './category'

type ValueProduct = { price?: number; costPrice?: number; category?: { name: string } | string; unitOfMeasure?: string }
type QuantityRow = { quantity: number; product: ValueProduct }

// Never add unlike units to produce an apparent "item count". Base quantities
// are grouped by UOM; pack/unitSize conversion has already happened at receipt.
export function quantitiesByUnit(stocks: QuantityRow[]) {
  const totals = new Map<string, number>()
  for (const row of stocks) {
    if (!Number.isFinite(row.quantity) || row.quantity <= 0) continue
    const unit = (row.product.unitOfMeasure || 'PCS').trim().toUpperCase()
    totals.set(unit, (totals.get(unit) ?? 0) + row.quantity)
  }
  return [...totals.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([unit, quantity]) => ({ unit, quantity }))
}

export function stockedProductCount(stocks: (QuantityRow & { productId: number })[]) {
  return new Set(stocks.filter(row => Number.isFinite(row.quantity) && row.quantity > 0).map(row => row.productId)).size
}
export function godownUnitValue(product: ValueProduct) {
  const category = typeof product.category === 'string' ? product.category : product.category?.name ?? ''
  return isManualCategory(category) ? product.costPrice ?? 0 : product.price ?? 0
}

export function godownTotals(stocks: QuantityRow[], capacity?: number | null) {
  const totalItems = stocks.reduce((total, row) => total + row.quantity, 0)
  const totalValue = stocks.reduce((total, row) => total + row.quantity * godownUnitValue(row.product), 0)
  const totalCostValue = stocks.reduce((total, row) => total + row.quantity * (row.product.costPrice ?? 0), 0)
  const quantities = quantitiesByUnit(stocks)
  const stockUnitTypes = quantities.map(row => row.unit)
  const mixedUnits = stockUnitTypes.length > 1
  return { totalItems, totalValue, totalCostValue, stockUnitTypes, quantitiesByUnit: quantities, mixedUnits, utilization: capacity && !mixedUnits ? Math.round(totalItems / capacity * 100) : null }
}
