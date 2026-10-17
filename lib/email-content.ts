const automaticVariables = new Set(['customerName', 'storeName', 'storePhone', 'storeEmail', 'storeAddress', 'storeUrl'])

export type EmailContentField = 'subject' | 'body' | 'variantBSubject' | 'variantBBody'
export function findEditableEmailPlaceholders(subject: string, body: string, variantB?: { subject?: string; body?: string } | null) {
  const fields: Array<{ field: EmailContentField; label: string; content: string }> = [
    { field: 'subject', label: 'Email subject', content: subject },
    { field: 'body', label: 'Email body (HTML)', content: body },
    ...(variantB ? [
      { field: 'variantBSubject' as const, label: 'Variant B subject', content: variantB.subject || '' },
      { field: 'variantBBody' as const, label: 'Variant B body (HTML)', content: variantB.body || '' },
    ] : []),
  ]
  return fields.flatMap(({ field, label, content }) => {
    const counts = new Map<string, number>()
    for (const match of content.matchAll(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g)) {
      if (!automaticVariables.has(match[1])) counts.set(match[1], (counts.get(match[1]) || 0) + 1)
    }
    return [...counts].map(([key, count]) => ({ key, field, label, count }))
  })
}

export function isEditablePlaceholderError(message: string) {
  return message.startsWith('Replace these editable placeholders with actual values before sending:')
}

export function shouldClearCampaignContentError(message: string, errorCampaignId: number | null, savedCampaignId: number, saved: { subject: string; body: string; isABTest: boolean; variantBSubject?: string; variantBBody?: string }) {
  return errorCampaignId === savedCampaignId && isEditablePlaceholderError(message)
    && findEditableEmailPlaceholders(saved.subject, saved.body, saved.isABTest ? { subject: saved.variantBSubject, body: saved.variantBBody } : null).length === 0
}

/** Explicit editor operation only: never changes a template or saved campaign.
 * HTML replacements are escaped; subjects remain plain text. Disabled variant B
 * and automatic personalization tokens are intentionally left untouched. */
export function applyEditableEmailValues<T extends { subject: string; body: string; isABTest: boolean; variantBSubject?: string; variantBBody?: string }>(form: T, values: Record<string, string>): T {
  const issues = findEditableEmailPlaceholders(form.subject, form.body, form.isABTest ? { subject: form.variantBSubject, body: form.variantBBody } : null)
  const keys = new Set(issues.map(issue => issue.key))
  const replacements = new Map<string, string>()
  for (const key of keys) {
    if (!Object.hasOwn(values, key) || typeof values[key] !== 'string' || !values[key].trim()) continue
    const value = values[key].trim()
    if (value.length > 500 || /[\r\n\0]/.test(value) || /\{\{[\s\S]*?\}\}/.test(value)) throw new Error(`Enter an actual single-line value of at most 500 characters for ${key}, not another placeholder.`)
    replacements.set(key, value)
  }
  const replace = (content: string, html: boolean) => content.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (original, key: string) => {
    const value = replacements.get(key)
    if (value === undefined) return original
    return html ? value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!) : value
  })
  return { ...form, subject: replace(form.subject, false), body: replace(form.body, true), ...(form.isABTest ? {
    variantBSubject: replace(form.variantBSubject || '', false), variantBBody: replace(form.variantBBody || '', true),
  } : {}) }
}

/** Templates may keep editable placeholders; live campaigns must resolve them. */
export function assertEmailContentReady(subject: string, body: string, variantB?: { subject?: string; body?: string } | null) {
  const issues = findEditableEmailPlaceholders(subject, body, variantB)
  const unresolved = new Set(issues.map(issue => issue.key))
  if (unresolved.size) throw new Error(`Replace these editable placeholders with actual values before sending: ${[...unresolved].join(', ')}. Only customerName and storeName/storePhone/storeEmail/storeAddress/storeUrl are filled automatically. Remaining locations: ${issues.map(issue => `${issue.key} in ${issue.label} (${issue.count})`).join('; ')}.`)
}
