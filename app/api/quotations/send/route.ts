import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/auth-helpers'
import { sendEmail } from '@/lib/email'
import { decrypt } from '@/lib/whatsapp/encryption'
import { sendMediaMessage, uploadMedia } from '@/lib/whatsapp/meta-api'
import {
  humanReadableMetaError,
  isRecipientNotAllowedError,
  isRecipientNotRegisteredError,
  isValidE164,
  normalizePhoneForMetaIndia,
  phoneVariants,
} from '@/lib/whatsapp/phone-utils'
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from '@/lib/rate-limit'

export const runtime = 'nodejs'

const MAX_PDF_BYTES = 10 * 1024 * 1024

const esc = (value: unknown) =>
  String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const rupees = (amount: number) => `Rs. ${Number(amount || 0).toLocaleString('en-IN')}`

/**
 * POST /api/quotations/send  (multipart: quotationId, channel, file)
 *
 * Sends the quotation PDF the browser just generated to the customer, as a
 * WhatsApp document (Cloud API) or an email attachment (store SMTP). The
 * recipient always comes from the saved quotation, never from the request.
 */
export async function POST(request: Request) {
  try {
    const session = await getSession()
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const userId = String(session.user.id)

    const limit = checkRateLimit(`quotation-send:${userId}`, RATE_LIMITS.send)
    if (!limit.success) return rateLimitResponse(limit)

    let form: FormData
    try {
      form = await request.formData()
    } catch {
      return NextResponse.json({ error: 'Invalid upload.' }, { status: 400 })
    }

    const channel = String(form.get('channel') ?? '')
    const quotationId = Number(form.get('quotationId'))
    const file = form.get('file')
    if (channel !== 'whatsapp' && channel !== 'email') return NextResponse.json({ error: 'Unknown channel.' }, { status: 400 })
    if (!Number.isSafeInteger(quotationId) || quotationId <= 0) return NextResponse.json({ error: 'Invalid quotation.' }, { status: 400 })
    if (!(file instanceof Blob) || file.size === 0) return NextResponse.json({ error: 'The quotation PDF is missing.' }, { status: 400 })
    if (file.size > MAX_PDF_BYTES) return NextResponse.json({ error: 'The PDF is larger than 10 MB.' }, { status: 400 })
    const bytes = Buffer.from(await file.arrayBuffer())
    if (bytes.subarray(0, 5).toString('latin1') !== '%PDF-') return NextResponse.json({ error: 'That file is not a PDF.' }, { status: 400 })

    const quotation = await prisma.quotation.findUnique({ where: { id: quotationId }, include: { contact: true } })
    if (!quotation) return NextResponse.json({ error: 'Quotation not found.' }, { status: 404 })
    const store = await prisma.storeSettings.findFirst({ where: { id: 1 } })
    const storeName = store?.storeName || 'Furniture Store'
    const filename = `Quotation_${quotation.displayId.replace(/[^A-Za-z0-9._-]+/g, '_')}.pdf`
    const validUntil = quotation.validUntil
      ? quotation.validUntil.toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'UTC' })
      : ''

    // ── Email ────────────────────────────────────────────────────────────
    if (channel === 'email') {
      const to = (quotation.emailId || quotation.contact.email || '').trim()
      if (!to) return NextResponse.json({ error: 'This customer has no email address. Edit the quotation and add one.' }, { status: 400 })

      const contactBits = [store?.phone && `Phone: ${store.phone}`, store?.email && `Email: ${store.email}`].filter(Boolean).join(' | ')
      const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#111;line-height:1.5">
<p>Hello ${esc(quotation.contact.name)},</p>
<p>Please find attached your quotation <strong>${esc(quotation.displayId)}</strong> from ${esc(storeName)}.</p>
<p>Total: <strong>${esc(rupees(quotation.grandTotal))}</strong>${validUntil ? `<br/>Valid until: ${esc(validUntil)}` : ''}</p>
${contactBits ? `<p>${esc(contactBits)}</p>` : ''}
<p>Regards,<br/>${esc(storeName)}</p></div>`

      const result = await sendEmail({
        to,
        subject: `Quotation ${quotation.displayId} from ${storeName}`,
        html,
        attachments: [{ filename, content: bytes, contentType: 'application/pdf' }],
      })
      if (!result.success) return NextResponse.json({ error: result.error || 'The email could not be sent.' }, { status: 502 })
      return NextResponse.json({ success: true, to })
    }

    // ── WhatsApp ─────────────────────────────────────────────────────────
    const phone = normalizePhoneForMetaIndia(quotation.contact.phone || '')
    if (!isValidE164(phone)) return NextResponse.json({ error: 'The customer phone number is not valid for WhatsApp.' }, { status: 400 })

    const config = (await prisma.waWhatsappConfig.findFirst({ where: { user_id: userId } }))
      ?? (await prisma.waWhatsappConfig.findFirst({ orderBy: { created_at: 'asc' } }))
    if (!config) return NextResponse.json({ error: 'WhatsApp is not connected. Connect it in WhatsApp Marketing → Settings.' }, { status: 400 })
    const accessToken = decrypt(config.access_token)

    let mediaId: string
    try {
      ;({ mediaId } = await uploadMedia({ phoneNumberId: config.phone_number_id, accessToken, file: new Blob([bytes], { type: 'application/pdf' }), filename, mimeType: 'application/pdf' }))
    } catch (err) {
      const raw = err instanceof Error ? err.message : 'Unknown Meta API error'
      console.error('[quotations/send] media upload failed:', raw)
      return NextResponse.json({ error: humanReadableMetaError(raw) }, { status: 502 })
    }

    const caption = `Quotation ${quotation.displayId} from ${storeName}\nTotal: ${rupees(quotation.grandTotal)}${validUntil ? `\nValid until: ${validUntil}` : ''}`
    let lastError: unknown = null
    for (const variant of phoneVariants(phone)) {
      try {
        await sendMediaMessage({ phoneNumberId: config.phone_number_id, accessToken, to: variant, kind: 'document', mediaId, caption, filename })
        return NextResponse.json({ success: true, to: variant })
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        lastError = err
        // Only a "recipient not in allowed list" failure is worth retrying with another number format.
        if (isRecipientNotRegisteredError(message) || !isRecipientNotAllowedError(message)) break
      }
    }
    const raw = lastError instanceof Error ? lastError.message : 'Unknown Meta API error'
    console.error('[quotations/send] WhatsApp send failed:', raw)
    return NextResponse.json({ error: humanReadableMetaError(raw) }, { status: 502 })
  } catch (error) {
    console.error('[quotations/send] failed:', error)
    return NextResponse.json({ error: 'Failed to send the quotation.' }, { status: 500 })
  }
}
