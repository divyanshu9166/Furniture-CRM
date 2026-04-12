import { z } from 'zod'

export const createBOMSchema = z.object({
  name: z.string().min(1, 'BOM name is required'),
  finishedProductId: z.number(),
  version: z.string().default('1.0'),
  notes: z.string().optional(),
  items: z.array(z.object({
    rawMaterialId: z.number(),
    quantity: z.number().min(0.001),
    unitOfMeasure: z.string().default('PCS'),
    wastagePercent: z.number().min(0).max(100).default(0),
    notes: z.string().optional(),
  })).min(1, 'At least one raw material required'),
})

export const createProductionOrderSchema = z.object({
  bomId: z.number(),
  plannedQty: z.number().min(1),
  startDate: z.string().optional(),
  notes: z.string().optional(),
})

export const completeProductionSchema = z.object({
  productionOrderId: z.number(),
  actualQty: z.number().min(1),
  totalLabourCost: z.number().min(0).default(0),
  notes: z.string().optional(),
  consumptions: z.array(z.object({
    rawMaterialId: z.number(),
    actualQty: z.number().min(0),
  })),
})
