import nodemailer from 'nodemailer'
import { prisma } from '@/lib/db'
import { addTrackingToEmail } from '@/lib/email-tracking'
import { formatSmtpError, senderHeaders, smtpConfigSchema } from '@/lib/email-senders'
import { emailFailureMessage, isSmtpAccountBlocked } from '@/lib/email-errors'
import { getSuppressedCampaignEmails } from '@/lib/email-audience-service'

export interface SmtpConfig {
  smtpHost: string
  smtpPort: number
  smtpUser: string
  smtpPass: string
  smtpFromName: string
  smtpSecure: boolean
  smtpFromEmail?: string | null
  smtpAliases?: unknown
}

// ─── GET SMTP CONFIG FROM DB ────────────────────────

export async function getSmtpConfig(): Promise<SmtpConfig | null> {
  const settings = await prisma.storeSettings.findFirst({ where: { id: 1 } })
  if (!settings?.smtpHost || !settings?.smtpUser || !settings?.smtpPass) return null

  return {
    smtpHost: settings.smtpHost,
    smtpPort: settings.smtpPort || 587,
    smtpUser: settings.smtpUser,
    smtpPass: settings.smtpPass,
    smtpFromName: settings.smtpFromName || settings.storeName || 'Furniture Store',
    smtpSecure: settings.smtpSecure,
    smtpFromEmail: settings.smtpFromEmail,
    smtpAliases: settings.smtpAliases,
  }
}

// ─── CREATE TRANSPORTER ─────────────────────────────

export function createTransporter(config: SmtpConfig) {
  config = smtpConfigSchema.parse(config)
  return nodemailer.createTransport({
    host: config.smtpHost,
    port: config.smtpPort,
    secure: config.smtpSecure, // true for 465, false for 587 (STARTTLS)
    requireTLS: !config.smtpSecure,
    auth: {
      user: config.smtpUser,
      pass: config.smtpPass,
    },
    // Timeouts for reliability
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 30000,
  })
}

// ─── SEND SINGLE EMAIL ──────────────────────────────

export async function sendEmail(options: {
  to: string
  subject: string
  html: string
  recipientId?: number // for tracking pixel injection
  fromEmail?: string
  fromName?: string
}): Promise<{ success: boolean; error?: string; messageId?: string }> {
  try {
    const config = await getSmtpConfig()
    if (!config) return { success: false, error: 'SMTP not configured. Go to Settings → Email Setup.' }
    const headers = senderHeaders(config, options.fromEmail, options.fromName)
    const transporter = createTransporter(config)
    const html = options.recipientId ? addTrackingToEmail(options.html, options.recipientId) : options.html
    const result = await transporter.sendMail({
      ...headers,
      to: options.to,
      subject: options.subject,
      html,
    })

    return { success: true, messageId: result.messageId }
  } catch (err: any) {
    return { success: false, error: emailFailureMessage(err) }
  }
}

// ─── SEND BULK EMAILS (with throttling) ─────────────

export async function sendBulkEmails(emails: {
  to: string
  subject: string
  html: string
  recipientId: number
}[], sender: { fromEmail?: string | null; fromName?: string | null; config?: SmtpConfig } = {}): Promise<{ sent: number; failed: number; errors: string[]; results: Array<{ recipientId: number; success: boolean; error?: string }> }> {
  let config: SmtpConfig
  let headers: ReturnType<typeof senderHeaders>
  try {
    const loaded = sender.config || await getSmtpConfig()
    if (!loaded) throw new Error('SMTP not configured')
    config = smtpConfigSchema.parse(loaded)
    headers = senderHeaders(config, sender.fromEmail, sender.fromName)
  } catch (error) {
    const message = formatSmtpError(error, 'Invalid SMTP sender settings.')
    return { sent: 0, failed: emails.length, errors: [message], results: emails.map(email => ({ recipientId: email.recipientId, success: false, error: message })) }
  }

  const transporter = createTransporter(config)

  let sent = 0
  let failed = 0
  const errors: string[] = []
  const deliveryResults: Array<{ recipientId: number; success: boolean; error?: string }> = []

  // Send in batches of 5 with 1 second delay between batches
  const batchSize = 5
  for (let i = 0; i < emails.length; i += batchSize) {
    const batch = emails.slice(i, i + batchSize)
    const suppressed = new Set(await getSuppressedCampaignEmails(batch.map(email => email.to)))

    const results = await Promise.allSettled(
      batch.map(async (email) => {
        if (suppressed.has(email.to.trim().toLowerCase())) throw new Error('Recipient unsubscribed; email was not sent.')
        const response = await transporter.sendMail({
          ...headers,
          to: email.to,
          subject: email.subject,
          html: addTrackingToEmail(email.html, email.recipientId),
        })
        if (Array.isArray(response.accepted) && !response.accepted.length) throw new Error('SMTP did not accept this recipient.')
        return email.recipientId
      })
    )

    results.forEach((result, index) => {
      const recipientId = batch[index].recipientId
      if (result.status === 'fulfilled') {
        sent++
        deliveryResults.push({ recipientId, success: true })
      } else {
        failed++
        const error = emailFailureMessage(result.reason)
        errors.push(error)
        deliveryResults.push({ recipientId, success: false, error })
      }
    })

    // Do not keep hammering an account whose provider disabled outbound sending.
    const blocked = results.find(result => result.status === 'rejected' && isSmtpAccountBlocked(result.reason))
    if (blocked?.status === 'rejected') {
      const error = emailFailureMessage(blocked.reason)
      for (const email of emails.slice(i + batchSize)) {
        failed++
        deliveryResults.push({ recipientId: email.recipientId, success: false, error })
      }
      break
    }

    // Throttle: wait 1 second between batches to avoid rate limits
    if (i + batchSize < emails.length) {
      await new Promise(resolve => setTimeout(resolve, 1000))
    }
  }

  return { sent, failed, errors: [...new Set(errors)], results: deliveryResults }
}

// ─── TEST SMTP CONNECTION ───────────────────────────

export async function testSmtpConnection(config: SmtpConfig): Promise<{ success: boolean; error?: string }> {
  try {
    const transporter = createTransporter(config)
    await transporter.verify()
    return { success: true }
  } catch (err: any) {
    return { success: false, error: formatSmtpError(err, 'Connection failed') }
  }
}

// ─── SEND TEST EMAIL ────────────────────────────────

export async function sendTestEmail(config: SmtpConfig, to: string, fromEmail?: string): Promise<{ success: boolean; error?: string }> {
  try {
    const headers = senderHeaders(config, fromEmail)
    const transporter = createTransporter(config)
    await transporter.sendMail({
      ...headers,
      to,
      subject: 'Test Email from Furzentic',
      html: `
        <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto; padding: 30px;">
          <h2 style="color: #1a1a1a;">Email Setup Successful!</h2>
          <p style="color: #555;">Your Furzentic email is configured and working correctly.</p>
          <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 16px; margin: 20px 0;">
            <p style="color: #166534; margin: 0; font-weight: 600;">Your selected sender was accepted by the SMTP server.</p>
            <p style="color: #166534; margin: 4px 0 0;">Check this message's From and Reply-To addresses before using it for campaigns.</p>
          </div>
          <p style="color: #888; font-size: 13px;">You can now send email campaigns to your customers.</p>
        </div>
      `,
    })
    return { success: true }
  } catch (err: any) {
    return { success: false, error: emailFailureMessage(err) }
  }
}

// ─── REPLACE TEMPLATE VARIABLES ─────────────────────

export function replaceVariables(template: string, variables: Record<string, string>, context: 'html' | 'text' = 'html'): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (placeholder, key: string) => {
    if (!Object.prototype.hasOwnProperty.call(variables, key)) return placeholder
    const value = variables[key]
    // Callback substitution keeps $&, $1 etc literal; HTML values cannot inject
    // markup/attributes. Subjects remain plain text rather than HTML entities.
    return context === 'text' ? value : value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!)
  })
}
