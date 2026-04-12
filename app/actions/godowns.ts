'use server'

import { prisma } from '@/lib/db'
import { revalidatePath } from 'next/cache'
import { requireRole } from '@/lib/auth-helpers'
import { createBranchSchema, createGodownSchema, createTransferSchema } from '@/lib/validations/godown'

// ─── BRANCHES ────────────────────────────────────────

export async function getBranches() {
  const branches = await prisma.branch.findMany({
    orderBy: { name: 'asc' },
    include: { _count: { select: { godowns: true } } },
  })
  return { success: true, data: branches }
}

export async function createBranch(data: unknown) {
  try { await requireRole('ADMIN') } catch { return { success: false, error: 'Admin access required' } }
  const parsed = createBranchSchema.safeParse(data)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }

  const branch = await prisma.branch.create({ data: parsed.data })
  revalidatePath('/godowns')
  return { success: true, data: branch }
}

// ─── GODOWNS ─────────────────────────────────────────

export async function getGodowns() {
  const godowns = await prisma.godown.findMany({
    orderBy: { name: 'asc' },
    include: {
      branch: { select: { name: true } },
      _count: { select: { stocks: true } },
    },
  })
  return { success: true, data: godowns }
}

export async function createGodown(data: unknown) {
  try { await requireRole('ADMIN', 'MANAGER') } catch { return { success: false, error: 'Access denied' } }
  const parsed = createGodownSchema.safeParse(data)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }

  const godown = await prisma.godown.create({ data: parsed.data })
  revalidatePath('/godowns')
  return { success: true, data: godown }
}

// ─── GODOWN STOCK ─────────────────────────────────────

export async function getGodownStock(godownId?: number) {
  const stocks = await prisma.godownStock.findMany({
    where: godownId ? { godownId } : undefined,
    include: {
      product: { select: { name: true, sku: true, category: { select: { name: true } } } },
      godown: { select: { name: true } },
    },
    orderBy: { product: { name: 'asc' } },
  })
  return { success: true, data: stocks }
}

export async function updateGodownStock(productId: number, godownId: number, quantity: number) {
  try { await requireRole('ADMIN', 'MANAGER') } catch { return { success: false, error: 'Access denied' } }

  const stock = await prisma.godownStock.upsert({
    where: { productId_godownId: { productId, godownId } },
    create: { productId, godownId, quantity },
    update: { quantity },
  })
  revalidatePath('/godowns')
  return { success: true, data: stock }
}

// ─── INTER-GODOWN TRANSFERS ──────────────────────────

export async function getTransfers() {
  const transfers = await prisma.godownTransfer.findMany({
    orderBy: { date: 'desc' },
    include: {
      fromGodown: { select: { name: true } },
      toGodown: { select: { name: true } },
      items: { include: { product: { select: { name: true, sku: true } } } },
    },
  })
  return { success: true, data: transfers }
}

export async function createTransfer(data: unknown) {
  try { await requireRole('ADMIN', 'MANAGER') } catch { return { success: false, error: 'Access denied' } }
  const parsed = createTransferSchema.safeParse(data)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }

  const { fromGodownId, toGodownId, notes, requestedBy, items } = parsed.data
  if (fromGodownId === toGodownId) return { success: false, error: 'Source and destination godown cannot be the same' }

  const count = await prisma.godownTransfer.count()
  const displayId = `TRF-${String(count + 1).padStart(4, '0')}`

  const transfer = await prisma.godownTransfer.create({
    data: {
      displayId,
      fromGodownId,
      toGodownId,
      notes,
      requestedBy,
      items: {
        create: items.map(i => ({
          productId: i.productId,
          name: i.name,
          sku: i.sku,
          quantity: i.quantity,
        })),
      },
    },
  })
  revalidatePath('/godowns')
  return { success: true, data: transfer }
}

export async function completeTransfer(id: number, approvedBy?: string) {
  try { await requireRole('ADMIN', 'MANAGER') } catch { return { success: false, error: 'Access denied' } }

  const transfer = await prisma.godownTransfer.findUnique({
    where: { id },
    include: { items: true },
  })
  if (!transfer) return { success: false, error: 'Transfer not found' }
  if (transfer.status === 'Completed') return { success: false, error: 'Already completed' }

  await prisma.$transaction(async (tx) => {
    for (const item of transfer.items) {
      // Decrement from source
      await tx.godownStock.upsert({
        where: { productId_godownId: { productId: item.productId, godownId: transfer.fromGodownId } },
        create: { productId: item.productId, godownId: transfer.fromGodownId, quantity: 0 },
        update: { quantity: { decrement: item.quantity } },
      })
      // Increment at destination
      await tx.godownStock.upsert({
        where: { productId_godownId: { productId: item.productId, godownId: transfer.toGodownId } },
        create: { productId: item.productId, godownId: transfer.toGodownId, quantity: item.quantity },
        update: { quantity: { increment: item.quantity } },
      })
    }
    await tx.godownTransfer.update({
      where: { id },
      data: { status: 'Completed', approvedBy },
    })
  })

  revalidatePath('/godowns')
  return { success: true }
}
