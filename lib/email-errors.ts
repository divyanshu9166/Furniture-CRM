import { formatSmtpError } from './email-senders'

export function isSmtpAccountBlocked(error: unknown) {
  const message = formatSmtpError(error)
  const code = (error as { code?: string; responseCode?: number } | null)?.code
  const responseCode = (error as { responseCode?: number } | null)?.responseCode
  return code === 'EAUTH' || responseCode === 535 || /CRM email sending is stopped|(?:^|\s)535\s|outbound sending is disabled|sending (?:is )?(?:disabled|suspended)|disabled by user from hpanel|daily (?:sending |email )?(?:limit|quota)|sending quota exceeded|too many (?:messages|emails)|rate limit|spam[- ]like|suspected spam|suspicious activity|account.{0,40}(?:blocked|suspended)|message (?:rejected|blocked).{0,40}(?:spam|policy)|5\.7\.1.{0,100}(?:spam|policy|suspend|disabled)/i.test(message)
}

export function emailFailureMessage(error: unknown) {
  const code = (error as { code?: string } | null)?.code
  if (code === 'P2021' || code === 'P2022') return 'Email sending safety database is not up to date. Apply pending Prisma migrations and restart the rebuilt app. No new SMTP attempt is allowed until safety checks are available.'
  const message = formatSmtpError(error, 'Email delivery failed.')
  if (!isSmtpAccountBlocked(error)) return message
  return `Your provider rejected sending for an account, security, authentication or quota reason. For Hostinger, review hPanel → Emails → your domain → Email Logs and mailbox Settings → Suspend sending status. Stop repeated tests/reactivation; resolve the trigger or contact support first. SMTP login can succeed while sending is blocked. Review the CRM Sending safety stop after provider recovery; only then send one test email and inspect its headers before any campaign retry. Provider response: ${message}`
}
