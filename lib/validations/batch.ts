import { z } from 'zod'
import { indiaDate } from '../inventory/batches'

export function assertBatchCoverage(stock: number, otherRemaining: number, remaining: number, previousRemaining?: number) {
  if (![stock, otherRemaining, remaining].every(value => Number.isFinite(value) && value >= 0)) throw new Error('Invalid stock or batch balance')
  if (otherRemaining + remaining <= stock + 0.000001) return
  // Allow legacy over-allocation to be corrected one batch at a time. An edit
  // must actually reduce the old balance; new/increased annotations still fail.
  if (previousRemaining !== undefined && Number.isFinite(previousRemaining) && remaining < previousRemaining) return
  throw new Error('Batch balances exceed current physical stock. Record the stock receipt first, or reduce existing batch balances.')
}

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a valid calendar date')
  .refine(value => {
    const parsed = new Date(`${value}T00:00:00.000Z`)
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
  }, 'Use a valid calendar date')

export const batchSchema = z.object({
  productId: z.number().int().positive(),
  batchNumber: z.string().trim().min(1, 'Batch number is required').max(100),
  purchaseDate: date.optional(),
  expiryDate: date.optional(),
  quantity: z.number().positive(),
  remainingQty: z.number().min(0),
  costPrice: z.number().int().min(0).default(0),
  supplierId: z.number().int().positive().optional(),
  poId: z.number().int().positive().optional(),
}).refine(data => data.remainingQty <= data.quantity, 'Remaining quantity cannot exceed the original quantity')
  .refine(data => !data.expiryDate || data.expiryDate >= (data.purchaseDate ?? indiaDate()), 'Expiry cannot be before the purchase date')
  .refine(data => !data.purchaseDate || data.purchaseDate <= indiaDate(), 'Purchase date cannot be in the future')
