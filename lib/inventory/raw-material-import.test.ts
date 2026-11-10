import test from 'node:test'
import assert from 'node:assert/strict'
import { analyzeRawMaterialImport, missingColumnMessage, type ImportSheetRow } from './raw-material-import'

const headers = ['PRODUCT NAME', 'SIZE', 'brand', 'SKU', 'Instock', 'Cost price', 'Unit Size', 'UOM', 'Reorder Level']
const colMap = { name: 0, size: 1, brand: 2, sku: 3, instock: 4, costPrice: 5, unitSize: 6, unitOfMeasure: 7, reorderLevel: 8 }
const row = (cells: unknown[], rowNumber: number): ImportSheetRow => Object.assign(cells, { __rowNumber: rowNumber })

test('decimal cost prices (paise) are accepted and kept', () => {
  const { parsed, problems } = analyzeRawMaterialImport([
    row(['Silver Grey', '', 'Solid Edge', 'ES22M1006', 100, 8.8, 1, 'MTR', 5], 2),
    row(['Screw', '', '', 'S838', 3000, '0.52', '', 'PCS', ''], 3),
  ], colMap, headers)
  assert.equal(problems.length, 0)
  assert.deepEqual(parsed.map(r => r.costPrice), [8.8, 0.52])
  assert.equal(parsed[1].unitSize, 1)
  assert.equal(parsed[1].reorderLevel, 5)
})

test('problems name the row, the column header, the value and the fix', () => {
  const { parsed, problems } = analyzeRawMaterialImport([
    row(['Bad cost', '', '', '', 10, '₹1,200', 1, 'PCS', 5], 7),
    row(['', '', '', '', '', -3, 0, 'PCS', 2.5], 9),
  ], colMap, headers)
  assert.equal(parsed.length, 0)
  assert.equal(problems[0].rowNumber, 7)
  assert.equal(problems[0].issues[0].column, 'Cost price')
  assert.match(problems[0].issues[0].message, /is not a number.*currency symbols/)
  const second = problems[1].issues.map(i => `${i.column}: ${i.message}`).join('\n')
  assert.match(second, /PRODUCT NAME: Product name is empty/)
  assert.match(second, /Instock: This cell is empty/)
  assert.match(second, /Cost price: -3 is negative/)
  assert.match(second, /Unit Size: 0 is not allowed/)
  assert.match(second, /Reorder Level: 2.5 has a decimal/)
})

test('a repeated SKU in the file is warned about with the first row number', () => {
  const { warnings } = analyzeRawMaterialImport([
    row(['A', '', '', 'CR1', 1, 1, 1, 'PCS', 5], 2),
    row(['B', '', '', 'cr1', 1, 1, 1, 'PCS', 5], 5),
  ], colMap, headers)
  assert.equal(warnings.length, 1)
  assert.match(warnings[0].message, /already used by row 2/)
})

test('missing column message lists the headers found', () => {
  assert.match(missingColumnMessage('Instock', ['Instock'], ['Name', 'Qty']), /Name, Qty/)
})
