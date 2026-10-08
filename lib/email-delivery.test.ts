import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import { z } from 'zod'
import * as senders from './email-senders'
import * as emailContent from './email-content'
import * as crypto from 'node:crypto'

// Execute the actual delivery modules with isolated dependencies. Never import
// the real database client, connect to SMTP, or send a customer email in tests.
function isolatedModule(file: string, dependencies: Record<string, unknown>) {
  const js = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText
  const exports: Record<string, any> = {}
  vm.runInNewContext(js, { exports, require: (name: string) => {
    if (name === '@/lib/email-content') return emailContent
    if (!(name in dependencies)) throw new Error(`Unexpected dependency: ${name}`)
    return dependencies[name]
  }, console: { error() {} }, process: { env: { EMAIL_TRACKING_SECRET: 'test-only-tracking-secret', NEXT_PUBLIC_SITE_URL: 'https://example.com' } }, setTimeout, setInterval, Date, Error, Buffer, URL, URLSearchParams, globalThis: {} }, { filename: file })
  return exports
}

const config = {
  smtpHost: 'smtp.hostinger.com', smtpPort: 465, smtpSecure: true,
  smtpUser: 'info@example.com', smtpPass: 'test-only-password', smtpFromName: 'Example',
  smtpFromEmail: 'support@example.com', smtpAliases: [{ email: 'sales@example.com', name: 'Sales' }, { email: 'support@example.com', name: 'Support' }],
}

test('tracking signatures reject malformed Unicode without throwing and accept genuine links', () => {
  const tracking = isolatedModule('lib/email-tracking.ts', { crypto })
  const signature = tracking.createTrackingSignature(1, 'click', 'https://example.com/')
  assert.equal(tracking.verifyTrackingSignature(1, 'click', signature, 'https://example.com/'), true)
  assert.equal(tracking.verifyTrackingSignature(1, 'click', 'é'.repeat(43), 'https://example.com/'), false)
  assert.equal(tracking.verifyTrackingSignature(2, 'click', signature, 'https://example.com/'), false)
})

function mailHarness() {
  const messages: any[] = [], transports: any[] = []
  const email = isolatedModule('lib/email.ts', {
    nodemailer: { createTransport(options: unknown) { transports.push(options); return { verify: async () => true, sendMail: async (message: unknown) => { messages.push(message); return { messageId: 'test-message' } } } } },
    '@/lib/db': { prisma: { storeSettings: { findFirst: async () => ({ ...config }) } } },
    '@/lib/email-tracking': { addTrackingToEmail: (body: string) => `tracked:${body}` },
    '@/lib/email-senders': senders,
  })
  return { email, messages, transports }
}

test('actual single-email path uses explicit alias, reply-to and unchanged SMTP auth', async () => {
  const { email, messages, transports } = mailHarness()
  const result = await email.sendEmail({ to: 'client@example.com', subject: 'Hello', html: '<p>Hi</p>', fromEmail: 'sales@example.com' })
  assert.equal(result.success, true)
  assert.equal(messages[0].from.address, 'sales@example.com')
  assert.equal(messages[0].replyTo.address, 'sales@example.com')
  assert.equal(transports[0].auth.user, 'info@example.com')
  assert.equal(transports[0].auth.pass, 'test-only-password')
})

test('actual transactional default and test-email selection use correct identity', async () => {
  const { email, messages } = mailHarness()
  await email.sendEmail({ to: 'client@example.com', subject: 'Order', html: 'Order' })
  await email.sendTestEmail(config, 'owner@example.com', 'sales@example.com')
  assert.equal(messages[0].from.address, 'support@example.com')
  assert.equal(messages[1].from.address, 'sales@example.com')
  assert.equal(messages[1].replyTo.address, 'sales@example.com')
})

test('actual bulk/A-B path pins one identity for every recipient and retains tracking', async () => {
  const { email, messages } = mailHarness()
  const result = await email.sendBulkEmails([1, 2].map(id => ({ recipientId: id, to: `client${id}@example.com`, subject: id === 1 ? 'A' : 'B', html: 'Body' })), { config, fromEmail: 'sales@example.com', fromName: 'Pinned Sales' })
  assert.equal(result.sent, 2)
  assert.equal(result.failed, 0)
  for (const message of messages) {
    assert.equal(message.from.address, 'sales@example.com')
    assert.equal(message.from.name, 'Pinned Sales')
    assert.equal(message.replyTo.address, 'sales@example.com')
    assert.equal(message.html, 'tracked:Body')
  }
})

test('unknown sender fails single, bulk and test paths before any SMTP attempt', async () => {
  const { email, messages, transports } = mailHarness()
  assert.equal((await email.sendEmail({ to: 'a@example.com', subject: 'A', html: 'A', fromEmail: 'bad@example.com' })).success, false)
  const bulk = await email.sendBulkEmails([{ recipientId: 1, to: 'a@example.com', subject: 'A', html: 'A' }], { fromEmail: 'bad@example.com' })
  assert.equal(bulk.sent, 0)
  assert.equal(bulk.failed, 1)
  assert.equal((await email.sendTestEmail(config, 'a@example.com', 'bad@example.com')).success, false)
  assert.equal(messages.length, 0)
  assert.equal(transports.length, 0)
})

test('STARTTLS is mandatory on actual port-587 transport, not plaintext downgrade', () => {
  const { email, transports } = mailHarness()
  email.createTransporter({ ...config, smtpPort: 587, smtpSecure: false })
  assert.equal(transports[0].requireTLS, true)
  assert.equal(transports[0].secure, false)
})

test('invalid SSL/587 pairing returns readable errors before any actual SMTP operation', async () => {
  const { email, messages, transports } = mailHarness()
  const invalid = { ...config, smtpPort: 587, smtpSecure: true }
  for (const result of [await email.testSmtpConnection(invalid), await email.sendTestEmail(invalid, 'qa@example.com')]) {
    assert.equal(result.success, false)
    assert.match(result.error, /Port 587 uses STARTTLS/)
    assert.doesNotMatch(result.error, /"code"|"path"/)
  }
  assert.equal(messages.length, 0)
  assert.equal(transports.length, 0)
})

function campaignHarness(overrides: Record<string, unknown> = {}, aliases = config.smtpAliases) {
  const campaign: any = { id: 1, totalRecipients: 0, status: 'DRAFT', isAutomated: false, fromEmail: 'sales@example.com', fromName: 'Pinned Sales', audience: 'all', subject: 'Subject A', body: 'Body A', isABTest: true, abSplitPercent: 50, variantB: { subject: 'Subject B', body: 'Body B' }, ...overrides }
  const deliveries: any[] = []
  let replacedHistory = 0
  let rows: any[] = []
  if (overrides.history) rows = [{ id: 9, contactId: 1, status: 'failed' }]
  let transactionQueue = Promise.resolve()
  const apply = (data: any) => { for (const [key, value] of Object.entries(data) as any) campaign[key] = value?.increment ? (campaign[key] || 0) + value.increment : value }
  const contacts = [1, 2].map(id => ({ id, name: `Client ${id}`, email: `client${id}@example.com`, emailSubscribed: true }))
  const prisma = {
    emailCampaign: {
      findUnique: async () => ({ ...campaign }),
      updateMany: async ({ where }: any) => { if (campaign.status !== where.status) return { count: 0 }; campaign.status = 'SENDING'; return { count: 1 } },
      update: async ({ data }: any) => { apply(data); return campaign },
      findMany: async ({ where }: any) => where.isAutomated && campaign.isAutomated ? [{ ...campaign, createdAt: new Date(0), triggerType: 'new_lead', triggerDelay: 0 }] : [],
    },
    contact: { findMany: async () => contacts, findUnique: async ({ where }: any) => {
      if (overrides.noOrders && where.orders?.some) return null
      return contacts.find(contact => contact.id === where.id)
    } },
    storeSettings: { findFirst: async () => ({ storeName: 'Example' }) },
    lead: { findMany: async () => [{ contactId: 1 }] },
    emailRecipient: {
      count: async () => rows.length,
      deleteMany: async () => { replacedHistory++; rows = []; },
      createMany: async ({ data }: any) => { rows = data.map((row: any, index: number) => ({ ...row, id: index + 1 })) },
      findMany: async () => rows,
      findFirst: async ({ where }: any) => rows.find(row => row.contactId === where.contactId) || null,
      create: async ({ data }: any) => { const row = { ...data, id: 1 }; rows.push(row); return row },
      updateMany: async () => ({ count: 1 }), update: async () => ({}),
    },
    $queryRaw: async () => [],
    $transaction: (operations: any) => {
      if (typeof operations !== 'function') return Promise.all(operations)
      const pending = transactionQueue.then(() => operations(prisma))
      transactionQueue = pending.catch(() => {})
      return pending
    },
  }
  const runner = isolatedModule('lib/email-campaign-runner.ts', {
    '@/lib/db': { prisma }, '@/lib/email-senders': senders,
    '@/lib/email-tracking': { getPublicAppUrl: () => 'https://example.com', isEmailTrackingConfigured: () => true },
    '@/lib/email': { getSmtpConfig: async () => ({ ...config, smtpAliases: aliases }), replaceVariables: (body: string) => body,
      sendBulkEmails: async (emails: unknown[], sender: unknown) => { deliveries.push({ emails, sender }); if (overrides.deliveryError) throw new Error('Simulated lost SMTP result'); return { sent: overrides.reject ? 0 : emails.length, failed: overrides.reject ? emails.length : 0, errors: overrides.reject ? ['Rejected'] : [], results: emails.map((email: any) => ({ recipientId: email.recipientId, success: !overrides.reject })) } } },
  })
  return { runner, campaign, prisma, deliveries, replacedHistory: () => replacedHistory, rows: () => rows }
}

test('actual immediate and scheduled runner forwards saved alias/name to both A/B variants', async () => {
  for (const status of ['DRAFT', 'SCHEDULED']) {
    const { runner, deliveries, campaign } = campaignHarness({ status })
    assert.equal((await runner.deliverEmailCampaign(1)).success, true)
    assert.equal(deliveries[0].sender.fromEmail, 'sales@example.com')
    assert.equal(deliveries[0].sender.fromName, 'Pinned Sales')
    assert.equal(deliveries[0].sender.config.smtpUser, 'info@example.com')
    assert.deepEqual(deliveries[0].emails.map((email: any) => email.subject), ['Subject A', 'Subject B'])
    assert.equal(campaign.status, 'SENT')
  }
})

test('removed alias restores campaign status without replacing recipient history or sending', async () => {
  const { runner, deliveries, campaign, replacedHistory } = campaignHarness({}, [])
  const result = await runner.deliverEmailCampaign(1)
  assert.equal(result.success, false)
  assert.match(result.error, /no longer configured/)
  assert.equal(campaign.status, 'DRAFT')
  assert.equal(replacedHistory(), 0)
  assert.equal(deliveries.length, 0)
})

test('legacy campaign uses the mailbox, not a newly selected global default alias', async () => {
  const { runner, deliveries, campaign } = campaignHarness({ fromEmail: null, fromName: null })
  await runner.deliverEmailCampaign(1)
  assert.equal(deliveries[0].sender.fromEmail, 'info@example.com')
  assert.equal(campaign.fromEmail, 'info@example.com')
})

test('actual automation scheduler forwards saved sender and blocks removed aliases before queuing', async () => {
  const working = campaignHarness({ status: 'SCHEDULED', isAutomated: true })
  await working.runner.processDueEmailCampaigns()
  assert.equal(working.deliveries[0].sender.fromEmail, 'sales@example.com')
  assert.equal(working.deliveries[0].sender.fromName, 'Pinned Sales')
  const blocked = campaignHarness({ status: 'SCHEDULED', isAutomated: true }, [])
  await blocked.runner.processDueEmailCampaigns()
  assert.equal(blocked.deliveries.length, 0)
  assert.equal(blocked.rows().length, 0)
})

function settingsHarness() {
  let role = 'ADMIN', activeCampaigns = 0, writes = 0
  const saved: any = { id: 1, storeName: 'Existing Store', phone: '0000000000', ...config }
  const settings = isolatedModule('app/actions/settings.ts', {
    '@/lib/db': { prisma: {
      storeSettings: { findFirst: async () => ({ ...saved }), findUnique: async () => ({ ...saved }),
        upsert: async ({ update }: any) => { writes++; Object.assign(saved, update); return { ...saved } } },
      emailCampaign: { count: async () => activeCampaigns },
    } },
    '@prisma/client': { Prisma: { dmmf: { datamodel: { models: [{ name: 'StoreSettings', fields: [{ name: 'paymentQr' }, { name: 'whatsappNumber' }] }] } } } },
    'next/cache': { revalidatePath() {} }, zod: { z },
    '@/lib/auth-helpers': { requireRole: async (...roles: string[]) => { if (!roles.includes(role)) throw new Error('Forbidden') } },
    '@/lib/email-senders': senders,
  })
  return { settings, saved, setRole: (value: string) => { role = value }, setActive: (value: number) => { activeCampaigns = value }, writes: () => writes }
}

test('actual settings save preserves the secret/profile and returns no credential to clients', async () => {
  const { settings, saved } = settingsHarness()
  const before = await settings.getStoreSettings()
  assert.equal(before.data.smtpPass, '')
  assert.equal(before.data.smtpHasPassword, true)
  const result = await settings.updateStoreSettings({ smtpAliases: [{ email: 'contact@example.com', name: 'Contact' }], smtpFromEmail: 'contact@example.com', smtpPass: '' })
  assert.equal(result.success, true)
  assert.equal(result.data.smtpPass, '')
  assert.equal(saved.smtpPass, 'test-only-password')
  assert.equal(saved.storeName, 'Existing Store')
  assert.equal(saved.phone, '0000000000')
  assert.equal(saved.smtpFromEmail, 'contact@example.com')
  assert.equal(JSON.stringify(result).includes('test-only-password'), false)
})

test('actual alias settings reject manager access, duplicate aliases and removal used by active campaigns', async () => {
  const { settings, setRole, setActive, writes } = settingsHarness()
  setRole('MANAGER')
  assert.equal((await settings.updateStoreSettings({ smtpAliases: [] })).success, false)
  setRole('ADMIN')
  assert.equal((await settings.updateStoreSettings({ smtpAliases: [{ email: 'INFO@example.com', name: '' }] })).success, false)
  setActive(1)
  assert.equal((await settings.updateStoreSettings({ smtpAliases: [], smtpFromEmail: 'info@example.com' })).success, false)
  assert.equal(writes(), 0)
})

function campaignActionsHarness() {
  let role = 'MANAGER'
  const writes: any[] = [], tests: any[] = []
  const original: any = { id: 1, status: 'DRAFT', fromEmail: 'sales@example.com', fromName: 'Pinned Sales', totalRecipients: 0, isAutomated: false, triggerType: 'new_lead', name: 'Original', subject: 'Hello', body: 'Body', audience: 'all', isABTest: false, abSplitPercent: 50 }
  const prisma: any = { storeSettings: { findUnique: async () => ({ ...config }) },
    emailCampaign: { create: async ({ data }: any) => { writes.push(data); return { id: 2 } }, findFirst: async () => null, findUnique: async () => ({ ...original }), update: async ({ data }: any) => { writes.push(data); return { id: 1 } }, delete: async () => { writes.push('delete') } },
    emailRecipient: { count: async () => original.totalRecipients || 0 },
    $queryRaw: async () => [], $transaction: async (task: any) => task(prisma),
  }
  const actions = isolatedModule('app/actions/email-campaigns.ts', {
    '@/lib/db': { prisma },
    '@/lib/email-events': { recordEmailEvent: async () => ({ success: true }) },
    'next/cache': { revalidatePath() {} }, zod: { z },
    '@/lib/auth-helpers': { requireRole: async (...roles: string[]) => { if (!roles.includes(role)) throw new Error('Forbidden') } },
    '@/lib/email': { getSmtpConfig: async () => ({ ...config }),
      testSmtpConnection: async (value: unknown) => { tests.push(value); return { success: true } },
      sendTestEmail: async (value: unknown, to: string, from: string) => { tests.push({ config: value, to, from }); return { success: true } } },
    '@/lib/email-campaign-runner': { deliverEmailCampaign: async () => ({ success: true }) },
    '@/lib/email-tracking': { getPublicAppUrl: () => 'https://example.com', isEmailTrackingConfigured: () => true },
    '@/lib/email-senders': senders,
  })
  return { actions, writes, tests, original, prisma, setRole: (value: string) => { role = value } }
}

test('SMTP settings reject mismatched encryption without writing or modifying existing data', async () => {
  const { settings, saved, writes } = settingsHarness()
  const original = JSON.stringify(saved)
  const rejected = await settings.updateStoreSettings({ smtpPort: 587, smtpSecure: true, smtpPass: '' })
  assert.equal(rejected.success, false)
  assert.match(rejected.error, /Port 587 uses STARTTLS/)
  assert.doesNotMatch(rejected.error, /"code"|"path"/)
  assert.equal(writes(), 0)
  assert.equal(JSON.stringify(saved), original)
  const accepted = await settings.updateStoreSettings({ smtpPort: 587, smtpSecure: false, smtpPass: '' })
  assert.equal(accepted.success, true)
  assert.equal(saved.smtpPass, config.smtpPass)
  assert.deepEqual(saved.smtpAliases, config.smtpAliases)
  assert.equal(saved.smtpFromEmail, config.smtpFromEmail)
})

test('SMTP server actions return readable pairing errors before connection or test-email attempts', async () => {
  const { actions, tests, setRole } = campaignActionsHarness()
  setRole('ADMIN')
  const invalid = { ...config, smtpPort: 587, smtpSecure: true, smtpPass: '' }
  for (const result of [await actions.testSmtp(invalid), await actions.sendSmtpTestEmail(invalid, 'qa@example.com')]) {
    assert.equal(result.success, false)
    assert.match(result.error, /Port 587 uses STARTTLS/)
    assert.doesNotMatch(result.error, /"code"|"path"/)
  }
  assert.equal(tests.length, 0)
})

test('actual campaign create/edit/copy persist selected identity and reject unlisted senders', async () => {
  const { actions, writes } = campaignActionsHarness()
  const payload = { name: 'Test', subject: 'Subject', body: 'Body', fromEmail: 'sales@example.com' }
  assert.equal((await actions.createEmailCampaign(payload)).success, true)
  assert.equal(writes[0].fromEmail, 'sales@example.com')
  assert.equal(writes[0].fromName, 'Sales')
  assert.equal((await actions.updateEmailCampaign(1, { ...payload, fromEmail: 'support@example.com' })).success, true)
  assert.equal(writes[1].fromEmail, 'support@example.com')
  assert.equal((await actions.duplicateCampaign(1)).success, true)
  assert.equal(writes[2].fromEmail, 'sales@example.com')
  assert.equal(writes[2].fromName, 'Pinned Sales')
  assert.equal((await actions.createEmailCampaign({ ...payload, fromEmail: 'other@example.com' })).success, false)
  assert.equal(writes.length, 3)
})

test('actual test-email action reuses saved secret only server-side; managers cannot test unsaved aliases', async () => {
  const { actions, tests, setRole } = campaignActionsHarness()
  assert.equal((await actions.sendSmtpTestEmail({ ...config, smtpPass: '' }, 'owner@example.com', 'sales@example.com')).success, false)
  assert.equal(tests.length, 0)
  setRole('ADMIN')
  const result = await actions.sendSmtpTestEmail({ ...config, smtpPass: '' }, 'owner@example.com', 'sales@example.com')
  assert.equal(result.success, true)
  assert.equal(result.fromEmail, 'sales@example.com')
  assert.equal(tests[0].config.smtpPass, 'test-only-password')
  assert.equal(tests[0].config.smtpUser, 'info@example.com')
  assert.equal(JSON.stringify(result).includes('test-only-password'), false)
  const status = await actions.getEmailConfigStatus()
  assert.equal(status.senders.length, 3)
  assert.equal(status.fromEmail, 'support@example.com')
  assert.equal(JSON.stringify(status).includes('test-only-password'), false)
})

test('editing a legacy automation with history preserves the original mailbox, including older clients', async () => {
  const { actions, writes, original } = campaignActionsHarness()
  Object.assign(original, { isAutomated: true, totalRecipients: 8, fromEmail: null, fromName: null })
  const payload = { name: 'Edited', subject: 'Subject', body: 'Body', isAutomated: true, triggerType: 'new_lead' }
  assert.equal((await actions.updateEmailCampaign(1, payload)).success, true)
  assert.equal(writes[0].fromEmail, 'info@example.com')
  assert.equal((await actions.updateEmailCampaign(1, { ...payload, fromEmail: 'info@example.com' })).success, true)
  assert.equal(writes[1].fromEmail, 'info@example.com')
  assert.equal((await actions.updateEmailCampaign(1, { ...payload, fromEmail: 'sales@example.com' })).success, false)
  assert.equal(writes.length, 2)
})

test('legacy draft content edits keep the mailbox; explicitly choosing an alias is allowed', async () => {
  const { actions, writes, original } = campaignActionsHarness()
  Object.assign(original, { fromEmail: null, fromName: null })
  const payload = { name: 'Edited draft', subject: 'Subject', body: 'Body' }
  assert.equal((await actions.updateEmailCampaign(1, payload)).success, true)
  assert.equal(writes[0].fromEmail, 'info@example.com')
  assert.equal((await actions.updateEmailCampaign(1, { ...payload, fromEmail: 'sales@example.com' })).success, true)
  assert.equal(writes[1].fromEmail, 'sales@example.com')
})

test('enabling an automation validates its saved alias; pausing remains available for broken senders', async () => {
  const { actions, writes, original } = campaignActionsHarness()
  Object.assign(original, { isAutomated: true, fromEmail: 'removed@example.com' })
  assert.equal((await actions.setEmailAutomationActive(1, true)).success, false)
  assert.equal(writes.length, 0)
  assert.equal((await actions.setEmailAutomationActive(1, false)).success, true)
  assert.equal(writes[0].status, 'PAUSED')
  original.fromEmail = 'sales@example.com'
  assert.equal((await actions.setEmailAutomationActive(1, true)).success, true)
  assert.equal(writes[1].status, 'SCHEDULED')
})

test('delivery history is never deleted/replayed, including an uncertain SMTP outcome', async () => {
  const existing = campaignHarness({ history: true })
  assert.equal((await existing.runner.deliverEmailCampaign(1)).success, false)
  assert.equal(existing.deliveries.length, 0)
  assert.equal(existing.rows()[0].id, 9)
  assert.equal(existing.replacedHistory(), 0)
  const uncertain = campaignHarness({ deliveryError: true, status: 'SCHEDULED' })
  assert.equal((await uncertain.runner.deliverEmailCampaign(1)).success, false)
  assert.equal(uncertain.campaign.status, 'PAUSED')
  assert.equal(uncertain.rows().length, 2)
  assert.equal((await uncertain.runner.deliverEmailCampaign(1)).success, false)
  assert.equal(uncertain.deliveries.length, 1)
})

test('zero SMTP acceptance reports failure, not a successful scheduled send', async () => {
  const { runner, campaign, rows } = campaignHarness({ reject: true })
  assert.equal((await runner.deliverEmailCampaign(1)).success, false)
  assert.equal(campaign.status, 'PAUSED')
  assert.equal(campaign.sent, 0)
  assert.equal(rows().length, 2)
})

test('overlapping automation runs claim each contact once and report actual successful sends', async () => {
  const fixture = campaignHarness({ status: 'SCHEDULED', isAutomated: true })
  const results = await Promise.all([fixture.runner.processDueEmailCampaigns(), fixture.runner.processDueEmailCampaigns()])
  assert.equal(fixture.deliveries.length, 1)
  assert.equal(fixture.rows().length, 1)
  assert.equal(fixture.campaign.totalRecipients, 1)
  assert.equal(results.reduce((sum, row) => sum + row.automationDeliveries, 0), 1)
  const paused = campaignHarness({ status: 'PAUSED', isAutomated: true })
  assert.equal((await paused.runner.processDueEmailCampaigns()).automationDeliveries, 0)
  assert.equal(paused.rows().length, 0)
})

test('automated campaigns recheck customer audience before claiming or sending', async () => {
  const fixture = campaignHarness({ status: 'SCHEDULED', isAutomated: true, audience: 'customers', noOrders: true })
  assert.equal((await fixture.runner.processDueEmailCampaigns()).automationDeliveries, 0)
  assert.equal(fixture.deliveries.length, 0)
  assert.equal(fixture.rows().length, 0)
})

test('automation queries exclude delivery history before the bounded candidate window', async () => {
  const fixture = campaignHarness({ status: 'SCHEDULED', isAutomated: true, history: true })
  let query: any
  fixture.prisma.lead.findMany = async (input?: any) => { query = input; return [{ contactId: 2 }] }
  assert.equal((await fixture.runner.processDueEmailCampaigns()).automationDeliveries, 1)
  assert.deepEqual(Array.from(query.where.contactId.notIn), [1])
  assert.equal(query.where.contact.emailSubscribed, true)
  assert.equal(query.take, 5000)
})

test('unfilled starter variables cannot be sent or scheduled; editable drafts remain allowed', async () => {
  const fixture = campaignHarness({ subject: '{{collectionName}}', body: '<p>{{customerName}}</p>' })
  const result = await fixture.runner.deliverEmailCampaign(1)
  assert.equal(result.success, false)
  assert.match(result.error, /collectionName/)
  assert.equal(fixture.deliveries.length, 0)
  assert.equal(fixture.rows().length, 0)
  assert.equal(fixture.campaign.status, 'DRAFT')
  const { actions } = campaignActionsHarness()
  const payload = { name: 'Collection', subject: '{{collectionName}}', body: '<p>{{storeName}}</p>' }
  assert.equal((await actions.createEmailCampaign(payload)).success, true)
  assert.equal((await actions.createEmailCampaign({ ...payload, scheduledAt: new Date(Date.now() + 3600000).toISOString() })).success, false)
  assert.throws(() => emailContent.assertEmailContentReady('Hi', 'Body', { subject: '{{offerCode}}', body: 'B' }), /offerCode/)
})

test('automation drafts retain their trigger/delay, while duplicate active triggers are blocked', async () => {
  const { actions, writes, prisma } = campaignActionsHarness()
  const payload = { name: 'Automation', subject: 'Hi', body: '<p>Hello</p>', isAutomated: true, triggerType: 'new_lead', triggerDelay: 36, activate: false }
  assert.equal((await actions.createEmailCampaign(payload)).success, true)
  assert.equal(writes[0].status, 'DRAFT')
  assert.equal(writes[0].isAutomated, true)
  assert.equal(writes[0].triggerDelay, 36)
  prisma.emailCampaign.findFirst = async () => ({ id: 22 })
  assert.equal((await actions.createEmailCampaign({ ...payload, activate: true })).success, false)
  assert.equal(writes.length, 1)
})

test('campaign edits/deletes cannot discard history, and tracking actions require a role', async () => {
  const { actions, writes, original, setRole } = campaignActionsHarness()
  original.totalRecipients = 3
  assert.equal((await actions.deleteEmailCampaign(1)).success, false)
  assert.equal((await actions.updateEmailCampaign(1, { name: 'Changed', subject: 'Hi', body: 'Body' })).success, false)
  assert.equal(writes.length, 0)
  setRole('STAFF')
  assert.equal((await actions.recordEmailEvent(1, 'unsubscribe')).success, false)
})

test('A/B totals and daily timeline aggregate the full campaign beyond UI preview limits', async () => {
  const { actions, prisma, original } = campaignActionsHarness()
  Object.assign(original, { isABTest: true, sent: 1000, opened: 400, clicked: 50, recipients: [{ id: 1, email: 'sample@example.com', sentAt: new Date(), openedAt: null, clickedAt: null }] })
  prisma.emailRecipient.count = async ({ where }: any) => where.openedAt ? 200 : where.clickedAt ? 25 : 500
  const day = new Date(); day.setUTCHours(0, 0, 0, 0)
  prisma.$queryRaw = async () => [{ day, type: 'open', total: 1234 }]
  const result = await actions.getCampaignAnalytics(1)
  assert.equal(result.data.abStats.A.sent, 500)
  assert.equal(result.data.abStats.B.openRate, 40)
  assert.equal(result.data.recipients.length, 1)
  assert.equal(result.data.timeline.at(-1).opens, 1234)
})

test('HTML variables are escaped; replacement tokens stay literal and subjects stay plain text', () => {
  const { email } = mailHarness()
  assert.equal(email.replaceVariables('Hi {{customerName}}', { customerName: '<script>$&</script>' }), 'Hi &lt;script&gt;$&amp;&lt;/script&gt;')
  assert.equal(email.replaceVariables('{{customerName}}', { customerName: 'A & B $&' }, 'text'), 'A & B $&')
  assert.equal(email.replaceVariables('{{unknown}}', { customerName: 'Name' }), '{{unknown}}')
})

function eventsHarness() {
  const recipient: any = { id: 1, campaignId: 1, email: 'CLIENT@example.com', status: 'sent', opens: 0, clicks: 0, openedAt: null, clickedAt: null, bouncedAt: null }
  const campaign: any = { opened: 0, clicked: 0, unsubscribed: 0, bounced: 0 }
  const contacts = [{ emailSubscribed: true }, { emailSubscribed: true }]
  const events: any[] = []
  let fail = false, queue = Promise.resolve()
  const apply = (row: any, data: any) => { for (const [key, value] of Object.entries(data) as any) row[key] = value?.increment ? (row[key] || 0) + value.increment : value }
  const prisma: any = { $queryRaw: async () => [],
    emailRecipient: { findUnique: async () => ({ ...recipient }), update: async ({ data }: any) => apply(recipient, data) },
    emailCampaign: { update: async ({ data }: any) => apply(campaign, data) },
    emailEvent: { create: async ({ data }: any) => { if (fail) throw new Error('Event write failed'); events.push(data) } },
    contact: { updateMany: async () => { contacts.forEach(row => row.emailSubscribed = false) } },
    $transaction: (task: any) => {
      const pending = queue.then(async () => {
        const snapshot = structuredClone({ recipient, campaign, contacts, events })
        try { return await task(prisma) } catch (error) {
          Object.assign(recipient, snapshot.recipient); Object.assign(campaign, snapshot.campaign)
          contacts.forEach((row, i) => Object.assign(row, snapshot.contacts[i]))
          events.splice(0, events.length, ...snapshot.events); throw error
        }
      })
      queue = pending.catch(() => {}); return pending
    },
  }
  const service = isolatedModule('lib/email-events.ts', { '@/lib/db': { prisma }, zod: { z } })
  return { service, recipient, campaign, contacts, events, fail: () => { fail = true } }
}

test('concurrent tracking increments unique recipients once and never regresses terminal/clicked status', async () => {
  const { service, recipient, campaign, events } = eventsHarness()
  await Promise.all([service.recordEmailEvent(1, 'open'), service.recordEmailEvent(1, 'open')])
  assert.equal(campaign.opened, 1)
  assert.equal(recipient.opens, 2)
  await service.recordEmailEvent(1, 'click')
  await service.recordEmailEvent(1, 'open')
  assert.equal(recipient.status, 'clicked')
  await service.recordEmailEvent(1, 'unsubscribe')
  await service.recordEmailEvent(1, 'open')
  await service.recordEmailEvent(1, 'unsubscribe')
  assert.equal(recipient.status, 'unsubscribed')
  assert.equal(campaign.unsubscribed, 1)
  assert.equal(events.filter(row => row.type === 'unsubscribe').length, 1)
})

test('unsubscribe transaction suppresses duplicate email contacts atomically and rolls back failures', async () => {
  const working = eventsHarness()
  await working.service.recordEmailEvent(1, 'unsubscribe')
  assert.equal(working.contacts.every(row => !row.emailSubscribed), true)
  const failed = eventsHarness(); failed.fail()
  await assert.rejects(failed.service.recordEmailEvent(1, 'unsubscribe'))
  assert.equal(failed.contacts.every(row => row.emailSubscribed), true)
  assert.equal(failed.recipient.status, 'sent')
  assert.equal(failed.campaign.unsubscribed, 0)
})

test('signed unsubscribe GET requires confirmation; invalid/raw POSTs cannot change subscriptions', async () => {
  const writes: any[] = [], background: any[] = []
  class NextResponse extends Response {
    static json(data: unknown, init?: ResponseInit) { return new Response(JSON.stringify(data), init) }
    static redirect(url: string) { return new Response(null, { status: 307, headers: { location: url } }) }
  }
  const route = isolatedModule('app/api/email-track/route.ts', {
    'next/server': { NextResponse, after: (task: any) => background.push(task) },
    '@/lib/email-events': { recordEmailEvent: async (...args: any[]) => { writes.push(args); return { success: true } } },
    '@/lib/email-tracking': { verifyTrackingSignature: (id: number, type: string, sig: string) => id === 1 && sig === 'signed-test-token' && ['open', 'click', 'unsubscribe'].includes(type) },
  })
  const valid = 'https://example.com/api/email-track?rid=1&t=unsubscribe&sig=signed-test-token'
  const confirmation = await route.GET(new Request(valid))
  assert.match(await confirmation.text(), /Confirm unsubscribe/)
  assert.equal(writes.length, 0)
  assert.equal((await route.POST(new Request(valid, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"rid":1}' }))).status, 405)
  assert.equal((await route.POST(new Request(valid, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'rid=1&sig=wrong' }))).status, 400)
  assert.equal((await route.POST(new Request(valid, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'rid=1&sig=signed-test-token' }))).status, 200)
  assert.equal(writes.length, 1)
  await route.GET(new Request(valid.replace('rid=1', 'rid=1junk')))
  assert.equal(writes.length, 1)
  await route.GET(new Request(valid.replace('t=unsubscribe', 't=open')))
  assert.equal(background.length, 1)
  await background[0]()
  assert.equal(writes[1][1], 'open')
})
