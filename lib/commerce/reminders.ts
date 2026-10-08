type Template = { body_text: string; header_type: string | null; header_content: string | null; buttons: unknown; category?: string }

function placeholders(text: string | null | undefined) { return Array.from(text?.matchAll(/{{\s*([^{}]+?)\s*}}/g) ?? [], match => match[1].trim()) }
function requiresDynamicValue(value: unknown): boolean {
  if (typeof value === 'string') return /{{[^{}]+}}/.test(value) || ['COPY_CODE', 'OTP'].includes(value.toUpperCase())
  if (Array.isArray(value)) return value.some(requiresDynamicValue)
  if (value && typeof value === 'object') return Object.values(value).some(requiresDynamicValue)
  return false
}

// Sender supplies one positional body value (customer name) and no media or
// dynamic button/header values. Named/OTP templates need a different sender.
export function isCompatibleReminderTemplate(template: Template) {
  const body = [...new Set(placeholders(template.body_text))]
  return template.category?.toUpperCase() !== 'AUTHENTICATION' && body.length === 1 && body[0] === '1' &&
    (template.header_type === null || template.header_type.toLowerCase() === 'text') &&
    placeholders(template.header_content).length === 0 && !requiresDynamicValue(template.buttons)
}

export function shouldRearmReminder(current: { status: string; followUpDate: Date }, date?: string) {
  return !!date && date !== current.followUpDate.toISOString().slice(0, 10) && ['REMINDED', 'CONTACTED'].includes(current.status)
}
