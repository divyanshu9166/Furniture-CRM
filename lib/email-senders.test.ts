import assert from 'node:assert/strict'
import test from 'node:test'
import nodemailer from 'nodemailer'
import { changeSmtpEncryption, changeSmtpPort, formatSmtpError, getSenderIdentities, prepareSmtpConfig, resolveSender, senderEmailSchema, senderHeaders, smtpConfigSchema, smtpTransportProblem } from './email-senders'

const config = {
  smtpHost: 'smtp.hostinger.com', smtpPort: 465, smtpSecure: true,
  smtpUser: 'info@example.com', smtpPass: 'test-only-password', smtpFromName: 'Example Furniture',
  smtpFromEmail: 'info@example.com',
  smtpAliases: [
    { email: 'sales@example.com', name: 'Example Sales' },
    { email: 'support@example.com', name: '' },
    { email: 'contact@example.com', name: 'Contact, Example' },
  ],
}

test('legacy mailbox configuration requires no alias or default fields', () => {
  const legacy = { smtpUser: config.smtpUser, smtpFromName: config.smtpFromName }
  assert.deepEqual(resolveSender(legacy), { email: 'info@example.com', name: 'Example Furniture' })
  assert.equal(getSenderIdentities(legacy).length, 1)
})

test('selected alias and reply address never change authenticated mailbox credentials', () => {
  assert.deepEqual(senderHeaders(config, 'sales@example.com'), {
    from: { address: 'sales@example.com', name: 'Example Sales' },
    replyTo: { address: 'sales@example.com', name: 'Example Sales' },
  })
  assert.equal(config.smtpUser, 'info@example.com')
  assert.equal(config.smtpPass, 'test-only-password')
})

test('default alias applies only to messages without explicit selection', () => {
  const next = { ...config, smtpFromEmail: 'support@example.com' }
  assert.equal(resolveSender(next).email, 'support@example.com')
  assert.equal(resolveSender(next, 'sales@example.com').email, 'sales@example.com')
})

test('normalizes email case/whitespace and inherits blank alias display names', () => {
  assert.equal(resolveSender(config, ' SALES@EXAMPLE.COM ').email, 'sales@example.com')
  assert.equal(resolveSender(config, 'support@example.com').name, 'Example Furniture')
})

test('rejects duplicate identities including primary mailbox and case-only duplicates', () => {
  assert.throws(() => getSenderIdentities({ ...config, smtpAliases: [{ email: 'INFO@EXAMPLE.COM', name: '' }] }), /Duplicate/)
  assert.throws(() => getSenderIdentities({ ...config, smtpAliases: [{ email: 'a@example.com' }, { email: 'A@example.com' }] }), /Duplicate/)
})

test('unknown/removed campaign sender cannot silently become the default sender', () => {
  assert.throws(() => resolveSender(config, 'other@example.com'), /no longer configured/)
  assert.throws(() => resolveSender({ ...config, smtpAliases: [] }, 'sales@example.com', 'Pinned Name'), /no longer configured/)
  assert.equal(smtpConfigSchema.safeParse({ ...config, smtpFromEmail: 'other@example.com' }).success, false)
})

test('rejects malformed addresses, address lists and CRLF/NUL header injection', () => {
  for (const value of ['not-an-email', 'sales@example.com,other@example.com', 'sales@example.com\r\nBcc:bad@example.com', 'sales@example.com\0', '\nsales@example.com']) {
    assert.equal(senderEmailSchema.safeParse(value).success, false)
  }
  assert.throws(() => resolveSender(config, 'sales@example.com', 'Sales\r\nBcc:bad@example.com'))
  assert.equal(smtpConfigSchema.safeParse({ ...config, smtpFromName: 'Invalid\nName' }).success, false)
})

test('scheduled/A-B/automation identity snapshot survives changes to global default/name', () => {
  const snapshot = resolveSender(config, 'sales@example.com')
  const updated = { ...config, smtpFromEmail: 'support@example.com', smtpAliases: [{ email: 'sales@example.com', name: 'New Sales Name' }] }
  assert.deepEqual(resolveSender(updated, snapshot.email, snapshot.name), snapshot)
})

test('empty password preserves server-side credential only for the same host/mailbox', () => {
  assert.equal(prepareSmtpConfig({ ...config, smtpPass: '', smtpFromEmail: 'sales@example.com' }, config).smtpPass, config.smtpPass)
  assert.throws(() => prepareSmtpConfig({ ...config, smtpPass: '', smtpHost: 'other.example.com' }, config))
  assert.throws(() => prepareSmtpConfig({ ...config, smtpPass: '', smtpUser: 'other@example.com' }, config))
  assert.throws(() => prepareSmtpConfig({ ...config, smtpPass: '' }, null))
  assert.equal(prepareSmtpConfig({ ...config, smtpPass: 'new-password', smtpHost: 'other.example.com' }, config).smtpPass, 'new-password')
})

test('rejects incorrect encryption/port pairings and fractional ports', () => {
  assert.equal(smtpConfigSchema.safeParse({ ...config, smtpSecure: false }).success, false)
  assert.equal(smtpConfigSchema.safeParse({ ...config, smtpPort: 587 }).success, false)
  assert.equal(smtpConfigSchema.safeParse({ ...config, smtpPort: 587, smtpSecure: false }).success, true)
  assert.equal(smtpConfigSchema.safeParse({ ...config, smtpPort: 465.5 }).success, false)
})

test('editing a standard port synchronizes encryption without changing secrets or aliases', () => {
  const starttls = changeSmtpPort(config, '587')
  assert.equal(starttls.smtpSecure, false)
  assert.equal(starttls.smtpPort, 587)
  assert.equal(starttls.smtpPass, config.smtpPass)
  assert.equal(starttls.smtpUser, config.smtpUser)
  assert.equal(starttls.smtpAliases, config.smtpAliases)
  assert.equal(starttls.smtpFromEmail, config.smtpFromEmail)
  assert.equal(config.smtpPort, 465)
  assert.equal(changeSmtpPort(starttls, '465').smtpSecure, true)
})

test('SSL toggle pairs standard ports while leaving custom provider ports unchanged', () => {
  assert.equal(changeSmtpEncryption({ ...config, smtpPort: 587, smtpSecure: false }, true).smtpPort, 465)
  assert.equal(changeSmtpEncryption(config, false).smtpPort, 587)
  assert.equal(changeSmtpEncryption({ ...config, smtpPort: 2525 }, false).smtpPort, 2525)
  assert.equal(changeSmtpPort(config, '2525').smtpSecure, true)
  assert.equal(smtpTransportProblem(2525, false), null)
})

test('empty/fractional/out-of-range ports remain invalid rather than silently using 587', () => {
  assert.equal(changeSmtpPort(config, '').smtpPort, '')
  for (const port of ['', 0, -1, 465.5, 65536, Number.NaN, null]) {
    assert.throws(() => prepareSmtpConfig({ ...config, smtpPort: port }, config))
  }
  assert.ok(smtpTransportProblem('', false))
  assert.ok(smtpTransportProblem(465.5, true))
  const { smtpPort: ignored, ...legacy } = config
  void ignored
  assert.equal(prepareSmtpConfig({ ...legacy, smtpSecure: false }, null).smtpPort, 587)
})

test('SMTP validation reports plain actionable messages, not serialized Zod issues', () => {
  const invalid = smtpConfigSchema.safeParse({ ...config, smtpPort: 587 })
  assert.equal(invalid.success, false)
  if (invalid.success) return
  const message = formatSmtpError(invalid.error)
  assert.match(message, /Port 587 uses STARTTLS/)
  assert.doesNotMatch(message, /"code"|"path"|\[\s*\{/)
  assert.deepEqual(invalid.error.issues[0].path, ['smtpSecure'])
  const nested = smtpConfigSchema.safeParse({ ...config, smtpAliases: [{ email: config.smtpUser, name: '' }] })
  assert.equal(nested.success, false)
  if (!nested.success) assert.match(formatSmtpError(nested.error), /Duplicate sender/)
  assert.equal(formatSmtpError(new Error('Authentication failed')), 'Authentication failed')
  assert.equal(formatSmtpError(null, 'Try again'), 'Try again')
})

test('rejects excessive alias counts, blank addresses and oversized names', () => {
  assert.equal(smtpConfigSchema.safeParse({ ...config, smtpAliases: Array.from({ length: 21 }, (_, i) => ({ email: `alias${i}@example.com` })) }).success, false)
  assert.equal(smtpConfigSchema.safeParse({ ...config, smtpAliases: [{ email: '', name: '' }] }).success, false)
  assert.equal(smtpConfigSchema.safeParse({ ...config, smtpAliases: [{ email: 'x@example.com', name: 'x'.repeat(151) }] }).success, false)
})

test('Nodemailer MIME headers and SMTP envelope contain the chosen alias (no network)', async () => {
  const transport = nodemailer.createTransport({ streamTransport: true, buffer: true, newline: 'unix' })
  for (const alias of config.smtpAliases) {
    const result = await transport.sendMail({ ...senderHeaders(config, alias.email), to: 'recipient@example.com', subject: 'Alias test', text: 'Test only' })
    const mime = result.message.toString()
    assert.equal(result.envelope.from, alias.email)
    assert.match(mime, new RegExp(`^From: .*${alias.email.replaceAll('.', '\\.')}`, 'm'))
    assert.match(mime, new RegExp(`^Reply-To: .*${alias.email.replaceAll('.', '\\.')}`, 'm'))
    assert.doesNotMatch(mime, /test-only-password/)
  }
})
