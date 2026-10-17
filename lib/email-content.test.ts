import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { applyEditableEmailValues, assertEmailContentReady, findEditableEmailPlaceholders, isEditablePlaceholderError, shouldClearCampaignContentError } from './email-content'

const form = () => ({ name: 'Keep campaign', templateId: '7', audienceFilter: { contactIds: [1] }, subject: 'Introducing {{collectionName}}', body: '<p>{{ collectionName }} / {{collectionName}}</p><p>{{customerName}}: {{storeName}}</p>', isABTest: true, variantBSubject: 'New {{collectionName}}', variantBBody: '<a title="{{collectionName}}">View</a>', fromEmail: 'sales@example.com' })

test('finds remaining fields/counts across subject, hidden HTML attributes and enabled variant B', () => {
  const f = form()
  assert.deepEqual(findEditableEmailPlaceholders(f.subject, f.body, { subject: f.variantBSubject, body: f.variantBBody }), [
    { key: 'collectionName', field: 'subject', label: 'Email subject', count: 1 },
    { key: 'collectionName', field: 'body', label: 'Email body (HTML)', count: 2 },
    { key: 'collectionName', field: 'variantBSubject', label: 'Variant B subject', count: 1 },
    { key: 'collectionName', field: 'variantBBody', label: 'Variant B body (HTML)', count: 1 },
  ])
  assert.throws(() => assertEmailContentReady('Hi', '<a title="{{collectionName}}">View</a>'), /collectionName in Email body \(HTML\) \(1\)/)
  assert.throws(() => assertEmailContentReady('Hi', 'Body', { body: '{{collectionName}}' }), /Variant B body/)
})

test('explicit replacement resolves every active occurrence without changing inputs, metadata or automatic tokens', () => {
  const f = form(); const before = structuredClone(f)
  const result = applyEditableEmailValues(f, { collectionName: 'Office & School <New> "2026" $&' })
  assert.equal(result.subject, 'Introducing Office & School <New> "2026" $&')
  assert.match(result.body, /Office &amp; School &lt;New&gt; &quot;2026&quot; \$&/)
  assert.match(result.body, /\{\{customerName\}\}: \{\{storeName\}\}/)
  assert.doesNotMatch(result.body + result.subject + result.variantBBody, /\{\{\s*collectionName/)
  assert.deepEqual(f, before)
  for (const key of ['name', 'templateId', 'audienceFilter', 'fromEmail'] as const) assert.deepEqual(result[key], f[key])
  assert.doesNotThrow(() => assertEmailContentReady(result.subject, result.body, { subject: result.variantBSubject, body: result.variantBBody }))
})

test('missing values remain blocked; automatic names cannot be manually replaced', () => {
  const f = form()
  const missingValues: Record<string, string>[] = [{}, { collectionName: ' ' }, { customerName: 'Someone', storeName: 'Replacement' }]
  for (const values of missingValues) {
    const result = applyEditableEmailValues(f, values)
    assert.equal(result.body, f.body)
    assert.throws(() => assertEmailContentReady(result.subject, result.body), /collectionName/)
  }
})

test('disabled variant B does not block, is not replaced, and is checked again if re-enabled', () => {
  const result = applyEditableEmailValues({ ...form(), isABTest: false }, { collectionName: 'Office' })
  assert.doesNotThrow(() => assertEmailContentReady(result.subject, result.body))
  assert.match(result.variantBSubject, /\{\{collectionName\}\}/)
  assert.throws(() => assertEmailContentReady(result.subject, result.body, { subject: result.variantBSubject }), /Variant B subject/)
})

test('replacement prevents injected HTML/attributes, header controls, oversized values and nested placeholders', () => {
  for (const value of ['X\r\nBcc: other@example.com', 'X\0', '{{otherVariable}}', 'x'.repeat(501)]) assert.throws(() => applyEditableEmailValues(form(), { collectionName: value }), /actual single-line value/)
  const result = applyEditableEmailValues(form(), { collectionName: '"><img src=x onerror=alert(1)>' })
  assert.doesNotMatch(result.body, /<img/)
  assert.match(result.variantBBody, /title="&quot;&gt;&lt;img/)
})

test('prototype-like keys are treated as plain tokens, never inherited values', () => {
  const f = { subject: '{{constructor}}', body: '{{__proto__}}', isABTest: false }
  assert.deepEqual(applyEditableEmailValues(f, {}), f)
  const result = applyEditableEmailValues(f, JSON.parse('{"constructor":"Office","__proto__":"Furniture"}'))
  assert.equal(result.subject, 'Office'); assert.equal(result.body, 'Furniture')
  assert.equal(Object.getPrototypeOf(result), Object.prototype)
})

test('only a corrected, successfully saved matching campaign may clear its old content banner', () => {
  let message = ''
  try { assertEmailContentReady('{{collectionName}}', 'Body') } catch (error) { message = (error as Error).message }
  const fixed = { ...form(), isABTest: false, subject: 'Office', body: 'Body' }
  assert.equal(isEditablePlaceholderError(message), true)
  assert.equal(shouldClearCampaignContentError(message, 1, 1, fixed), true)
  assert.equal(shouldClearCampaignContentError(message, 1, 2, fixed), false)
  assert.equal(shouldClearCampaignContentError(message, 1, 1, form()), false)
  assert.equal(shouldClearCampaignContentError('SMTP outbound sending disabled', 1, 1, fixed), false)
})

test('content errors route to the campaign editor; explicit apply/save remains separate from sending', () => {
  const page = readFileSync(new URL('../app/(dashboard)/email-marketing/page.js', import.meta.url), 'utf8')
  assert.match(page, /isEditablePlaceholderError\(deliveryError\)[\s\S]*?Edit campaign content/)
  assert.match(page, /if \(res.success\) \{\s*if \(editingCampaign && shouldClearCampaignContentError/)
  assert.match(page, /assertEmailContentReady\(campaign.subject[\s\S]*?previewCampaignRecipients/)
  const panel = readFileSync(new URL('../components/email/CampaignPlaceholderValues.jsx', import.meta.url), 'utf8')
  assert.match(panel, /Applying values alone does not save or send/)
  assert.doesNotMatch(panel, /sendEmailCampaign|updateEmailCampaign|createEmailCampaign/)
})
