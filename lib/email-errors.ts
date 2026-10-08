import { formatSmtpError } from './email-senders'

export function isSmtpAccountBlocked(error: unknown) {
  return /outbound sending is disabled|sending (?:is )?(?:disabled|suspended)|disabled by user from hpanel|daily (?:sending |email )?(?:limit|quota)|sending quota exceeded/i.test(formatSmtpError(error))
}

export function emailFailureMessage(error: unknown) {
  const message = formatSmtpError(error, 'Email delivery failed.')
  if (!isSmtpAccountBlocked(error)) return message
  return `Your email provider has disabled or limited outbound sending. For Hostinger, check hPanel → Emails → your domain → Mailboxes → mailbox Settings → Suspend sending. If provider-suspended or quota-limited, contact support or wait for the reset. SMTP login can succeed while sending is blocked. After resolving this, send one test email before retrying campaigns. Provider response: ${message}`
}
