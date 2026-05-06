'use server'

import { prisma } from '@/lib/db'
import { revalidatePath } from 'next/cache'
import { createProductSchema, updateStockSchema } from '@/lib/validations/product'
import { moveProductToDraft } from './drafts'

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

const toNumber = (value: unknown, fallback = 0) => {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

const toRequiredNumber = (value: unknown) => {
  const text = String(value ?? '').trim()
  if (!text) return Number.NaN
  const n = Number(text)
  return Number.isFinite(n) ? n : Number.NaN
}

export async function getProducts() {
  const products = await prisma.product.findMany({
    include: { category: true, warehouse: true },
    orderBy: { name: 'asc' },
  })

  return {
    success: true,
    data: products.map(p => ({
      id: p.id,
      sku: p.sku,
      name: p.name,
      category: p.category.name,
      categoryId: p.categoryId,
      price: p.price,
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
      lastRestocked: p.lastRestocked?.toISOString().split('T')[0] || null,
    })),
  }
}

export async function getProduct(id: number) {
  const product = await prisma.product.findUnique({
    where: { id },
    include: { category: true, warehouse: true },
  })

  if (!product) return { success: false, error: 'Product not found' }
  return { success: true, data: product }
}

export async function createProduct(data: unknown) {
  const parsed = createProductSchema.safeParse(data)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }

  const { category, warehouse, unitOfMeasure, unitSize, godownId, ...rest } = parsed.data

  // Find or create category
  const cat = await prisma.category.upsert({
    where: { name: category },
    create: { name: category },
    update: {},
  })

  // Find or create warehouse if provided
  let warehouseId: number | undefined
  if (warehouse) {
    const wh = await prisma.warehouse.upsert({
      where: { name: warehouse },
      create: { name: warehouse },
      update: {},
    })
    warehouseId = wh.id
  }

  // Check for duplicate SKU before creating
  const existingSku = await prisma.product.findUnique({ where: { sku: rest.sku } })
  if (existingSku) {
    return { success: false, error: `A product with SKU "${rest.sku}" already exists. Please use a unique SKU.` }
  }

  // Create the product with stock = 0 initially (sync engine will set it)
  const normalizedUnitSize = Number(unitSize) > 0 ? Number(unitSize) : 1
  const initialStockQty = rest.stock || 0
  const initialStock = initialStockQty * normalizedUnitSize
  let product
  try {
    product = await prisma.product.create({
      data: {
        ...rest,
        stock: 0, // Will be set by sync engine
        unitOfMeasure: unitOfMeasure || 'PCS',
        unitSize: normalizedUnitSize,
        categoryId: cat.id,
        warehouseId,
      },
    })
  } catch (err: any) {
    if (err.code === 'P2002') {
      return { success: false, error: `A product with SKU "${rest.sku}" already exists. Please use a unique SKU.` }
    }
    return { success: false, error: err.message || 'Failed to create product' }
  }

  // Allocate initial stock to the selected godown (like Odoo's stock.move on receipt)
  if (initialStock > 0) {
    const { adjustGodownStock, getOrCreateDefaultGodown } = await import('./godowns')
    const godownCount = await prisma.godown.count()

    if (godownCount > 0) {
      // Use selected godown, or fall back to default
      let targetGodownId = godownId
      if (!targetGodownId) {
        const defaultGodown = await getOrCreateDefaultGodown()
        targetGodownId = defaultGodown.id
      }

      await adjustGodownStock(product.id, targetGodownId, initialStock, 'IN', {
        referenceType: 'Manual',
        notes: `Initial stock on product creation`,
        createdBy: 'Admin',
      })
    } else {
      // No godowns exist — set stock directly (legacy)
      await prisma.product.update({
        where: { id: product.id },
        data: { stock: initialStock },
      })
    }
  }

  revalidatePath('/inventory')
  revalidatePath('/godowns')
  return { success: true, data: product }
}

export async function bulkImportRawMaterials(rows: BulkRawMaterialRow[]) {
  if (!rows || rows.length === 0) return { success: false, error: 'No raw materials to import' }

  const validRows = rows
    .map(r => ({
      name: String(r.name || '').trim(),
      brand: String(r.brand || '').trim(),
      sku: String(r.sku || '').trim(),
      sizeLabel: String(r.size ?? '').trim(),
      costPrice: toNumber(r.costPrice, 0),
      stockQuantity: toRequiredNumber(r.instock ?? r.stockQuantity),
      unitSize: Math.max(1, toNumber(r.unitSize, 1)),
      unitOfMeasure: String(r.unitOfMeasure || '').trim().toUpperCase() || 'PCS',
      reorderLevel: Math.max(0, toNumber(r.reorderLevel, 5)),
      description: String(r.description || '').trim(),
      image: String(r.image || '').trim(),
    }))
    .filter(r => r.name && Number.isFinite(r.stockQuantity))

  if (validRows.length === 0) {
    return { success: false, error: 'No valid rows found. Product name, size, and in-stock are required.' }
  }

  const existingSkus = new Set(
    (await prisma.product.findMany({ select: { sku: true } })).map(p => p.sku)
  )

  let created = 0
  let skipped = 0

  let counter = (await prisma.product.count({ where: { category: { name: 'Raw Material' } } })) + 1

  const makeUniqueSku = (preferredSku: string) => {
    const baseSku = String(preferredSku || '').trim()
    let candidate = baseSku || `RM-${String(counter).padStart(3, '0')}`
    let suffix = 1

    while (existingSkus.has(candidate)) {
      candidate = baseSku ? `${baseSku}-${suffix++}` : `RM-${String((counter + suffix - 1)).padStart(3, '0')}`
    }

    existingSkus.add(candidate)
    return candidate
  }

  for (const row of validRows) {
    const sku = makeUniqueSku(row.sku)

    const res = await createProduct({
      name: row.name,
      brand: row.brand || undefined,
      sku,
      category: 'Raw Material',
      price: 0,
      costPrice: Math.max(0, row.costPrice),
      stock: Math.max(0, row.stockQuantity),
      unitOfMeasure: row.unitOfMeasure || 'PCS',
      unitSize: row.unitSize,
      reorderLevel: row.reorderLevel,
      description: row.description || row.sizeLabel || undefined,
      image: row.image || undefined,
    })

    if (res.success) {
      created++
    } else {
      skipped++
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
    },
  }
}

export async function updateProduct(id: number, data: Partial<{
  name: string; price: number; stock: number; reorderLevel: number;
  material: string; brand: string; color: string; description: string; image: string; unitSize: number; unitOfMeasure: string;
}>) {
  const product = await prisma.product.update({
    where: { id },
    data,
  })

  revalidatePath('/inventory')
  return { success: true, data: product }
}

export async function updateStock(data: unknown) {
  const parsed = updateStockSchema.safeParse(data)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }

  const { adjustGodownStock, getOrCreateDefaultGodown } = await import('./godowns')

  // Check if godowns exist
  const godownCount = await prisma.godown.count()

  if (godownCount > 0) {
    // Route through godown sync engine
    const product = await prisma.product.findUnique({ where: { id: parsed.data.id } })
    if (!product) return { success: false, error: 'Product not found' }

    // Determine target godown: user-selected or default
    let targetGodownId = parsed.data.godownId
    if (!targetGodownId) {
      const defaultGodown = await getOrCreateDefaultGodown()
      targetGodownId = defaultGodown.id
    }

    // Get current stock at this specific godown
    const godownStock = await prisma.godownStock.findUnique({
      where: { productId_godownId: { productId: parsed.data.id, godownId: targetGodownId } },
    })
    const currentGodownQty = godownStock?.quantity || 0
    const diff = parsed.data.stock - currentGodownQty

    if (diff === 0) return { success: true, data: product }

    const entryType = diff > 0 ? 'IN' : 'OUT'
    await adjustGodownStock(parsed.data.id, targetGodownId, diff, entryType, {
      referenceType: 'Manual',
      notes: `Stock adjusted at godown (${currentGodownQty} → ${parsed.data.stock})`,
      createdBy: 'Admin',
    })
    await prisma.product.update({
      where: { id: parsed.data.id },
      data: { lastRestocked: diff > 0 ? new Date() : undefined },
    })
  } else {
    // No godowns — direct update (legacy behavior)
    await prisma.product.update({
      where: { id: parsed.data.id },
      data: { stock: parsed.data.stock, lastRestocked: new Date() },
    })
  }

  revalidatePath('/inventory')
  revalidatePath('/godowns')
  return { success: true, data: await prisma.product.findUnique({ where: { id: parsed.data.id } }) }
}

export async function getCategories() {
  return prisma.category.findMany({ orderBy: { name: 'asc' } })
}

export async function getWarehouses() {
  return prisma.warehouse.findMany({ orderBy: { name: 'asc' } })
}

export async function getLowStockProducts() {
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
  try {
    // Get the product
    const product = await prisma.product.findUnique({
      where: { id },
      include: { category: true },
    })
    
    if (!product) {
      return { success: false, error: 'Product not found' }
    }

    // Only allow deletion for raw materials
    if (product.category.name !== 'Raw Material') {
      return { success: false, error: 'Only raw materials can be deleted using this function' }
    }

    // Delete in transaction:
    // 1. Delete stock ledger entries
    // 2. Delete godown stock entries
    // 3. Delete other potential dependencies (batches, BOM items)
    // 4. Delete the product itself
    await prisma.$transaction([
      prisma.stockLedger.deleteMany({ where: { productId: id } }),
      prisma.godownStock.deleteMany({ where: { productId: id } }),
      prisma.productBatch.deleteMany({ where: { productId: id } }),
      prisma.bomItem.deleteMany({ where: { rawMaterialId: id } }),
      prisma.product.delete({ where: { id } }),
    ])

    revalidatePath('/manufacturing')
    return { success: true }
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : 'Failed to delete raw material'
    return { success: false, error: errMsg }
  }
}
