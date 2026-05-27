import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/session'
import { sendTemplateMessage } from '@/lib/whatsapp/meta-api'
import { decrypt } from '@/lib/whatsapp/encryption'
import {
  recordOutboundTemplateMessage,
  renderTemplatePreview,
} from '@/lib/whatsapp/outbound-message-log'
import {
  normalizePhoneForMetaIndia,
  isValidE164,
  phoneVariants,
  isRecipientNotAllowedError,
  isRecipientNotRegisteredError,
  humanReadableMetaError,
} from '@/lib/whatsapp/phone-utils'
import {
  checkRateLimit,
  rateLimitResponse,
  RATE_LIMITS,
} from '@/lib/rate-limit'
import {
  getBroadcastStatsByIds,
  recalculateBroadcastStats,
} from '@/lib/whatsapp/broadcast-stats'

interface BroadcastResult {
  phone: string
  status: 'sent' | 'failed'
  whatsapp_message_id?: string
  error?: string
}

/**
 * Two input shapes are accepted:
 *
 *   NEW (preferred — supports per-recipient variable substitution):
 *     {
 *       recipients: Array<{ phone: string; params: string[] }>,
 *       template_name, template_language
 *     }
 *
 *   LEGACY (all phones receive the same params — kept so existing
 *   callers don't break):
 *     {
 *       phone_numbers: string[],
 *       template_params: string[],
 *       template_name, template_language
 *     }
 *
 * Previous implementation only supported the legacy shape, and the
 * sending hook was forced to ship every batch with `templateParams[0]`
 * — meaning every recipient got contact-0's personalization. The new
 * shape is what actually fixes that.
 */
interface NewRecipient {
  phone: string
  contact_id?: string
  params?: string[]
}

export async function GET() {
  const session = await getSession()
  if (!session?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const userId = String(session.id)

  try {
    const broadcasts = await prisma.waBroadcast.findMany({
      where: { user_id: userId },
      orderBy: { created_at: 'desc' },
    })
    const statsById = await getBroadcastStatsByIds(broadcasts.map((b) => b.id))
    const enhancedBroadcasts = broadcasts.map((broadcast) => ({
      ...broadcast,
      ...(statsById.get(broadcast.id) ?? {}),
    }))
    return NextResponse.json({ broadcasts: enhancedBroadcasts })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch broadcasts'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const session = await getSession()
    if (!session?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const userId = String(session.id)

    // Per-user broadcast budget.
    const limit = checkRateLimit(`broadcast:${userId}`, RATE_LIMITS.broadcast)
    if (!limit.success) {
      return rateLimitResponse(limit)
    }

    const body = await request.json()
    const {
      recipients: newRecipients,
      phone_numbers,
      broadcast_id,
      template_name,
      template_language,
      template_params,
    } = body

    // Normalize to a list of {phone, params} regardless of shape.
    let recipients: NewRecipient[]
    if (Array.isArray(newRecipients) && newRecipients.length > 0) {
      recipients = newRecipients
    } else if (Array.isArray(phone_numbers) && phone_numbers.length > 0) {
      const shared: string[] = Array.isArray(template_params)
        ? template_params
        : []
      recipients = phone_numbers.map((phone: string) => ({
        phone,
        params: shared,
      }))
    } else {
      return NextResponse.json(
        {
          error:
            'Provide either `recipients` (preferred) or `phone_numbers` — must be a non-empty array',
        },
        { status: 400 }
      )
    }

    if (!template_name) {
      return NextResponse.json(
        { error: 'template_name is required' },
        { status: 400 }
      )
    }

    const config = await prisma.waWhatsappConfig.findUnique({
      where: { user_id: userId },
    })

    if (!config) {
      return NextResponse.json(
        { error: 'WhatsApp not configured. Please set up your WhatsApp integration first.' },
        { status: 400 }
      )
    }

    const accessToken = decrypt(config.access_token)
    const templateLanguage = template_language || 'en_US'
    let writableBroadcastId: string | null = null
    if (broadcast_id) {
      const broadcast = await prisma.waBroadcast.findFirst({
        where: { id: String(broadcast_id), user_id: userId },
        select: { id: true },
      })
      writableBroadcastId = broadcast?.id ?? null
    }

    const results: BroadcastResult[] = []
    let sentCount = 0
    let failedCount = 0
    let touchedBroadcastRecipients = false

    for (const recipient of recipients) {
      const sanitized = normalizePhoneForMetaIndia(recipient.phone)

      if (!isValidE164(sanitized)) {
        results.push({
          phone: recipient.phone,
          status: 'failed',
          error: 'Invalid phone number format',
        })
        failedCount++
        continue
      }

      // Retry with phone variants on sandbox "not in allowed list"
      // errors. A missing trunk-prefix 0 can surface as this error
      // depending on the registered format.
      const variants = phoneVariants(sanitized)
      let sentMessageId: string | null = null
      let lastError: string | null = null

      for (const variant of variants) {
        try {
          const result = await sendTemplateMessage({
            phoneNumberId: config.phone_number_id,
            accessToken,
            to: variant,
            templateName: template_name,
            language: templateLanguage,
            params: recipient.params ?? [],
          })
          sentMessageId = result.messageId
          lastError = null
          break
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : 'Unknown error'
          // "Account not registered" (#133010) is a sender-side config
          // issue — retrying with phone variants won't help. Break
          // immediately with a clear message.
          if (isRecipientNotRegisteredError(errorMessage)) {
            lastError = errorMessage
            break
          }
          if (!isRecipientNotAllowedError(errorMessage)) {
            lastError = errorMessage
            break
          }
          lastError = errorMessage
          // retry with next variant
        }
      }

      if (sentMessageId) {
        if (recipient.contact_id) {
          try {
            const renderedText = await renderTemplatePreview({
              userId,
              templateName: template_name,
              language: templateLanguage,
              params: recipient.params ?? [],
            })

            await recordOutboundTemplateMessage({
              userId,
              contactId: recipient.contact_id,
              senderId: userId,
              templateName: template_name,
              renderedText,
              whatsappMessageId: sentMessageId,
            })
          } catch (error) {
            console.error(
              `Sent broadcast to ${recipient.phone}, but failed to mirror it into inbox:`,
              error
            )
          }
        }

        if (writableBroadcastId && recipient.contact_id) {
          await prisma.waBroadcastRecipient.updateMany({
            where: {
              broadcast_id: writableBroadcastId,
              contact_id: recipient.contact_id,
            },
            data: {
              status: 'sent',
              whatsapp_message_id: sentMessageId,
              error_message: null,
              sent_at: new Date(),
            },
          })
          touchedBroadcastRecipients = true
        }

        results.push({
          phone: recipient.phone,
          status: 'sent',
          whatsapp_message_id: sentMessageId,
        })
        sentCount++
      } else {
        const friendlyError = humanReadableMetaError(lastError || 'Unknown error')
        console.error(
          `Failed to send broadcast to ${recipient.phone}:`,
          lastError
        )
        results.push({
          phone: recipient.phone,
          status: 'failed',
          error: friendlyError,
        })
        if (writableBroadcastId && recipient.contact_id) {
          await prisma.waBroadcastRecipient.updateMany({
            where: {
              broadcast_id: writableBroadcastId,
              contact_id: recipient.contact_id,
            },
            data: {
              status: 'failed',
              error_message: friendlyError,
            },
          })
          touchedBroadcastRecipients = true
        }
        failedCount++
      }
    }

    if (writableBroadcastId && touchedBroadcastRecipients) {
      await recalculateBroadcastStats(writableBroadcastId)
    }

    return NextResponse.json({
      success: true,
      total: recipients.length,
      sent: sentCount,
      failed: failedCount,
      results,
    })
  } catch (error) {
    console.error('Error in WhatsApp broadcast POST:', error)
    return NextResponse.json(
      { error: 'Failed to process broadcast' },
      { status: 500 }
    )
  }
}
