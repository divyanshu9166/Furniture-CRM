import { isManualCategory } from './category'

type ValueProduct = { price?: number; costPrice?: number; category?: { name: string } | string; unitOfMeasure?: string }
export function godownUnitValue(product: ValueProduct) {
  const category = typeof product.category === 'string' ? product.category : product.category?.name ?? ''
  return isManualCategory(category) ? product.costPrice ?? 0 : product.price ?? 0
}

export function godownTotals(stocks: { quantity: number; product: ValueProduct }[], capacity?: number | null) {
  const totalItems = stocks.reduce((total, row) => total + row.quantity, 0)
  const totalValue = stocks.reduce((total, row) => total + row.quantity * godownUnitValue(row.product), 0)
  const totalCostValue = stocks.reduce((total, row) => total + row.quantity * (row.product.costPrice ?? 0), 0)
  const stockUnitTypes = [...new Set(stocks.filter(row => row.quantity > 0).map(row => row.product.unitOfMeasure || 'PCS'))].sort()
  const mixedUnits = stockUnitTypes.length > 1
  return { totalItems, totalValue, totalCostValue, stockUnitTypes, mixedUnits, utilization: capacity && !mixedUnits ? Math.round(totalItems / capacity * 100) : null }
}
