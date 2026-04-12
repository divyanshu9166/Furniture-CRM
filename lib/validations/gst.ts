import { z } from 'zod'

export const generateReturnSchema = z.object({
  returnType: z.enum(['GSTR1', 'GSTR2', 'GSTR3B', 'GSTR9']),
  period: z.string().regex(/^\d{4}-\d{2}$/, 'Period must be YYYY-MM format'),
})

export const createHsnCodeSchema = z.object({
  code: z.string().min(4).max(8),
  description: z.string().min(1),
  gstRate: z.number().min(0).max(100).default(18),
  cessRate: z.number().min(0).default(0),
  type: z.enum(['GOODS', 'SERVICES']).default('GOODS'),
})

export const createEWayBillSchema = z.object({
  invoiceId: z.number().optional(),
  ewbNumber: z.string().optional(),
  vehicleNo: z.string().optional(),
  transporterGSTIN: z.string().optional(),
  transporterName: z.string().optional(),
  fromAddress: z.string().optional(),
  toAddress: z.string().optional(),
  distance: z.number().optional(),
  goodsDesc: z.string().optional(),
  hsnCode: z.string().optional(),
  quantity: z.number().optional(),
  value: z.number().min(0).default(0),
  validFrom: z.string().optional(),
  validUntil: z.string().optional(),
  notes: z.string().optional(),
})
