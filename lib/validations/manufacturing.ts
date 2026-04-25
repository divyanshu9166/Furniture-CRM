import { z } from 'zod'

export const createWorkCenterSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  type: z.string().default('General'),
  description: z.string().optional(),
  capacity: z.number().min(1).default(1),
  notes: z.string().optional(),
})

export const createBOMSchema = z.object({
  name: z.string().min(1, 'BOM name is required'),
  finishedProductId: z.number(),
  version: z.string().default('1.0'),
  estimatedDays: z.number().min(1).optional(),
  notes: z.string().optional(),
  items: z.array(z.object({
    rawMaterialId: z.number(),
    quantity: z.number().min(0.001),
    unitOfMeasure: z.string().default('PCS'),
    wastagePercent: z.number().min(0).max(100).default(0),
    unitCost: z.number().min(0).default(0),
    notes: z.string().optional(),
  })).min(1, 'At least one raw material required'),
  steps: z.array(z.object({
    stepNumber: z.number(),
    operationName: z.string().min(1),
    workCenterId: z.number().optional(),
    durationMins: z.number().min(0).default(60),
    labourRatePerHour: z.number().min(0).default(0),
    machineCostPerUnit: z.number().min(0).default(0),
    notes: z.string().optional(),
  })).optional(),
})

export const createProductionOrderSchema = z.object({
  bomId: z.number(),
  plannedQty: z.number().min(1),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).default('MEDIUM'),
  dueDate: z.string().optional(),
  startDate: z.string().optional(),
  workCenterId: z.number().optional(),
  assignedStaffId: z.number().int().positive().optional(),
  assignedTo: z.string().optional(),
  notes: z.string().optional(),
})

export const completeProductionSchema = z.object({
  productionOrderId: z.number(),
  actualQty: z.number().min(1),
  totalLabourCost: z.number().min(0).default(0),
  overheadCost: z.number().min(0).default(0),
  machineCost: z.number().min(0).default(0),
  scrapQty: z.number().min(0).default(0),
  scrapReason: z.string().optional(),
  qualityStatus: z.enum(['PASSED', 'FAILED', 'PARTIAL']).default('PASSED'),
  qualityNotes: z.string().optional(),
  notes: z.string().optional(),
  consumptions: z.array(z.object({
    rawMaterialId: z.number(),
    actualQty: z.number().min(0),
  })),
})

export const qualityCheckSchema = z.object({
  productionOrderId: z.number(),
  qualityStatus: z.enum(['PASSED', 'FAILED', 'PARTIAL']),
  qualityNotes: z.string().optional(),
  scrapQty: z.number().min(0).default(0),
  scrapReason: z.string().optional(),
})

// ─── BOM Item management ─────────────────────────────
export const addBOMItemSchema = z.object({
  bomId: z.number(),
  rawMaterialId: z.number(),
  quantity: z.number().min(0.001),
  unitOfMeasure: z.string().default('PCS'),
  wastagePercent: z.number().min(0).max(100).default(0),
  unitCost: z.number().min(0).default(0),
  notes: z.string().optional(),
})

export const updateBOMItemSchema = z.object({
  id: z.number(),
  quantity: z.number().min(0.001).optional(),
  unitOfMeasure: z.string().optional(),
  wastagePercent: z.number().min(0).max(100).optional(),
  unitCost: z.number().min(0).optional(),
  notes: z.string().optional(),
})

// ─── BOM Step management ─────────────────────────────
export const addBOMStepSchema = z.object({
  bomId: z.number(),
  operationName: z.string().min(1),
  workCenterId: z.number().optional(),
  durationMins: z.number().min(0).default(60),
  labourRatePerHour: z.number().min(0).default(0),
  machineCostPerUnit: z.number().min(0).default(0),
  notes: z.string().optional(),
})

export const updateBOMStepSchema = z.object({
  id: z.number(),
  operationName: z.string().optional(),
  workCenterId: z.number().optional().nullable(),
  durationMins: z.number().min(0).optional(),
  labourRatePerHour: z.number().min(0).optional(),
  machineCostPerUnit: z.number().min(0).optional(),
  notes: z.string().optional(),
})

// ─── BOM Template ────────────────────────────────────
export const createBomTemplateSchema = z.object({
  name: z.string().min(1, 'Template name is required'),
  description: z.string().optional(),
  steps: z.array(z.object({
    stepNumber: z.number(),
    operationName: z.string().min(1),
    workCenterId: z.number().optional(),
    durationMins: z.number().min(0).default(60),
    labourRatePerHour: z.number().min(0).default(0),
    machineCostPerUnit: z.number().min(0).default(0),
    notes: z.string().optional(),
  })).min(1, 'At least one step required'),
})
