import type { Prisma, PrismaClient } from '@prisma/client'
import type { CreateProductInput } from '../validations/product'
import { defaultGodown, moveStock } from './stock'
import { isManualCategory } from './category'
import { lockProducts } from './stock'
import type { z } from 'zod'
import type { updateProductSchema } from '../validations/product'

export async function updateInventoryMetadata(tx: Prisma.TransactionClient, id: number, data: z.infer<typeof updateProductSchema>) {
  await lockProducts(tx, [id])
  const current = await tx.product.findUnique({ where: { id } })
  if (!current) throw new Error('Product not found')
  if (data.stockGroupId && !await tx.stockGroup.findUnique({ where: { id: data.stockGroupId } })) throw new Error('Selected stock group was not found')
  if ((data.unitSize !== undefined && data.unitSize !== current.unitSize) || (data.unitOfMeasure !== undefined && data.unitOfMeasure !== current.unitOfMeasure)) {
    if (current.stock !== 0 || await tx.stockLedger.count({ where: { productId: id } }) || await tx.productBatch.count({ where: { productId: id } }) || await tx.bomItem.count({ where: { rawMaterialId: id } }) || await tx.materialConsumption.count({ where: { rawMaterialId: id } })) {
      throw new Error('Unit or pack size cannot change after stock/BOM/production history is recorded; create a separate item')
    }
  }
  return tx.product.update({ where: { id }, data })
}

export async function validateSellableItems(db: PrismaClient | Prisma.TransactionClient, ids: number[]) {
  const productIds = [...new Set(ids)]
  if (!productIds.length) return null
  const products = await db.product.findMany({ where: { id: { in: productIds } }, include: { category: true } })
  if (products.length !== productIds.length) return 'One or more selected items no longer exist'
  if (products.some(p => isManualCategory(p.category.name))) return 'Raw materials and consumables are not for sale'
  return null
}

// The caller supplies one transaction for the item, opening balance and audit trail.
export async function createInventoryProduct(tx: Prisma.TransactionClient, data: CreateProductInput, actor: string) {
  const { category, warehouse, unitOfMeasure, unitSize, godownId, stockGroupId, ...rest } = data
  if (stockGroupId && !await tx.stockGroup.findUnique({ where: { id: stockGroupId } })) throw new Error('Selected stock group was not found')
  if (godownId && !await tx.godown.findUnique({ where: { id: godownId } })) throw new Error('Selected location was not found')
  if (await tx.product.findUnique({ where: { sku: rest.sku } })) throw new Error(`A product with SKU "${rest.sku}" already exists`)
  const cat = await tx.category.upsert({ where: { name: category }, create: { name: category }, update: {} })
  const wh = warehouse?.trim() ? await tx.warehouse.upsert({ where: { name: warehouse.trim() }, create: { name: warehouse.trim() }, update: {} }) : null
  const created = await tx.product.create({ data: {
    ...rest, stock: 0, unitOfMeasure, unitSize, categoryId: cat.id,
    warehouseId: wh?.id, stockGroupId: stockGroupId ?? null,
  } })
  const initialStock = rest.stock * unitSize
  if (!Number.isFinite(initialStock)) throw new Error('Opening stock is too large')
  if (initialStock > 0) {
    const target = godownId ?? (await defaultGodown(tx)).id
    await moveStock(tx, created.id, target, initialStock, 'IN', {
      referenceType: 'Manual', notes: 'Initial stock on product creation', createdBy: actor,
    })
  }
  return tx.product.findUniqueOrThrow({ where: { id: created.id } })
}
