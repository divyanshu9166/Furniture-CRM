// Checks a raw-material import sheet row by row and explains every problem in
// plain words (which row, which column, what was found, how to fix it), so the
// user never has to guess why an import was refused.

export type ImportField = 'name' | 'brand' | 'sku' | 'costPrice' | 'instock' | 'size' | 'unitSize' | 'unitOfMeasure' | 'reorderLevel' | 'description' | 'image'
export type ImportColumnMap = Partial<Record<ImportField, number>>
export type ImportSheetRow = unknown[] & { __rowNumber?: number }

export interface ImportIssue { column: string; value: string; message: string }
export interface ImportProblem { rowNumber: number; name: string; issues: ImportIssue[] }
export interface ImportWarning { rowNumber: number; name: string; message: string }
export interface ParsedImportRow {
  rowNumber: number
  name: string
  brand: string
  sku: string
  size: string
  costPrice: number
  instock: number
  unitSize: number
  unitOfMeasure: string
  reorderLevel: number
  description: string
  image: string
}

const text = (value: unknown) => String(value ?? '').trim()

/** Blank -> null (use the default); anything that is not a plain number -> NaN. */
function numberCell(value: unknown): number | null {
  if (typeof value === 'number') return value
  const raw = text(value)
  if (!raw) return null
  return /^[+-]?(\d+\.?\d*|\.\d+)$/.test(raw) ? Number(raw) : Number.NaN
}

const shown = (value: unknown) => {
  const raw = text(value)
  return raw.length > 40 ? `${raw.slice(0, 37)}...` : raw
}

function numberHint(raw: string) {
  if (/[₹$,]/.test(raw)) return 'Remove currency symbols and commas, e.g. 1200.50.'
  return 'Use digits only, e.g. 8.8.'
}

export function analyzeRawMaterialImport(rows: ImportSheetRow[], colMap: ImportColumnMap, headers: string[]) {
  const label = (field: ImportField, fallback: string) => {
    const index = colMap[field]
    return index === undefined ? fallback : text(headers[index]) || fallback
  }
  const cell = (row: ImportSheetRow, field: ImportField) => (colMap[field] === undefined ? '' : row[colMap[field] as number])

  const parsed: ParsedImportRow[] = []
  const problems: ImportProblem[] = []
  const warnings: ImportWarning[] = []
  const skuFirstRow = new Map<string, number>()

  rows.forEach((row, index) => {
    const rowNumber = row.__rowNumber ?? index + 2
    const name = text(cell(row, 'name'))
    const issues: ImportIssue[] = []
    const need = (field: ImportField, fallback: string, minimum: 'zero' | 'positive', blankMeans: number | null) => {
      const raw = cell(row, field)
      const value = numberCell(raw)
      const column = label(field, fallback)
      if (value === null) {
        if (blankMeans === null) issues.push({ column, value: '(empty)', message: `This cell is empty. Enter the quantity you have (type 0 if none).` })
        return blankMeans ?? Number.NaN
      }
      if (Number.isNaN(value) || !Number.isFinite(value)) {
        issues.push({ column, value: shown(raw), message: `"${shown(raw)}" is not a number. ${numberHint(text(raw))}` })
        return Number.NaN
      }
      if (minimum === 'zero' && value < 0) issues.push({ column, value: shown(raw), message: `${shown(raw)} is negative. It must be 0 or more.` })
      if (minimum === 'positive' && value <= 0) issues.push({ column, value: shown(raw), message: `${shown(raw)} is not allowed. It must be greater than 0 (leave the cell empty to use 1).` })
      return value
    }

    if (!name) issues.push({ column: label('name', 'PRODUCT NAME'), value: '(empty)', message: 'Product name is empty. Every row needs a name.' })
    const instock = need('instock', 'Instock', 'zero', null)
    const costPrice = need('costPrice', 'Cost price', 'zero', 0)
    const unitSize = need('unitSize', 'Unit Size', 'positive', 1)
    const reorderLevel = need('reorderLevel', 'Reorder Level', 'zero', 5)
    if (Number.isFinite(reorderLevel) && !Number.isInteger(reorderLevel)) {
      issues.push({ column: label('reorderLevel', 'Reorder Level'), value: shown(cell(row, 'reorderLevel')), message: `${shown(cell(row, 'reorderLevel'))} has a decimal. Reorder Level must be a whole number.` })
    }

    const sku = text(cell(row, 'sku'))
    if (sku) {
      const first = skuFirstRow.get(sku.toLowerCase())
      if (first === undefined) skuFirstRow.set(sku.toLowerCase(), rowNumber)
      else warnings.push({ rowNumber, name, message: `SKU "${sku}" is already used by row ${first} in this file, so this row will be skipped. Clear the SKU cell to get an automatic SKU.` })
    }

    if (issues.length > 0) {
      problems.push({ rowNumber, name, issues })
      return
    }
    parsed.push({
      rowNumber,
      name,
      brand: text(cell(row, 'brand')),
      sku,
      size: text(cell(row, 'size')),
      costPrice: Math.round(costPrice * 100) / 100,
      instock,
      unitSize,
      unitOfMeasure: text(cell(row, 'unitOfMeasure')).toUpperCase() || 'PCS',
      reorderLevel,
      description: text(cell(row, 'description')),
      image: text(cell(row, 'image')),
    })
  })

  return { parsed, problems, warnings }
}

/** Explains a missing required column using the headers the file really has. */
export function missingColumnMessage(required: string, accepted: string[], headers: string[]) {
  const found = headers.map(h => text(h)).filter(Boolean)
  return `Column "${required}" was not found in the first row of your file. Rename a header to one of: ${accepted.join(', ')}. The headers I found: ${found.length ? found.join(', ') : '(none)'}.`
}
