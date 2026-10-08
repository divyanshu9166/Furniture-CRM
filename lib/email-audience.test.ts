import assert from 'node:assert/strict'
import test from 'node:test'
import * as XLSX from 'xlsx'
import { MAX_CAMPAIGN_RECIPIENTS, MAX_RECIPIENT_FILE_BYTES, mergeCampaignEmails, normalizeCampaignRecipients, recipientSelectionSchema } from './email-audience'
import { parseRecipientFile } from './email-recipient-import'
import { emailFailureMessage, isSmtpAccountBlocked } from './email-errors'

const csv = (value: string) => new TextEncoder().encode(value)
function workbook(rows: unknown[][], type: 'xlsx' | 'xls' = 'xlsx', modify?: (sheet: XLSX.WorkSheet) => void) {
  const book = XLSX.utils.book_new(), sheet = XLSX.utils.aoa_to_sheet(rows)
  modify?.(sheet)
  XLSX.utils.book_append_sheet(book, sheet, 'Recipients')
  return new Uint8Array(XLSX.write(book, { type: 'array', bookType: type }))
}

test('explicit selection rejects bad ids, address lists, controls, oversized lists and unconfirmed consent', () => {
  assert.equal(recipientSelectionSchema.safeParse({ contactIds: [0] }).success, false)
  assert.equal(recipientSelectionSchema.safeParse({ contactIds: [1.2] }).success, false)
  assert.equal(recipientSelectionSchema.safeParse({ emails: [{ email: 'a@example.com,b@example.com' }], consentConfirmed: true }).success, false)
  assert.equal(recipientSelectionSchema.safeParse({ emails: [{ email: 'a@example.com', name: 'A\r\nB' }], consentConfirmed: true }).success, false)
  assert.equal(recipientSelectionSchema.safeParse({ emails: [{ email: 'a@example.com' }] }).success, false)
  assert.equal(recipientSelectionSchema.safeParse({ contactIds: Array(MAX_CAMPAIGN_RECIPIENTS + 1).fill(1) }).success, false)
  assert.equal(recipientSelectionSchema.safeParse({ version: 2, contactIds: [1] }).success, false)
  assert.equal(recipientSelectionSchema.safeParse({ contactIds: [1], unsafe: true }).success, false)
})

test('address-level deduplication, missing-name fallback and suppression override every source', () => {
  const result = normalizeCampaignRecipients([
    { contactId: 1, email: 'CLIENT@example.com ', name: 'Client' },
    { contactId: null, email: 'client@example.com', name: 'Imported' },
    { contactId: null, email: 'blocked@example.com', name: 'Blocked' },
    { contactId: null, email: 'new@example.com', name: '' },
    { contactId: 2, email: 'invalid', name: 'Invalid' },
  ], ['BLOCKED@example.com'])
  assert.deepEqual(result.recipients, [{ contactId: 1, email: 'client@example.com', name: 'Client' }, { contactId: null, email: 'new@example.com', name: 'Customer' }])
  assert.equal(result.duplicates, 1); assert.equal(result.unsubscribed, 1); assert.equal(result.invalid, 1)
})

test('merging imports preserves existing names and does not mutate the original list', () => {
  const existing = [{ email: 'old@example.com', name: 'Original' }]
  const result = mergeCampaignEmails(existing, [{ email: 'OLD@example.com', name: 'Replacement' }, { email: 'new@example.com', name: 'New' }])
  assert.equal(result.duplicates, 1)
  assert.equal(result.emails[0].name, 'Original')
  assert.equal(existing.length, 1)
  assert.throws(() => mergeCampaignEmails([], Array.from({ length: MAX_CAMPAIGN_RECIPIENTS + 1 }, (_, index) => ({ email: `client${index}@example.com`, name: '' }))), /2000/)
})

test('CSV accepts BOM, reordered headers, quoted commas, email-only rows and rejects invalid addresses', () => {
  const result = parseRecipientFile(csv('\ufeffName,Email,Ignored\r\n"Client, One", ONE@example.com ,x\r\nRepeat,one@example.com,x\r\nBad,not-email,x\r\n,two@example.com,x\r\n,,\r\n'), 'recipients.csv')
  assert.deepEqual(result.emails, [{ email: 'one@example.com', name: 'Client, One' }, { email: 'two@example.com', name: '' }])
  assert.equal(result.duplicates, 1); assert.equal(result.invalid, 1); assert.equal(result.totalRows, 4)
  assert.equal(result.issues[0].row, 4)
  assert.equal(parseRecipientFile(csv('Email\na@example.com\n'), 'contacts.csv').emails.length, 1)
})

test('XLSX and legacy XLS parse the same plain email/name records', () => {
  for (const type of ['xlsx', 'xls'] as const) {
    const result = parseRecipientFile(workbook([['Email Address', 'Full Name'], ['a@example.com', 'A'], ['B@example.com', 'B']], type), `contacts.${type}`)
    assert.deepEqual(result.emails, [{ email: 'a@example.com', name: 'A' }, { email: 'b@example.com', name: 'B' }])
    assert.equal(result.sheet, 'Recipients')
  }
})

test('formula cells are excluded even when they have cached valid email/name values', () => {
  const result = parseRecipientFile(workbook([['Email', 'Name'], ['a@example.com', 'A'], ['b@example.com', 'B']], 'xlsx', sheet => { sheet.A2.f = '"a@example.com"'; sheet.B3.f = '"B"' }), 'formulas.xlsx')
  assert.equal(result.emails.length, 0); assert.equal(result.invalid, 2)
  assert.match(result.issues[0].error, /Formula/)
})

test('file validation rejects missing/ambiguous headers, unsupported types, huge files and excess rows', () => {
  assert.throws(() => parseRecipientFile(csv('Phone,Name\n123,A'), 'contacts.csv'), /Email header/)
  assert.throws(() => parseRecipientFile(csv('Email,E-mail\na@example.com,b@example.com'), 'contacts.csv'), /More than one/)
  assert.throws(() => parseRecipientFile(csv('Email\na@example.com'), 'contacts.pdf'), /CSV/)
  assert.throws(() => parseRecipientFile(new Uint8Array(), 'empty.xlsx'), /non-empty/)
  assert.throws(() => parseRecipientFile(new Uint8Array(MAX_RECIPIENT_FILE_BYTES + 1), 'huge.xlsx'), /5 MB/)
  const rows = [['Email'], ...Array.from({ length: MAX_CAMPAIGN_RECIPIENTS + 1 }, (_, index) => [`client${index}@example.com`])]
  assert.throws(() => parseRecipientFile(workbook(rows), 'too-many.xlsx'), /no rows were silently truncated/)
  assert.throws(() => parseRecipientFile(csv(rows.map(row => row[0]).join('\n')), 'too-many.csv'), /2000/)
})

test('Excel expanded-size guard rejects a ZIP bomb before the parser runs', () => {
  const bytes = workbook([['Email'], ['a@example.com']])
  const view = new DataView(bytes.buffer)
  for (let offset = 0; offset < bytes.length - 46; offset++) {
    if (view.getUint32(offset, true) === 0x02014b50) { view.setUint32(offset + 24, 21 * 1024 * 1024, true); break }
  }
  assert.throws(() => parseRecipientFile(bytes, 'bomb.xlsx'), /Expanded Excel/)
})

test('provider sending blocks have actionable guidance; recipient failures do not become account blocks', () => {
  const blocked = new Error('554 5.7.1 Outbound sending is disabled for this account')
  assert.equal(isSmtpAccountBlocked(blocked), true)
  assert.match(emailFailureMessage(blocked), /hPanel.*Suspend sending/)
  assert.match(emailFailureMessage(blocked), /send one test email/)
  assert.equal(isSmtpAccountBlocked(new Error('550 recipient not found')), false)
  assert.equal(emailFailureMessage(new Error('550 recipient not found')), '550 recipient not found')
})
