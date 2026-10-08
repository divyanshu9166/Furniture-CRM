import * as XLSX from 'xlsx'
import { campaignEmailSchema, MAX_CAMPAIGN_RECIPIENTS, MAX_RECIPIENT_FILE_BYTES } from './email-audience'

export type RecipientImportPreview = {
  emails: Array<{ email: string; name: string }>
  issues: Array<{ row: number; error: string }>
  invalid: number; duplicates: number; totalRows: number; sheet: string
}

/** Bound XLSX expanded data before parsing; the UI runs parsing in a disposable
 * worker with a timeout as a second guard, never on the main UI/server thread. */
function checkZipBudget(bytes: Uint8Array) {
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) return
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let end = -1
  for (let offset = bytes.length - 22; offset >= Math.max(0, bytes.length - 65557); offset--) {
    if (view.getUint32(offset, true) === 0x06054b50) { end = offset; break }
  }
  if (end < 0) throw new Error('Invalid Excel archive.')
  const count = view.getUint16(end + 10, true)
  let offset = view.getUint32(end + 16, true), expanded = 0
  if (count > 1000 || offset > bytes.length) throw new Error('Excel archive is too complex. Export a simple recipient sheet or CSV.')
  for (let index = 0; index < count; index++) {
    if (offset + 46 > bytes.length || view.getUint32(offset, true) !== 0x02014b50) throw new Error('Invalid Excel archive directory.')
    if (view.getUint16(offset + 8, true) & 1) throw new Error('Password-protected files are not supported.')
    expanded += view.getUint32(offset + 24, true)
    if (expanded > 20 * 1024 * 1024) throw new Error('Expanded Excel file exceeds 20 MB. Export a simple recipient sheet or CSV.')
    offset += 46 + view.getUint16(offset + 28, true) + view.getUint16(offset + 30, true) + view.getUint16(offset + 32, true)
  }
}

export function parseRecipientFile(bytes: Uint8Array, filename: string): RecipientImportPreview {
  if (!/\.(csv|xlsx|xls)$/i.test(filename)) throw new Error('Choose a CSV, XLSX or XLS file.')
  if (!bytes.length || bytes.length > MAX_RECIPIENT_FILE_BYTES) throw new Error('Choose a non-empty file no larger than 5 MB.')
  checkZipBudget(bytes)
  let workbook: XLSX.WorkBook
  try { workbook = XLSX.read(bytes, { type: 'array', sheets: 0, sheetRows: MAX_CAMPAIGN_RECIPIENTS + 2, cellFormula: true, cellHTML: false, cellStyles: false, bookVBA: false }) }
  catch { throw new Error('Unable to read this file. Use an unencrypted CSV/Excel file with Email and optional Name headers.') }
  const sheetName = workbook.SheetNames[0]
  const sheet = workbook.Sheets[sheetName]
  if (!sheet?.['!ref']) throw new Error('The first sheet is empty.')
  const range = XLSX.utils.decode_range(sheet['!fullref'] || sheet['!ref'])
  if (range.e.r > MAX_CAMPAIGN_RECIPIENTS) throw new Error(`Import at most ${MAX_CAMPAIGN_RECIPIENTS} rows. Split this file first; no rows were silently truncated.`)
  if (range.s.r !== 0 || range.e.c > 50) throw new Error('Use headers in the first row and at most 51 columns.')
  const emailHeaders = new Set(['email', 'emailaddress', 'customeremail', 'clientemail'])
  const nameHeaders = new Set(['name', 'fullname', 'customername', 'clientname'])
  let emailColumn = -1, nameColumn = -1
  for (let column = range.s.c; column <= range.e.c; column++) {
    const header = String(sheet[XLSX.utils.encode_cell({ r: 0, c: column })]?.v || '').trim().toLowerCase().replace(/[\s_\-\ufeff]/g, '')
    if (emailHeaders.has(header)) {
      if (emailColumn !== -1) throw new Error('More than one email column found. Keep one Email column.')
      emailColumn = column
    }
    if (nameHeaders.has(header)) nameColumn = column
  }
  if (emailColumn === -1) throw new Error('Email header not found. Add an Email column and an optional Name column.')
  const emails: RecipientImportPreview['emails'] = [], issues: RecipientImportPreview['issues'] = []
  const seen = new Set<string>()
  let invalid = 0, duplicates = 0, totalRows = 0
  for (let row = 1; row <= range.e.r; row++) {
    const emailCell = sheet[XLSX.utils.encode_cell({ r: row, c: emailColumn })]
    const nameCell = nameColumn < 0 ? null : sheet[XLSX.utils.encode_cell({ r: row, c: nameColumn })]
    const email = String(emailCell?.v ?? '').trim(), name = String(nameCell?.v ?? '').trim()
    if (!email && !name && !emailCell?.f && !nameCell?.f) continue
    totalRows++
    const parsed = campaignEmailSchema.safeParse({ email, name })
    if (emailCell?.f || nameCell?.f || !parsed.success) {
      invalid++
      if (issues.length < 100) issues.push({ row: row + 1, error: emailCell?.f || nameCell?.f ? 'Formula cells are not accepted. Paste plain values.' : parsed.success ? 'Invalid row.' : parsed.error.issues[0].message })
      continue
    }
    if (seen.has(parsed.data.email)) { duplicates++; continue }
    seen.add(parsed.data.email)
    emails.push(parsed.data)
  }
  return { emails, issues, invalid, duplicates, totalRows, sheet: sheetName }
}
