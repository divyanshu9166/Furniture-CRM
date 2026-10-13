type AuditProduct = { id: number; name: string; sku: string; stock: number; unitSize: number; unitOfMeasure: string; godownStocks: { quantity: number; godownId: number }[]; batches: { remainingQty: number }[] }

export function buildStockAudit(products: AuditProduct[]) {
  const rows = products.map(product => {
    const godownQuantity = product.godownStocks.reduce((sum, row) => sum + row.quantity, 0)
    const batchQuantity = product.batches.reduce((sum, row) => sum + row.remainingQty, 0)
    const issues: string[] = []
    if (!Number.isFinite(product.stock) || product.stock < 0 || product.godownStocks.some(row => !Number.isFinite(row.quantity) || row.quantity < 0)) issues.push('Invalid stock balance')
    else if (!product.godownStocks.length && product.stock > 0) issues.push('Legacy stock has no godown allocation')
    else if (Math.abs(product.stock - godownQuantity) > 0.000001) issues.push('Product stock differs from godown total')
    if (product.batches.some(row => !Number.isFinite(row.remainingQty) || row.remainingQty < 0) || !Number.isFinite(batchQuantity) || batchQuantity > product.stock + 0.000001) issues.push('Invalid or overallocated batch balances')
    return { id: product.id, sku: product.sku, name: product.name, unit: product.unitOfMeasure, productQuantity: product.stock, godownQuantity, batchQuantity, unitSize: product.unitSize, entryQuantity: Number.isFinite(product.unitSize) && product.unitSize > 0 ? product.stock / product.unitSize : null, issues }
  })
  return { productCount: products.length, issueCount: rows.filter(row => row.issues.length).length, rows: rows.sort((a, b) => Number(b.issues.length > 0) - Number(a.issues.length > 0) || b.godownQuantity - a.godownQuantity || a.id - b.id) }
}
