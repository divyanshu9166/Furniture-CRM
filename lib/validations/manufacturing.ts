import { z } from 'zod'
import { calendarDate } from './calendar'
const rawQuantity = z.number().min(0).multipleOf(0.001, 'Material quantities support up to three decimal places')

export const createWorkCenterSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(200),
  type: z.string().default('General'),
  description: z.string().optional(),
  capacity: z.number().int().min(1).default(1),
  notes: z.string().optional(),
})

export const createBOMSchema = z.object({
  name: z.string().trim().min(1, 'BOM name is required').max(200),
  finishedProductId: z.number().int().positive(),
  version: z.string().default('1.0'),
  estimatedDays: z.number().int().min(1).optional(),
  notes: z.string().optional(),
  items: z.array(z.object({
    rawMaterialId: z.number().int().positive(),
    quantity: z.number().min(0.001),
    unitOfMeasure: z.string().trim().min(1).max(20).default('PCS'),
    wastagePercent: z.number().min(0).max(100).default(0),
    unitCost: z.number().min(0).default(0),
    notes: z.string().optional(),
  })).min(1, 'At least one raw material required'),
  steps: z.array(z.object({
    stepNumber: z.number().int().positive(),
    operationName: z.string().trim().min(1).max(200),
    workCenterId: z.number().int().positive().optional(),
    durationMins: z.number().int().min(0).default(60),
    labourRatePerHour: z.number().min(0).default(0),
    machineCostPerUnit: z.number().min(0).default(0),
    notes: z.string().optional(),
  })).optional(),
}).refine(data => new Set(data.items.map(item => item.rawMaterialId)).size === data.items.length, 'Each raw material must appear once in the BOM')
  .refine(data => !data.steps || new Set(data.steps.map(step => step.stepNumber)).size === data.steps.length, 'Routing step numbers must be unique')

export const createProductionOrderSchema = z.object({
  bomId: z.number().int().positive(),
  customOrderId: z.number().int().positive().optional(),
  plannedQty: z.number().int().min(1),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).default('MEDIUM'),
  dueDate: calendarDate.optional(),
  startDate: calendarDate.optional(),
  workCenterId: z.number().int().positive().optional(),
  assignedStaffId: z.number().int().positive().optional(),
  assignedTo: z.string().optional(),
  notes: z.string().optional(),
}).refine(data => !data.dueDate || !data.startDate || data.dueDate >= data.startDate, 'Due date cannot precede the start date')

export const completeProductionSchema = z.object({
  productionOrderId: z.number().int().positive(),
  actualQty: z.number().int().min(0),
  totalLabourCost: z.number().int().min(0).optional(),
  overheadCost: z.number().int().min(0).default(0),
  machineCost: z.number().int().min(0).optional(),
  scrapQty: z.number().int().min(0).default(0),
  scrapReason: z.string().optional(),
  qualityStatus: z.enum(['PASSED', 'FAILED', 'PARTIAL']).default('PASSED'),
  qualityNotes: z.string().optional(),
  notes: z.string().optional(),
  consumptions: z.array(z.object({
    rawMaterialId: z.number().int().positive(),
    issuedQty: rawQuantity.default(0),  // Qty issued annotation; physical stock uses backflush
    actualQty: rawQuantity,
    scrapQty: rawQuantity.default(0),
    scrapReason: z.string().optional(),
  })).min(1, 'Record material consumption'),
  stepActuals: z.array(z.object({
    stepId: z.number().int().positive(),
    actualMins: z.number().int().min(0),
  })).optional(),
}).refine(data => data.scrapQty <= data.actualQty, 'Finished scrap cannot exceed produced quantity')
  .refine(data => data.actualQty > 0 || data.qualityStatus === 'FAILED', 'Zero output must be marked FAILED')
  .refine(data => new Set(data.consumptions.map(item => item.rawMaterialId)).size === data.consumptions.length, 'Duplicate consumption material')
  .refine(data => !data.stepActuals || new Set(data.stepActuals.map(step => step.stepId)).size === data.stepActuals.length, 'Duplicate step timing')

export const qualityCheckSchema = z.object({
  productionOrderId: z.number().int().positive(),
  qualityStatus: z.enum(['PASSED', 'FAILED', 'PARTIAL']),
  qualityNotes: z.string().optional(),
  scrapQty: z.number().int().min(0).default(0),
  scrapReason: z.string().optional(),
})

// ─── BOM Item management ─────────────────────────────
export const addBOMItemSchema = z.object({
  bomId: z.number().int().positive(),
  rawMaterialId: z.number().int().positive(),
  quantity: z.number().min(0.001),
  unitOfMeasure: z.string().trim().min(1).max(20).default('PCS'),
  wastagePercent: z.number().min(0).max(100).default(0),
  unitCost: z.number().min(0).default(0),
  notes: z.string().optional(),
})

export const updateBOMItemSchema = z.object({
  id: z.number().int().positive(),
  quantity: z.number().min(0.001).optional(),
  unitOfMeasure: z.string().trim().min(1).max(20).optional(),
  wastagePercent: z.number().min(0).max(100).optional(),
  unitCost: z.number().min(0).optional(),
  notes: z.string().optional(),
})

// ─── BOM Step management ─────────────────────────────
export const addBOMStepSchema = z.object({
  bomId: z.number().int().positive(),
  operationName: z.string().trim().min(1).max(200),
  workCenterId: z.number().int().positive().optional(),
  durationMins: z.number().int().min(0).default(60),
  labourRatePerHour: z.number().min(0).default(0),
  machineCostPerUnit: z.number().min(0).default(0),
  notes: z.string().optional(),
})

export const updateBOMStepSchema = z.object({
  id: z.number().int().positive(),
  operationName: z.string().optional(),
  workCenterId: z.number().int().positive().optional().nullable(),
  durationMins: z.number().int().min(0).optional(),
  labourRatePerHour: z.number().min(0).optional(),
  machineCostPerUnit: z.number().min(0).optional(),
  notes: z.string().optional(),
})

// ─── BOM Template ────────────────────────────────────
export const createBomTemplateSchema = z.object({
  name: z.string().min(1, 'Template name is required'),
  description: z.string().optional(),
  steps: z.array(z.object({
    stepNumber: z.number().int().positive(),
    operationName: z.string().trim().min(1).max(200),
    workCenterId: z.number().int().positive().optional(),
    durationMins: z.number().int().min(0).default(60),
    labourRatePerHour: z.number().min(0).default(0),
    machineCostPerUnit: z.number().min(0).default(0),
    notes: z.string().optional(),
  })).min(1, 'At least one step required'),
})
