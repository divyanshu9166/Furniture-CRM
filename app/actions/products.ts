'use server'

import { prisma } from '@/lib/db'
import { revalidatePath } from 'next/cache'
import { createProductSchema, updateStockSchema } from '@/lib/validations/product'

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
      unitOfMeasure: p.unitOfMeasure,
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

  const { category, warehouse, unitOfMeasure, godownId, ...rest } = parsed.data

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
  const initialStock = rest.stock || 0
  let product
  try {
    product = await prisma.product.create({
      data: {
        ...rest,
        stock: 0, // Will be set by sync engine
        unitOfMeasure: unitOfMeasure || 'PCS',
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

export async function updateProduct(id: number, data: Partial<{
  name: string; price: number; stock: number; reorderLevel: number;
  material: string; color: string; description: string; image: string;
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
  try {
    // Check if product is used in any BOM items
    const bomUsage = await prisma.bomItem.count({ where: { rawMaterialId: id } })
    if (bomUsage > 0) {
      return { success: false, error: `Cannot delete: this material is used in ${bomUsage} BOM(s). Remove it from those BOMs first.` }
    }

    // Check if product is a finished product in any BOM
    const bomFinished = await prisma.billOfMaterials.count({ where: { finishedProductId: id } })
    if (bomFinished > 0) {
      return { success: false, error: 'Cannot delete: this product is used as a finished product in a BOM.' }
    }

    // Check if product is in any production order
    const prodUsage = await prisma.productionOrder.count({ where: { finishedProductId: id } })
    if (prodUsage > 0) {
      return { success: false, error: 'Cannot delete: this product is tied to production orders.' }
    }

    await prisma.product.delete({ where: { id } })
    revalidatePath('/inventory')
    revalidatePath('/manufacturing')
    return { success: true }
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to delete product' }
  }
}
