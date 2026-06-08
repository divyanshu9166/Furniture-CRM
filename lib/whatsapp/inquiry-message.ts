/**
 * lib/whatsapp/inquiry-message.ts
 *
 * Sends the automated 3-button inquiry welcome message to a new WhatsApp contact.
 *
 * Triggered when:
 *   - A new contact sends their FIRST WhatsApp message
 *
 * The message uses WhatsApp interactive buttons (works within 24-hour window).
 * The customer's own first message opens the window, so this reply is always valid.
 *
 * Buttons:
 *   1. 📦 Product Details   → id: "INFO_PRODUCTS"
 *   2. 📍 Company Address   → id: "INFO_ADDRESS"
 *   3. 📅 Schedule Visit    → id: "SCHEDULE_APPOINTMENT"
 */

import { prisma } from '@/lib/db'
import { decrypt } from '@/lib/whatsapp/encryption'
import { sendInteractiveButtonMessage, sendTextMessage } from '@/lib/whatsapp/meta-api'

interface InquirySendOptions {
  userId: string
  contactPhone: string
  contactName: string
  conversationId: string
  /** Meta message ID of the incoming message — used for DB logging */
  incomingMessageId: string
}

/**
 * Send the 3-button inquiry welcome message via WhatsApp.
 * Silently swallows errors — a failed welcome must never break the main flow.
 */
export async function sendInquiryWelcomeMessage(opts: InquirySendOptions): Promise<void> {
  const { userId, contactPhone, contactName, conversationId, incomingMessageId } = opts

  try {
    const waConfig = await prisma.waWhatsappConfig.findUnique({
      where: { user_id: userId },
    })
    if (!waConfig) return

    const accessToken = decrypt(waConfig.access_token)
    const phoneNumberId = waConfig.phone_number_id

    const firstName = contactName?.split(' ')[0] || 'Aap'

    const bodyText =
      `Namaste *${firstName}* ji! 🙏\n\n` +
      `Kosmic Furniture mein aapka swagat hai! Hum institutional furniture ke specialist hain — ` +
      `office, school, hospital aur custom furniture.\n\n` +
      `Aap kya jaanna chahenge?`

    let metaMessageId: string | undefined

    try {
      // Try sending interactive buttons (works in 24h window — customer just messaged us)
      const result = await sendInteractiveButtonMessage({
        phoneNumberId,
        accessToken,
        to: contactPhone,
        headerText: '🪑 Kosmic Furniture',
        bodyText,
        footerText: 'Mon–Sat | 10 AM – 6 PM | Nalanda, Bihar',
        buttons: [
          { id: 'INFO_PRODUCTS', title: '📦 Product Details' },
          { id: 'INFO_ADDRESS', title: '📍 Company Address' },
          { id: 'SCHEDULE_APPOINTMENT', title: '📅 Schedule Visit' },
        ],
      })
      metaMessageId = result.messageId
    } catch (interactiveErr) {
      console.warn('[inquiry-message] Interactive message failed, falling back to text:', interactiveErr)
      // Fallback to plain text if interactive fails
      const fallbackText =
        `Namaste *${firstName}* ji! 🙏 Kosmic Furniture mein aapka swagat hai!\n\n` +
        `Aap yeh likh ke jaankari le sakte hain:\n` +
        `• *products* — hamare furniture ke baare mein\n` +
        `• *address* — showroom ka pata\n` +
        `• *appointment* — showroom visit schedule karna`
      const result = await sendTextMessage({
        phoneNumberId,
        accessToken,
        to: contactPhone,
        text: fallbackText,
      })
      metaMessageId = result.messageId
    }

    if (!metaMessageId) return

    // Save welcome message to DB
    await prisma.waMessage.create({
      data: {
        conversation_id: conversationId,
        sender_type: 'agent',
        content_type: 'text',
        content_text: bodyText,
        message_id: metaMessageId,
        status: 'sent',
      },
    })

    await prisma.waConversation.update({
      where: { id: conversationId },
      data: {
        last_message_text: bodyText,
        last_message_at: new Date(),
      },
    })

    console.log(`[inquiry-message] Welcome message sent to ${contactPhone} (conv: ${conversationId})`)
  } catch (err) {
    // Non-critical — log and move on
    console.error('[inquiry-message] Failed to send welcome message:', err)
  }
}

/**
 * Handle "INFO_PRODUCTS" button click — send product details text.
 */
export async function sendProductInfoMessage(
  userId: string,
  contactPhone: string,
  conversationId: string,
): Promise<void> {
  try {
    const waConfig = await prisma.waWhatsappConfig.findUnique({ where: { user_id: userId } })
    if (!waConfig) return

    const accessToken = decrypt(waConfig.access_token)
    const text =
      `🪑 *Kosmic Furniture — Products*\n\n` +
      `Hum in products ke specialist hain:\n\n` +
      `🏢 *Office Furniture*\n` +
      `  • Office chairs, workstations, conference tables\n\n` +
      `🏫 *School Furniture*\n` +
      `  • Desks, benches, lab furniture\n\n` +
      `🏥 *Hospital Furniture*\n` +
      `  • Beds, trolleys, waiting chairs\n\n` +
      `🏗️ *Custom Institutional*\n` +
      `  • Bulk orders, custom design, pan-India delivery\n\n` +
      `Quote ya details ke liye humse baat karein:\n📞 +91 7004642914`

    const result = await sendTextMessage({
      phoneNumberId: waConfig.phone_number_id,
      accessToken,
      to: contactPhone,
      text,
    })

    await prisma.waMessage.create({
      data: {
        conversation_id: conversationId,
        sender_type: 'agent',
        content_type: 'text',
        content_text: text,
        message_id: result.messageId,
        status: 'sent',
      },
    })
    await prisma.waConversation.update({
      where: { id: conversationId },
      data: { last_message_text: text, last_message_at: new Date() },
    })
  } catch (err) {
    console.error('[inquiry-message] sendProductInfoMessage failed:', err)
  }
}

/**
 * Handle "INFO_ADDRESS" button click — send address/location info.
 */
export async function sendAddressMessage(
  userId: string,
  contactPhone: string,
  conversationId: string,
): Promise<void> {
  try {
    const waConfig = await prisma.waWhatsappConfig.findUnique({ where: { user_id: userId } })
    if (!waConfig) return

    const accessToken = decrypt(waConfig.access_token)
    const text =
      `📍 *Kosmic Furniture — Showroom Address*\n\n` +
      `Kosmic Furniture\n` +
      `Nalanda, Bihar\n\n` +
      `📞 *Phone:* +91 7004642914 | +91 9199987067\n` +
      `📧 *Email:* info@kosmicfurniture.com\n` +
      `🌐 *Website:* kosmicfurniture.com\n\n` +
      `⏰ *Timings:* Monday – Saturday | 10 AM – 6 PM\n\n` +
      `Showroom visit schedule karne ke liye *appointment* likhein!`

    const result = await sendTextMessage({
      phoneNumberId: waConfig.phone_number_id,
      accessToken,
      to: contactPhone,
      text,
    })

    await prisma.waMessage.create({
      data: {
        conversation_id: conversationId,
        sender_type: 'agent',
        content_type: 'text',
        content_text: text,
        message_id: result.messageId,
        status: 'sent',
      },
    })
    await prisma.waConversation.update({
      where: { id: conversationId },
      data: { last_message_text: text, last_message_at: new Date() },
    })
  } catch (err) {
    console.error('[inquiry-message] sendAddressMessage failed:', err)
  }
}
