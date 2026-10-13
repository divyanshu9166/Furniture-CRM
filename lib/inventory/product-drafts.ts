import type { Prisma, PrismaClient } from '@prisma/client'
import { lockProducts, inventoryTransaction, inventoryError } from './stock'
import { canonicalInventoryCategory } from './category'
import { snapshotProductHistory, removeProductHistory } from './product-history'

type Tx = Prisma.TransactionClient

// Both Inventory and Manufacturing remove the same product through this engine.
// The caller supplies a serializable transaction. Item ledger/batch history is
// explicitly removed with the item, but first saved in its recoverable draft.
export async function moveInventoryProductToDraft(tx: Tx, productId: number, actor: string, expectedCategory?: 'Raw Material', now = new Date()) {
  await lockProducts(tx, [productId])
  const product = await tx.product.findUnique({
    where: { id: productId }, include: { category: true, warehouse: true, stockGroup: true },
  })
  if (!product) throw new Error('Product not found. Refresh the list before trying again.')
  if (expectedCategory && canonicalInventoryCategory(product.category.name) !== expectedCategory) throw new Error('Raw material not found')
  const locations = await tx.godownStock.findMany({ where: { productId }, orderBy: { godownId: 'asc' } })
  if (!Number.isFinite(product.stock) || product.stock < 0 || locations.some(row => !Number.isFinite(row.quantity) || row.quantity < 0)) {
    throw new Error('Cannot delete: invalid stock balances. Review and reconcile stock first; no records were changed.')
  }
  // Never infer emptiness from a sum: nonzero individual rows or a stale product
  // total must block removal even if the UI displays a rounded zero.
  if (product.stock !== 0 || locations.some(row => row.quantity !== 0)) {
    throw new Error('Cannot delete: stock remains on the product or in a godown. Verify Inventory / Locations and reconcile any mismatch first.')
  }

  const usage = await Promise.all([
    tx.bomItem.count({ where: { rawMaterialId: productId } }),
    tx.billOfMaterials.count({ where: { finishedProductId: productId } }),
    tx.productionOrder.count({ where: { finishedProductId: productId } }),
    tx.order.count({ where: { productId } }),
    tx.quotationItem.count({ where: { productId } }),
    tx.invoiceItem.count({ where: { productId } }),
    tx.purchaseOrderItem.count({ where: { productId } }),
    tx.purchaseReturnItem.count({ where: { productId } }),
    tx.materialConsumption.count({ where: { rawMaterialId: productId } }),
    tx.scrapInventory.count({ where: { rawMaterialId: productId } }),
    tx.customOrderInventory.count({ where: { productId } }),
    tx.godownTransferItem.count({ where: { productId } }),
    // Optional FK defaults to SET NULL: deleting it would silently lose the link.
    tx.customOrder.count({ where: { referenceProductId: productId } }),
  ])
  const messages = [
    'used in a BOM', 'used as a finished product in a BOM', 'linked to production orders',
    'linked to orders', 'linked to quotations', 'linked to invoices',
    'linked to purchase orders', 'linked to purchase returns', 'has material-consumption history', 'has scrap history',
    'has custom-order inventory history', 'linked to godown transfers', 'referenced by custom orders',
  ]
  const used = usage.findIndex(count => count > 0)
  if (used !== -1) throw new Error(`Cannot delete: ${product.name} ${messages[used]}. Zero stock does not remove linked history; existing records were preserved.`)
  const inventoryHistory = await snapshotProductHistory(tx, productId)

  const snapshot = {
    originalProductId: product.id,
    displayId: product.sku, sku: product.sku, name: product.name,
    categoryId: product.categoryId, categoryName: product.category.name,
    price: product.price, bulkPrice: product.bulkPrice, brand: product.brand,
    unitSize: product.unitSize, createdAt: product.createdAt.toISOString(),
    stock: product.stock, sold: product.sold, reorderLevel: product.reorderLevel,
    image: product.image, material: product.material, color: product.color, description: product.description,
    warehouseId: product.warehouseId, warehouseName: product.warehouse?.name ?? null,
    lastRestocked: product.lastRestocked?.toISOString() ?? null,
    hsnCode: product.hsnCode, unitOfMeasure: product.unitOfMeasure, costPrice: product.costPrice,
    stockGroupId: product.stockGroupId, stockGroupName: product.stockGroup?.name ?? null,
    emptyGodownIds: locations.map(row => row.godownId),
    inventoryHistory,
    title: product.name, subtitle: `Product · ${product.sku}`,
  }
  await tx.draft.create({ data: {
    sourceType: 'Product', sourceId: product.sku, data: snapshot,
    deletedBy: actor, deletedAt: now, expiresAt: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
  } })
  await removeProductHistory(tx, productId)
  // Only this product's empty balances are removable, after every usage guard.
  // Any later failure rolls back this cleanup and the draft together.
  const cleaned = await tx.godownStock.deleteMany({ where: { productId, quantity: 0 } })
  if (cleaned.count !== locations.length) throw new Error('Stock changed during deletion. Refresh and retry; no records were changed.')
  await tx.product.delete({ where: { id: productId } })
  return { success: true }
}

// Newly created drafts preserve empty location assignments too. Legacy drafts
// lack this field and keep their existing restore behaviour. Removed godowns
// are not recreated; zero rows contain no stock or movement history to invent.
export async function restoreEmptyGodownStocks(tx: Tx, productId: number, savedIds: unknown) {
  if (savedIds === undefined) return
  if (!Array.isArray(savedIds) || savedIds.some(id => !Number.isSafeInteger(id) || id <= 0)) throw new Error('Invalid saved location details; draft was preserved')
  if (!savedIds.length) return
  const product = await tx.product.findUnique({ where: { id: productId }, select: { stock: true } })
  if (!product || product.stock !== 0) throw new Error('Empty location assignments can only be restored to a zero-stock product')
  const locations = await tx.godown.findMany({ where: { id: { in: [...new Set(savedIds)] } }, select: { id: true } })
  for (const location of locations) await tx.godownStock.upsert({
    where: { productId_godownId: { productId, godownId: location.id } },
    create: { productId, godownId: location.id, quantity: 0 }, update: {},
  })
}

export async function moveInventoryProductsToDraft(db: PrismaClient, productIds: number[], actor: string, expectedCategory?: 'Raw Material') {
  const movedIds: number[] = []; const errors: { id: number; error: string }[] = []
  for (const id of [...new Set(productIds)].sort((a, b) => a - b)) {
    try { await inventoryTransaction(db, tx => moveInventoryProductToDraft(tx, id, actor, expectedCategory)); movedIds.push(id) }
    catch (error) { errors.push({ id, error: inventoryError(error) }) }
  }
  return { movedIds, errors }
}
