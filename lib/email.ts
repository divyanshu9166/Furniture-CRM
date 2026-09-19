import nodemailer from 'nodemailer'
import { prisma } from '@/lib/db'
import { addTrackingToEmail } from '@/lib/email-tracking'

export interface SmtpConfig {
  smtpHost: string
  smtpPort: number
  smtpUser: string
  smtpPass: string
  smtpFromName: string
  smtpSecure: boolean
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
  }
}

// ─── CREATE TRANSPORTER ─────────────────────────────

export function createTransporter(config: SmtpConfig) {
  return nodemailer.createTransport({
    host: config.smtpHost,
    port: config.smtpPort,
    secure: config.smtpSecure, // true for 465, false for 587 (STARTTLS)
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
}): Promise<{ success: boolean; error?: string; messageId?: string }> {
  const config = await getSmtpConfig()
  if (!config) return { success: false, error: 'SMTP not configured. Go to Settings → Email Setup.' }

  const transporter = createTransporter(config)
  const html = options.recipientId ? addTrackingToEmail(options.html, options.recipientId) : options.html

  try {
    const result = await transporter.sendMail({
      from: `"${config.smtpFromName}" <${config.smtpUser}>`,
      to: options.to,
      subject: options.subject,
      html,
    })

    return { success: true, messageId: result.messageId }
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to send email' }
  }
}

// ─── SEND BULK EMAILS (with throttling) ─────────────

export async function sendBulkEmails(emails: {
  to: string
  subject: string
  html: string
  recipientId: number
}[]): Promise<{ sent: number; failed: number; errors: string[]; results: Array<{ recipientId: number; success: boolean; error?: string }> }> {
  const config = await getSmtpConfig()
  if (!config) return {
    sent: 0,
    failed: emails.length,
    errors: ['SMTP not configured'],
    results: emails.map(email => ({ recipientId: email.recipientId, success: false, error: 'SMTP not configured' })),
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

    const results = await Promise.allSettled(
      batch.map(async (email) => {
        await transporter.sendMail({
          from: `"${config.smtpFromName}" <${config.smtpUser}>`,
          to: email.to,
          subject: email.subject,
          html: addTrackingToEmail(email.html, email.recipientId),
        })
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
        const error = result.reason?.message || 'Unknown error'
        errors.push(error)
        deliveryResults.push({ recipientId, success: false, error })
      }
    })

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
    return { success: false, error: err.message || 'Connection failed' }
  }
}

// ─── SEND TEST EMAIL ────────────────────────────────

export async function sendTestEmail(config: SmtpConfig, to: string): Promise<{ success: boolean; error?: string }> {
  try {
    const transporter = createTransporter(config)
    await transporter.sendMail({
      from: `"${config.smtpFromName}" <${config.smtpUser}>`,
      to,
      subject: 'Test Email from Furzentic',
      html: `
        <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto; padding: 30px;">
          <h2 style="color: #1a1a1a;">Email Setup Successful!</h2>
          <p style="color: #555;">Your Furzentic email is configured and working correctly.</p>
          <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 16px; margin: 20px 0;">
            <p style="color: #166534; margin: 0; font-weight: 600;">SMTP Host: ${config.smtpHost}</p>
            <p style="color: #166534; margin: 4px 0 0;">From: ${config.smtpUser}</p>
          </div>
          <p style="color: #888; font-size: 13px;">You can now send email campaigns to your customers.</p>
        </div>
      `,
    })
    return { success: true }
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to send test email' }
  }
}

// ─── REPLACE TEMPLATE VARIABLES ─────────────────────

export function replaceVariables(template: string, variables: Record<string, string>): string {
  let result = template
  for (const [key, value] of Object.entries(variables)) {
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value)
  }
  return result
}
