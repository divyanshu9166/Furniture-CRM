'use server'

import { prisma } from '@/lib/db'
import { revalidatePath } from 'next/cache'
import { createProductSchema, updateProductSchema, updateStockSchema } from '@/lib/validations/product'
import { moveProductToDraft } from './drafts'
import { requireAuth, requireRole } from '@/lib/auth-helpers'
import { inventoryError, inventoryTransaction, moveStock, moveTotalStock, prepareStock, reconcileStock } from '@/lib/inventory/stock'
import { createInventoryProduct, updateInventoryMetadata } from '@/lib/inventory/products'
import { canonicalInventoryCategory } from '@/lib/inventory/category'

export interface BulkRawMaterialRow {
  name: string
  brand?: string
  sku?: string
  size?: number | string
  instock?: number | string
  costPrice?: number | string
  stockQuantity?: number | string
  unitSize?: number | string
  unitOfMeasure?: string
  reorderLevel?: number | string
  description?: string
  image?: string
}

const toRequiredNumber = (value: unknown) => {
  const text = String(value ?? '').trim()
  if (!text) return Number.NaN
  const n = Number(text)
  return Number.isFinite(n) ? n : Number.NaN
}

export async function getProducts() {
  await requireAuth()
  const products = await prisma.product.findMany({
    include: {
      category: true,
      warehouse: true,
      stockGroup: { select: { id: true, name: true } },
    },
    orderBy: { name: 'asc' },
  })

  return {
    success: true,
    data: products.map(p => {
      const isRawMaterial = canonicalInventoryCategory(p.category.name) === 'Raw Material'
      const isConsumable = canonicalInventoryCategory(p.category.name) === 'Consumable'
      return {
        id: p.id,
        sku: p.sku,
        name: p.name,
        category: p.category.name,
        categoryId: p.categoryId,
        stockGroupId: p.stockGroupId,
        stockGroupName: p.stockGroup?.name || null,
        isRawMaterial,
        isConsumable,
        isSellable: !isRawMaterial && !isConsumable,
        price: p.price,
        bulkPrice: p.bulkPrice,
        costPrice: p.costPrice,
        brand: p.brand,
        hsnCode: p.hsnCode,
        unitOfMeasure: p.unitOfMeasure,
        unitSize: p.unitSize,
        stock: p.stock,
        sold: p.sold,
        reorderLevel: p.reorderLevel,
        image: p.image,
        material: p.material,
        color: p.color,
        description: p.description,
        warehouse: p.warehouse?.name || 'Unassigned',
        createdAt: p.createdAt.toISOString(),
        lastRestocked: p.lastRestocked?.toISOString().split('T')[0] || null,
      }
    }),
  }
}

export async function getProduct(id: number) {
  await requireAuth()
  const product = await prisma.product.findUnique({
    where: { id },
    include: { category: true, warehouse: true },
  })

  if (!product) return { success: false, error: 'Product not found' }
  return { success: true, data: product }
}

export async function createProduct(data: unknown) {
  try { await requireRole('ADMIN', 'MANAGER', 'STAFF') } catch { return { success: false, error: 'Access denied' } }
  const parsed = createProductSchema.safeParse(data)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }

  try {
    const actor = (await requireAuth()).user.name
    const product = await inventoryTransaction(prisma, tx => createInventoryProduct(tx, parsed.data, actor))
    revalidatePath('/inventory')
    revalidatePath('/godowns')
    revalidatePath('/manufacturing')
    return { success: true, data: product }
  } catch (error) {
    return { success: false, error: inventoryError(error) }
  }
}

export async function bulkImportRawMaterials(rows: BulkRawMaterialRow[]) {
  try { await requireRole('ADMIN', 'MANAGER', 'STAFF') } catch { return { success: false, error: 'Access denied' } }
  if (!Array.isArray(rows) || rows.length === 0) return { success: false, error: 'No raw materials to import' }
  if (rows.length > 1000 || rows.some(row => !row || typeof row !== 'object')) return { success: false, error: 'Use at most 1000 valid rows per import' }

  const validRows = rows
    .map(r => ({
      name: String(r.name || '').trim(),
      brand: String(r.brand || '').trim(),
      sku: String(r.sku || '').trim(),
      sizeLabel: String(r.size ?? '').trim(),
      costPrice: r.costPrice === undefined || r.costPrice === '' ? 0 : toRequiredNumber(r.costPrice),
      stockQuantity: toRequiredNumber(r.instock ?? r.stockQuantity),
      unitSize: r.unitSize === undefined || r.unitSize === '' ? 1 : toRequiredNumber(r.unitSize),
      unitOfMeasure: String(r.unitOfMeasure || '').trim().toUpperCase() || 'PCS',
      reorderLevel: r.reorderLevel === undefined || r.reorderLevel === '' ? 5 : toRequiredNumber(r.reorderLevel),
      description: String(r.description || '').trim(),
      image: String(r.image || '').trim(),
    }))

  if (validRows.length === 0) {
    return { success: false, error: 'No valid rows found. Product name, size, and in-stock are required.' }
  }

  const existingSkus = new Set(
    (await prisma.product.findMany({ select: { sku: true } })).map(p => p.sku)
  )

  let created = 0
  let skipped = 0
  const errors: { row: number; name: string; error: string }[] = []

  let counter = (await prisma.product.count({ where: { category: { name: 'Raw Material' } } })) + 1

  const makeUniqueSku = (preferredSku: string) => {
    const baseSku = String(preferredSku || '').trim()
    let candidate = baseSku || `RM-${String(counter).padStart(3, '0')}`
    while (!baseSku && existingSkus.has(candidate)) candidate = `RM-${String(++counter).padStart(3, '0')}`
    return candidate
  }

  for (const row of validRows) {
    const sku = makeUniqueSku(row.sku)
    if (existingSkus.has(sku)) {
      skipped++
      errors.push({ row: created + skipped, name: row.name, error: `SKU "${sku}" already exists; existing item was preserved` })
      continue
    }

    const res = await createProduct({
      name: row.name,
      brand: row.brand || undefined,
      sku,
      category: 'Raw Material',
      price: 0,
      costPrice: row.costPrice,
      stock: row.stockQuantity,
      unitOfMeasure: row.unitOfMeasure || 'PCS',
      unitSize: row.unitSize,
      reorderLevel: row.reorderLevel,
      description: row.description || row.sizeLabel || undefined,
      image: row.image || undefined,
    })

    if (res.success) {
      created++
      existingSkus.add(sku)
    } else {
      skipped++
      errors.push({ row: created + skipped, name: row.name, error: res.error || 'Unable to import item' })
    }

    counter++
  }

  revalidatePath('/manufacturing')
  revalidatePath('/inventory')

  return {
    success: true,
    data: {
      total: validRows.length,
      created,
      skipped,
      errors,
    },
  }
}

export interface BulkProductRow {
  name: string
  sku?: string
  category: string
  price: number | string
  instock: number | string
  description?: string
  material?: string
  color?: string
  reorderLevel?: number | string
  warehouse?: string
}

export async function bulkImportProducts(rows: BulkProductRow[]) {
  try { await requireRole('ADMIN', 'MANAGER', 'STAFF') } catch { return { success: false, error: 'Access denied' } }
  if (!Array.isArray(rows) || rows.length === 0) return { success: false, error: 'No products to import' }
  if (rows.length > 1000 || rows.some(row => !row || typeof row !== 'object')) return { success: false, error: 'Use at most 1000 valid rows per import' }

  const validRows = rows
    .map(r => ({
      name: String(r.name || '').trim(),
      sku: String(r.sku || '').trim(),
      category: String(r.category || 'General').trim(),
      price: toRequiredNumber(r.price),
      instock: toRequiredNumber(r.instock),
      description: String(r.description || '').trim(),
      material: String(r.material || '').trim(),
      color: String(r.color || '').trim(),
      reorderLevel: r.reorderLevel === undefined || r.reorderLevel === '' ? 5 : toRequiredNumber(r.reorderLevel),
      warehouse: String(r.warehouse || '').trim(),
    }))

  if (validRows.length === 0) {
    return { success: false, error: 'No valid rows found. Product name, price, and in-stock quantity are required.' }
  }

  const existingSkus = new Set(
    (await prisma.product.findMany({ select: { sku: true } })).map(p => p.sku)
  )

  let created = 0
  let skipped = 0
  const errors: { row: number; name: string; error: string }[] = []

  let counter = (await prisma.product.count()) + 1

  const makeUniqueSku = (preferredSku: string) => {
    const baseSku = String(preferredSku || '').trim()
    let candidate = baseSku || `PRD-${String(counter).padStart(4, '0')}`
    while (!baseSku && existingSkus.has(candidate)) candidate = `PRD-${String(++counter).padStart(4, '0')}`
    return candidate
  }

  for (const row of validRows) {
    const sku = makeUniqueSku(row.sku)
    if (existingSkus.has(sku)) {
      skipped++
      errors.push({ row: created + skipped, name: row.name, error: `SKU "${sku}" already exists; existing item was preserved` })
      continue
    }

    const res = await createProduct({
      name: row.name,
      sku,
      category: row.category,
      price: row.price,
      costPrice: 0,
      stock: row.instock,
      reorderLevel: row.reorderLevel,
      description: row.description || undefined,
      material: row.material || undefined,
      color: row.color || undefined,
      warehouse: row.warehouse || undefined,
      unitOfMeasure: 'PCS',
      unitSize: 1,
    })

    if (res.success) {
      created++
      existingSkus.add(sku)
    } else {
      skipped++
      errors.push({ row: created + skipped, name: row.name, error: res.error || 'Unable to import item' })
    }

    counter++
  }

  revalidatePath('/inventory')

  return {
    success: true,
    data: { total: validRows.length, created, skipped, errors },
  }
}

export async function updateProduct(id: number, data: Partial<{
  name: string; price: number; bulkPrice: number | null; stock: number; reorderLevel: number;
  material: string; brand: string; color: string; description: string; image: string; unitSize: number; unitOfMeasure: string;
  stockGroupId: number | null;
}>) {
  try { await requireRole('ADMIN', 'MANAGER', 'STAFF') } catch { return { success: false, error: 'Access denied' } }
  if (!Number.isSafeInteger(id) || id <= 0) return { success: false, error: 'Invalid product' }
  const parsed = updateProductSchema.safeParse(data)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }
  try {
    const product = await inventoryTransaction(prisma, tx => updateInventoryMetadata(tx, id, parsed.data))
    revalidatePath('/inventory')
    revalidatePath('/manufacturing')
    revalidatePath('/godowns')
    return { success: true, data: product }
  } catch (error) { return { success: false, error: inventoryError(error) } }
}

export async function updateRawMaterialInventory(id: number, metadata: unknown, adjustment: unknown) {
  let actor: string
  try { actor = (await requireRole('ADMIN', 'MANAGER', 'STAFF')).user.name } catch { return { success: false, error: 'Access denied' } }
  const fields = updateProductSchema.safeParse(metadata)
  const stock = updateStockSchema.safeParse(adjustment)
  if (!fields.success) return { success: false, error: fields.error.issues[0].message }
  if (!stock.success) return { success: false, error: stock.error.issues[0].message }
  if (stock.data.id !== id || stock.data.godownId) return { success: false, error: 'Invalid raw-material adjustment' }
  try {
    const product = await inventoryTransaction(prisma, async tx => {
      const item = await tx.product.findUnique({ where: { id }, include: { category: true } })
      if (!item || canonicalInventoryCategory(item.category.name) !== 'Raw Material') throw new Error('Raw material not found')
      await updateInventoryMetadata(tx, id, fields.data)
      const current = await prepareStock(tx, id)
      const input = stock.data
      if (input.mode === 'SET' && input.expectedStock !== undefined && Math.abs(current.stock - input.expectedStock) > 0.000001) throw new Error('Stock changed. Refresh before setting a balance.')
      const delta = input.mode === 'ADD' ? input.stock : input.mode === 'REMOVE' ? -input.stock : input.stock - current.stock
      if (delta) await moveTotalStock(tx, id, delta, input.mode === 'SET' ? 'ADJUSTMENT' : delta > 0 ? 'IN' : 'OUT', { referenceType: 'Manual', notes: input.reason || 'Manufacturing raw material adjustment', createdBy: actor })
      return tx.product.findUniqueOrThrow({ where: { id } })
    })
    revalidatePath('/manufacturing'); revalidatePath('/inventory'); revalidatePath('/godowns')
    return { success: true, data: product }
  } catch (error) { return { success: false, error: inventoryError(error) } }
}

export async function updateStock(data: unknown) {
  let actor: string
  try { actor = (await requireRole('ADMIN', 'MANAGER', 'STAFF')).user.name } catch { return { success: false, error: 'Access denied' } }
  const parsed = updateStockSchema.safeParse(data)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }

  try {
    const { id, stock, mode, godownId, expectedStock, reason, notes } = parsed.data
    const product = await inventoryTransaction(prisma, async tx => {
      const current = await prepareStock(tx, id)
      const location = godownId ? await tx.godownStock.findUnique({ where: { productId_godownId: { productId: id, godownId } } }) : null
      const currentQty = godownId ? location?.quantity ?? 0 : current.stock
      if (mode === 'SET' && expectedStock !== undefined && Math.abs(currentQty - expectedStock) > 0.000001) throw new Error('Stock changed since this form was opened. Refresh before setting a balance.')
      if (mode !== 'SET' && stock === 0) throw new Error('Quantity must be greater than zero')
      const diff = mode === 'ADD' ? stock : mode === 'REMOVE' ? -stock : stock - currentQty
      const options = { referenceType: 'Manual', notes: [reason, notes].filter(Boolean).join(' — ') || `Stock ${mode.toLowerCase()} adjustment`, createdBy: actor }
      const entryType = mode === 'ADD' ? 'IN' : mode === 'REMOVE' ? 'OUT' : 'ADJUSTMENT'
      if (godownId) await moveStock(tx, id, godownId, diff, entryType, options)
      else await moveTotalStock(tx, id, diff, entryType, options)
      return tx.product.findUniqueOrThrow({ where: { id } })
    })
    revalidatePath('/inventory')
    revalidatePath('/godowns')
    revalidatePath('/manufacturing')
    return { success: true, data: product }
  } catch (error) {
    return { success: false, error: inventoryError(error) }
  }
}

export async function getCategories() {
  await requireAuth()
  return prisma.category.findMany({ orderBy: { name: 'asc' } })
}

export async function reconcileInventoryStock(id: number, basis: 'PRODUCT' | 'LOCATIONS', expectedProduct: number, expectedLocations: number) {
  let actor: string
  try { actor = (await requireRole('ADMIN', 'MANAGER')).user.name } catch { return { success: false, error: 'Manager access required' } }
  if (!['PRODUCT', 'LOCATIONS'].includes(basis)) return { success: false, error: 'Choose the balance to use' }
  try {
    const product = await inventoryTransaction(prisma, tx => reconcileStock(tx, id, basis, expectedProduct, expectedLocations, actor))
    revalidatePath('/inventory')
    revalidatePath('/godowns')
    revalidatePath('/manufacturing')
    return { success: true, data: product }
  } catch (error) { return { success: false, error: inventoryError(error) } }
}

export async function getWarehouses() {
  await requireAuth()
  return prisma.warehouse.findMany({ orderBy: { name: 'asc' } })
}

export async function getLowStockProducts() {
  await requireAuth()
  const products = await prisma.product.findMany({
    where: {},
    include: { category: true },
    orderBy: { stock: 'asc' },
  })

  // Filter in JS since Prisma can't compare two columns directly
  return products.filter(p => p.stock <= p.reorderLevel).map(p => ({
    id: p.id,
    name: p.name,
    sku: p.sku,
    stock: p.stock,
    reorderLevel: p.reorderLevel,
    category: p.category.name,
  }))
}

export async function deleteProduct(id: number) {
  return moveProductToDraft(id)
}

export async function deleteRawMaterial(id: number) {
  try { await requireRole('ADMIN', 'MANAGER') } catch { return { success: false, error: 'Access denied' } }
  const product = await prisma.product.findUnique({ where: { id }, include: { category: true } })
  if (!product || product.category.name !== 'Raw Material') return { success: false, error: 'Raw material not found' }
  return moveProductToDraft(id)
}
