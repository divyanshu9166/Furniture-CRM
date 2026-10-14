export type ProductionArchiveState = { status: string; qualityStatus: string; archivedAt?: Date | string | null }

export function canArchiveFailedProductionOrder(order: ProductionArchiveState) {
  return order.status === 'COMPLETED' && order.qualityStatus === 'FAILED' && !order.archivedAt
}

export function matchesProductionArchiveView(order: ProductionArchiveState, view: 'CURRENT' | 'ARCHIVED' | 'ALL') {
  return view === 'ALL' || (view === 'ARCHIVED' ? !!order.archivedAt : !order.archivedAt)
}
