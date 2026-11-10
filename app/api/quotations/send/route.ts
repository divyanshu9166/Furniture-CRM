import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/auth-helpers'
import { sendEmail } from '@/lib/email'
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from '@/lib/rate-limit'

export const runtime = 'nodejs'

const MAX_PDF_BYTES = 10 * 1024 * 1024

const esc = (value: unknown) =>
  String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const rupees = (amount: number) => `Rs. ${Number(amount || 0).toLocaleString('en-IN')}`

/**
 * POST /api/quotations/send  (multipart: quotationId, channel=email, file)
 *
 * Emails the quotation PDF the browser just generated to the customer through
 * the store's SMTP settings. The recipient always comes from the saved
 * quotation, never from the request. (WhatsApp is shared from the phone itself.)
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
    if (channel !== 'email') return NextResponse.json({ error: 'Unknown channel.' }, { status: 400 })
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
  } catch (error) {
    console.error('[quotations/send] failed:', error)
    return NextResponse.json({ error: 'Failed to send the quotation.' }, { status: 500 })
  }
}
