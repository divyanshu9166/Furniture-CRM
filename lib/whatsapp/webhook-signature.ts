import crypto from 'node:crypto'

/**
 * Verify the HMAC-SHA256 signature Meta attaches to webhook POSTs.
 *
 * Meta signs the raw request body with your App Secret and sends the
 * result in the `x-hub-signature-256: sha256=<hex>` header. Without
 * verification, anyone who knows our webhook URL can POST fabricated
 * status updates and drift broadcast counts arbitrarily.
 *
 * Reference:
 *   https://developers.facebook.com/docs/graph-api/webhooks/getting-started#verify-payloads
 *
 * Contract:
 *   An App Secret (WhatsApp Settings or `META_APP_SECRET`) should be
 *   configured. If none is, verification is skipped with a loud warning
 *   so events aren't silently dropped during initial setup.
 */
export function verifyMetaWebhookSignature(
  rawBody: string,
  signatureHeader: string | null,
  /** App Secrets to accept (from WhatsApp Settings, see saved-secrets.ts).
   *  Omitted → META_APP_SECRET. */
  secrets?: string[],
): boolean {
  const envSecret = process.env.META_APP_SECRET
  const candidates = secrets ?? (envSecret ? [envSecret] : [])

  // If META_APP_SECRET is not set, skip signature verification but log
  // a loud warning. This prevents webhook events from being silently
  // dropped when the env var is missing (common during initial setup).
  // In production you MUST set META_APP_SECRET — without it anyone can
  // POST fake status updates to your webhook URL.
  if (candidates.length === 0) {
    console.warn(
      '[webhook] No Meta App Secret configured — skipping signature ' +
        'verification. Save it in WhatsApp Marketing → Settings → Webhook ' +
        'Security (or set META_APP_SECRET) to secure your webhook.',
    )
    return true // fail-open so events aren't silently dropped
  }

  if (!signatureHeader) return false
  if (!signatureHeader.startsWith('sha256=')) return false

  const a = Buffer.from(signatureHeader)
  return candidates.some((secret) => {
    const expected =
      'sha256=' +
      crypto.createHmac('sha256', secret).update(rawBody).digest('hex')
    const b = Buffer.from(expected)
    // Bail if lengths differ — timingSafeEqual throws otherwise.
    if (a.length !== b.length) return false
    return crypto.timingSafeEqual(a, b)
  })
}