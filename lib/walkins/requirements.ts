import { z } from 'zod'
import type { Prisma, PrismaClient } from '@prisma/client'

// Union of the former reception and QR lists: no existing choice disappears
// merely because the editable configuration feature is installed.
export const DEFAULT_WALKIN_REQUIREMENTS = [
  'Sofa / Sofa Set', 'Bed', 'Bed & Mattress', 'Dining Table', 'Wardrobe',
  'Office Chair', 'Office Furniture', 'TV Unit', 'Bookshelf / Storage',
  'Kids Furniture', 'Modular Kitchen', 'Dressing Table', 'Center Table',
  'Home Decor', 'Other',
]

export const requirementLabelSchema = z.string()
  .transform(value => value.trim().replace(/\s+/g, ' '))
  .pipe(z.string().min(1, 'Requirement cannot be blank').max(100, 'Use 100 characters or fewer per requirement'))

export const requirementOptionsSchema = z.array(requirementLabelSchema)
  .min(1, 'Keep at least one requirement option')
  .max(100, 'You can have up to 100 requirement options')
  .refine(options => new Set(options.map(value => value.toLowerCase())).size === options.length,
    'Requirement options must be unique (ignoring case and extra spaces)')

export const saveRequirementsSchema = z.object({
  options: requirementOptionsSchema,
  revision: z.number().int().min(0).max(2147483646),
})

type RequirementsDb = Pick<PrismaClient | Prisma.TransactionClient, 'walkinRequirementSettings'>

export async function readWalkinRequirements(db: RequirementsDb) {
  const row = await db.walkinRequirementSettings.findUnique({ where: { id: 1 } })
  // Missing configuration is different from an unreadable database. Never
  // silently replace a saved list with defaults on a connection/schema error.
  if (!row) return { options: [...DEFAULT_WALKIN_REQUIREMENTS], revision: 0 }
  return { options: requirementOptionsSchema.parse(row.options), revision: row.revision }
}

export class RequirementsChangedError extends Error {
  constructor(message = 'Requirements were changed by another user. Reload the latest list before saving.') {
    super(message)
    this.name = 'RequirementsChangedError'
  }
}

export async function saveWalkinRequirements(db: RequirementsDb, input: unknown) {
  const { options, revision } = saveRequirementsSchema.parse(input)
  if (revision === 0) {
    try {
      await db.walkinRequirementSettings.create({ data: { id: 1, options, revision: 1 } })
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') throw new RequirementsChangedError()
      throw error
    }
  } else {
    // Compare-and-swap prevents one browser overwriting another admin's edits.
    const result = await db.walkinRequirementSettings.updateMany({
      where: { id: 1, revision }, data: { options, revision: { increment: 1 } },
    })
    if (result.count !== 1) throw new RequirementsChangedError()
  }
  return { options, revision: revision + 1 }
}

export async function assertWalkinRequirement(db: RequirementsDb, value: string) {
  const { options } = await readWalkinRequirements(db)
  if (!options.includes(value)) {
    throw new RequirementsChangedError('This requirement is no longer available. Refresh the options and select again.')
  }
}
