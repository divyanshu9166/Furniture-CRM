import { z } from 'zod'

export function formatSmtpError(error: unknown, fallback = 'Invalid SMTP settings.'): string {
  if (error instanceof z.ZodError) return [...new Set(error.issues.map(issue => issue.message))].join(' ') || fallback
  if (error instanceof Error) return error.message || fallback
  return typeof error === 'string' && error.trim() ? error : fallback
}

export function smtpTransportProblem(port: number | string, secure: boolean): string | null {
  if (typeof port !== 'number' || !Number.isInteger(port) || port < 1 || port > 65535) return 'Enter a whole-number SMTP port between 1 and 65535.'
  if (port === 465 && !secure) return 'Port 465 requires SSL/TLS. Enable Use SSL or choose port 587 for STARTTLS.'
  if (port === 587 && secure) return 'Port 587 uses STARTTLS. Uncheck Use SSL or choose port 465 for SSL/TLS.'
  return null
}

/** Keep standard port/encryption pairs consistent, without changing credentials,
 * aliases or an explicitly configured custom port. Empty input stays editable. */
export function changeSmtpPort<T extends { smtpPort: number | string; smtpSecure: boolean }>(form: T, raw: string | number) {
  const port = raw === '' ? '' : Number(raw)
  return { ...form, smtpPort: port, smtpSecure: port === 465 ? true : port === 587 ? false : form.smtpSecure }
}

export function changeSmtpEncryption<T extends { smtpPort: number | string; smtpSecure: boolean }>(form: T, secure: boolean) {
  const standard = form.smtpPort === 465 || form.smtpPort === 587
  return { ...form, smtpSecure: secure, smtpPort: standard ? (secure ? 465 : 587) : form.smtpPort }
}

const noHeaderControls = (value: string) => !/[\r\n\0]/.test(value)
export const senderEmailSchema = z.string().max(254).refine(noHeaderControls, 'Email cannot contain header controls.')
  .transform(value => value.trim().toLowerCase()).pipe(z.string().email('Enter a valid sender email address.'))
export const senderNameSchema = z.string().max(150).refine(noHeaderControls, 'Sender name cannot contain header controls.').transform(value => value.trim())
export const senderIdentitySchema = z.object({ email: senderEmailSchema, name: senderNameSchema.default('') })
export const senderAliasesSchema = z.array(senderIdentitySchema).max(20, 'At most 20 sender aliases are supported.')
export type SenderIdentity = z.infer<typeof senderIdentitySchema>

export interface SenderConfig {
  smtpUser: string
  smtpFromName: string
  smtpFromEmail?: string | null
  smtpAliases?: unknown
}

/** Primary mailbox is always available; aliases are an admin-managed allowlist.
 * Provider authorization must be checked with a real test email, not SMTP verify(). */
export function getSenderIdentities(config: SenderConfig): SenderIdentity[] {
  const primary = senderIdentitySchema.parse({ email: config.smtpUser, name: config.smtpFromName || '' })
  const aliases = senderAliasesSchema.parse(config.smtpAliases ?? [])
  const seen = new Set([primary.email])
  for (const alias of aliases) {
    if (seen.has(alias.email)) throw new Error(`Duplicate sender address: ${alias.email}`)
    seen.add(alias.email)
  }
  return [primary, ...aliases.map(alias => ({ ...alias, name: alias.name || primary.name }))]
}

export function resolveSender(config: SenderConfig, selected?: string | null, snapshotName?: string | null): SenderIdentity {
  const email = senderEmailSchema.parse(selected || config.smtpFromEmail || config.smtpUser)
  const sender = getSenderIdentities(config).find(identity => identity.email === email)
  if (!sender) throw new Error(`Sender ${email} is no longer configured. Select an available sender in Email Setup.`)
  return { email, name: snapshotName == null ? sender.name : senderNameSchema.parse(snapshotName) }
}

export function senderHeaders(config: SenderConfig, selected?: string | null, snapshotName?: string | null) {
  const identity = resolveSender(config, selected, snapshotName)
  const address = { address: identity.email, name: identity.name }
  return { from: address, replyTo: { ...address } }
}

export const smtpConfigSchema = z.object({
  smtpHost: z.string().trim().min(1).max(253).regex(/^[a-z0-9.-]+$/i, 'Enter an SMTP hostname, not a URL.'),
  smtpPort: z.number().int().min(1).max(65535),
  smtpUser: senderEmailSchema,
  smtpPass: z.string().min(1, 'SMTP password is required.').max(2048),
  smtpFromName: senderNameSchema,
  smtpSecure: z.boolean(),
  smtpFromEmail: z.union([senderEmailSchema, z.literal(''), z.null()]).optional(),
  smtpAliases: senderAliasesSchema.optional(),
}).superRefine((config, context) => {
  try { resolveSender(config) } catch (error) {
    context.addIssue({ code: 'custom', message: formatSmtpError(error, 'Invalid email sender settings.') })
  }
  const transportProblem = smtpTransportProblem(config.smtpPort, config.smtpSecure)
  if (transportProblem) context.addIssue({ code: 'custom', path: ['smtpSecure'], message: transportProblem })
})

/** Empty password keeps the saved secret only for the same SMTP host/mailbox.
 * Never expose the saved secret to the browser or forward it to a changed host. */
export function prepareSmtpConfig(input: Record<string, unknown>, saved: Record<string, unknown> | null) {
  const config = { ...saved, ...input }
  config.smtpFromName = config.smtpFromName || saved?.storeName || ''
  if (config.smtpPort === undefined) config.smtpPort = 587
  if (!input.smtpPass) {
    const unchanged = String(config.smtpHost || '').trim().toLowerCase() === String(saved?.smtpHost || '').trim().toLowerCase()
      && String(config.smtpUser || '').trim().toLowerCase() === String(saved?.smtpUser || '').trim().toLowerCase()
    config.smtpPass = unchanged ? saved?.smtpPass : ''
  }
  return smtpConfigSchema.parse(config)
}
