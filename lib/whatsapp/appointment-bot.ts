/**
 * lib/whatsapp/appointment-bot.ts
 *
 * WhatsApp Appointment Booking Chatbot — Redis-backed state machine.
 *
 * Flow:
 *   IDLE
 *     → (customer clicks "Schedule Appointment" button)
 *   COLLECTING_DATE
 *     → (customer sends a date like "kal", "tomorrow", "10 june", "2026-06-10")
 *   COLLECTING_TIME
 *     → (customer picks a time from offered slots)
 *   CONFIRMING
 *     → (customer says "yes" / "haan" to confirm)
 *   DONE  (terminal — state is cleared)
 *
 * State is stored in Redis with a 30-minute TTL. If the customer goes
 * silent for 30 minutes the session expires gracefully.
 *
 * Called from: app/api/whatsapp/webhook/route.ts → processMessage()
 */

import { redis } from '@/lib/redis'
import { prisma } from '@/lib/db'
import {
  sendTextMessage,
  sendInteractiveButtonMessage,
} from '@/lib/whatsapp/meta-api'

// ── Constants ────────────────────────────────────────────────────────────────

const STATE_TTL_SECONDS = 30 * 60 // 30 minutes

/** Fixed showroom time slots offered to the customer */
const AVAILABLE_SLOTS = [
  '10:00 AM',
  '11:00 AM',
  '12:00 PM',
  '2:00 PM',
  '3:00 PM',
  '4:00 PM',
  '5:00 PM',
]

// ── Types ────────────────────────────────────────────────────────────────────

type BotStep =
  | 'COLLECTING_DATE'
  | 'COLLECTING_TIME'
  | 'CONFIRMING'

interface BotState {
  step: BotStep
  /** ISO date string e.g. "2026-06-10" */
  date?: string
  /** Human-readable time e.g. "11:00 AM" */
  time?: string
  /** Contact's display name */
  contactName: string
  /** Contact's phone number (E.164) */
  contactPhone: string
  /** WA contact id */
  contactId: string
  /** WA conversation id — for saving the bot's reply message to DB */
  conversationId: string
  /** userId (CRM owner) — for WA config lookup */
  userId: string
}

interface WaConfig {
  phoneNumberId: string
  accessToken: string
}

// ── Redis helpers ─────────────────────────────────────────────────────────────

function stateKey(conversationId: string): string {
  return `wa:appt-bot:${conversationId}`
}

export async function getBotState(conversationId: string): Promise<BotState | null> {
  try {
    const raw = await redis.get(stateKey(conversationId))
    if (!raw) return null
    return JSON.parse(raw) as BotState
  } catch {
    return null
  }
}

async function setBotState(state: BotState): Promise<void> {
  try {
    await redis.set(stateKey(state.conversationId), JSON.stringify(state), 'EX', STATE_TTL_SECONDS)
  } catch {
    // non-critical
  }
}

export async function clearBotState(conversationId: string): Promise<void> {
  try {
    await redis.del(stateKey(conversationId))
  } catch {
    // non-critical
  }
}

// ── Date parsing ──────────────────────────────────────────────────────────────

/**
 * Parse natural language date input (Hindi + English) into a YYYY-MM-DD string.
 * Returns null if the input is unrecognizable.
 */
function parseDate(input: string): string | null {
  const text = input.trim().toLowerCase()
  const now = new Date()

  // Relative dates
  if (/\b(aaj|today|abhi)\b/i.test(text)) {
    return toDateStr(now)
  }
  if (/\b(kal|tomorrow|kal ko|kl)\b/i.test(text)) {
    const d = new Date(now)
    d.setDate(d.getDate() + 1)
    return toDateStr(d)
  }
  if (/\b(parso|day after tomorrow|2 din baad)\b/i.test(text)) {
    const d = new Date(now)
    d.setDate(d.getDate() + 2)
    return toDateStr(d)
  }

  // ISO format: 2026-06-10
  const iso = text.match(/(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (iso) {
    const d = new Date(`${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`)
    if (!isNaN(d.getTime())) return toDateStr(d)
  }

  // "10 june" or "june 10" or "10/06" or "10-06"
  const months: Record<string, number> = {
    january: 0, jan: 0, february: 1, feb: 1, march: 2, mar: 2,
    april: 3, apr: 3, may: 4, june: 5, jun: 5, july: 6, jul: 6,
    august: 7, aug: 7, september: 8, sep: 8, october: 9, oct: 9,
    november: 10, nov: 10, december: 11, dec: 11,
  }
  const dayMonthMatch = text.match(/(\d{1,2})\s+(\w+)/)
  if (dayMonthMatch) {
    const day = parseInt(dayMonthMatch[1])
    const month = months[dayMonthMatch[2].toLowerCase()]
    if (month !== undefined && day >= 1 && day <= 31) {
      const year = now.getFullYear()
      const d = new Date(year, month, day)
      if (!isNaN(d.getTime())) return toDateStr(d)
    }
  }
  const monthDayMatch = text.match(/(\w+)\s+(\d{1,2})/)
  if (monthDayMatch) {
    const month = months[monthDayMatch[1].toLowerCase()]
    const day = parseInt(monthDayMatch[2])
    if (month !== undefined && day >= 1 && day <= 31) {
      const year = now.getFullYear()
      const d = new Date(year, month, day)
      if (!isNaN(d.getTime())) return toDateStr(d)
    }
  }
  // "10/06" or "10-06"
  const slashMatch = text.match(/^(\d{1,2})[\/\-](\d{1,2})$/)
  if (slashMatch) {
    const day = parseInt(slashMatch[1])
    const month = parseInt(slashMatch[2]) - 1
    const d = new Date(now.getFullYear(), month, day)
    if (!isNaN(d.getTime())) return toDateStr(d)
  }

  return null
}

function toDateStr(d: Date): string {
  return d.toISOString().split('T')[0]
}

/** Format YYYY-MM-DD → "Sunday, 10 June 2026" */
function formatDateHuman(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-IN', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })
}

// ── Time parsing ──────────────────────────────────────────────────────────────

/** Convert "HH:MM AM/PM" → minutes since midnight */
function timeToMinutes(t: string): number {
  const normalized = t.trim().toUpperCase()
  const match = normalized.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/)
  if (!match) return -1
  let hours = parseInt(match[1], 10)
  const minutes = parseInt(match[2], 10)
  const period = match[3]
  if (period === 'PM' && hours !== 12) hours += 12
  if (period === 'AM' && hours === 12) hours = 0
  return hours * 60 + minutes
}

/**
 * Match user input to one of the fixed slot strings.
 * Handles: "11", "11am", "11:00", "11 baje", "2 PM", "do baje", etc.
 */
function parseTimeToSlot(input: string): string | null {
  const text = input.trim().toLowerCase().replace(/\s+/g, ' ')

  // Direct slot match (case-insensitive)
  const directMatch = AVAILABLE_SLOTS.find(
    (slot) => slot.toLowerCase() === text || slot.toLowerCase().replace(':00', '') === text,
  )
  if (directMatch) return directMatch

  // Numeric hour extraction: "11", "11am", "11 baje", "2pm"
  const hourMatch = text.match(/(\d{1,2})\s*(?:am|pm|baje|o'?clock)?/)
  if (hourMatch) {
    const hour = parseInt(hourMatch[1])
    const isPM = text.includes('pm') || (hour !== 12 && hour < 8)  // 2→2PM, 11→11AM heuristic
    const adjusted = isPM && hour !== 12 ? hour + 12 : hour
    // Find closest slot
    const targetMins = adjusted * 60
    const closest = AVAILABLE_SLOTS.find((slot) => {
      const slotMins = timeToMinutes(slot)
      return Math.abs(slotMins - targetMins) < 30
    })
    if (closest) return closest
  }

  return null
}

// ── Slot availability check ───────────────────────────────────────────────────

async function isSlotAvailable(
  dateStr: string,
  timeStr: string,
): Promise<{ available: boolean; suggestions: string[] }> {
  try {
    const dayStart = new Date(dateStr)
    dayStart.setHours(0, 0, 0, 0)
    const dayEnd = new Date(dateStr)
    dayEnd.setHours(23, 59, 59, 999)

    const existing = await prisma.appointment.findMany({
      where: {
        date: { gte: dayStart, lte: dayEnd },
        status: { not: 'Cancelled' },
      },
      select: { time: true },
    })

    const requestedMins = timeToMinutes(timeStr)
    const conflict = existing.find(
      (a) => Math.abs(timeToMinutes(a.time) - requestedMins) < 60,
    )

    if (!conflict) return { available: true, suggestions: [] }

    const bookedMins = existing.map((a) => timeToMinutes(a.time))
    const suggestions = AVAILABLE_SLOTS.filter((slot) => {
      const slotMins = timeToMinutes(slot)
      return !bookedMins.some((bm) => Math.abs(bm - slotMins) < 60)
    }).slice(0, 4)

    return { available: false, suggestions }
  } catch {
    // If DB check fails, optimistically allow the booking
    return { available: true, suggestions: [] }
  }
}

// ── Messaging helpers ─────────────────────────────────────────────────────────

async function sendBotReply(
  text: string,
  state: BotState,
  waConfig: WaConfig,
): Promise<void> {
  try {
    const result = await sendTextMessage({
      phoneNumberId: waConfig.phoneNumberId,
      accessToken: waConfig.accessToken,
      to: state.contactPhone,
      text,
    })

    // Persist reply to DB
    await prisma.waMessage.create({
      data: {
        conversation_id: state.conversationId,
        sender_type: 'agent',
        content_type: 'text',
        content_text: text,
        message_id: result.messageId,
        status: 'sent',
      },
    })
    await prisma.waConversation.update({
      where: { id: state.conversationId },
      data: { last_message_text: text, last_message_at: new Date() },
    })
  } catch (err) {
    console.error('[appt-bot] sendBotReply failed:', err)
  }
}

async function sendSlotsAsButtons(
  state: BotState,
  waConfig: WaConfig,
  slots: string[],
  introText: string,
): Promise<void> {
  const displaySlots = slots.slice(0, 3)  // WhatsApp max 3 buttons

  if (displaySlots.length === 0) {
    await sendBotReply(
      'Maafi, is din koi slot available nahi hai. Kripya koi aur din choose karein.\n\nPlease share another date (e.g. kal, 15 june):',
      state,
      waConfig,
    )
    await setBotState({ ...state, step: 'COLLECTING_DATE' })
    return
  }

  try {
    const result = await sendInteractiveButtonMessage({
      phoneNumberId: waConfig.phoneNumberId,
      accessToken: waConfig.accessToken,
      to: state.contactPhone,
      headerText: '📅 Kosmic Furniture — Appointment',
      bodyText: introText,
      footerText: 'Showroom: 10 AM – 5 PM, Mon–Sat',
      buttons: displaySlots.map((slot) => ({ id: `SLOT_${slot}`, title: slot })),
    })

    await prisma.waMessage.create({
      data: {
        conversation_id: state.conversationId,
        sender_type: 'agent',
        content_type: 'text',
        content_text: introText,
        message_id: result.messageId,
        status: 'sent',
      },
    })
    await prisma.waConversation.update({
      where: { id: state.conversationId },
      data: { last_message_text: introText, last_message_at: new Date() },
    })
  } catch {
    // Fallback to plain text if interactive fails (e.g. outside 24h window)
    const slotList = displaySlots.join(' | ')
    await sendBotReply(`${introText}\n\nAvailable slots: ${slotList}`, state, waConfig)
  }
}

// ── Main handler ──────────────────────────────────────────────────────────────

export interface AppointmentBotContext {
  conversationId: string
  contactId: string
  contactPhone: string
  contactName: string
  userId: string
  incomingText: string
  /** Set when the customer clicked a quick-reply button */
  buttonReplyId?: string
}

/**
 * Start a fresh appointment booking session.
 * Called when customer clicks the "Schedule Appointment" button.
 */
export async function startAppointmentBot(
  ctx: Omit<AppointmentBotContext, 'incomingText' | 'buttonReplyId'>,
  waConfig: WaConfig,
): Promise<void> {
  const state: BotState = {
    step: 'COLLECTING_DATE',
    contactName: ctx.contactName,
    contactPhone: ctx.contactPhone,
    contactId: ctx.contactId,
    conversationId: ctx.conversationId,
    userId: ctx.userId,
  }
  await setBotState(state)

  const greeting = `नमस्ते ${ctx.contactName.split(' ')[0]}! 😊\n\nKosmic Furniture showroom visit schedule karne ke liye kaun si *tarikh* aapko suit karegi?\n\nPlease date share karein (e.g. kal, 15 june, 2026-06-15):`
  await sendBotReply(greeting, state, waConfig)
}

/**
 * Handle an incoming message when an appointment bot session is active.
 * Returns true if the message was handled by the bot (skip AI agent).
 */
export async function handleAppointmentBotMessage(
  ctx: AppointmentBotContext,
  waConfig: WaConfig,
): Promise<boolean> {
  const state = await getBotState(ctx.conversationId)
  if (!state) return false

  const text = ctx.incomingText.trim()
  const buttonId = ctx.buttonReplyId

  // ── Handle cancellation at any step ─────────────────────────────────────
  if (/\b(cancel|band karo|nahi|no|nahin|reh do)\b/i.test(text)) {
    await clearBotState(ctx.conversationId)
    await sendBotReply(
      'Theek hai! Appointment cancel kar diya. Jab bhi chahein, hum se baat karein. 😊',
      state,
      waConfig,
    )
    return true
  }

  // ── Step: COLLECTING_DATE ────────────────────────────────────────────────
  if (state.step === 'COLLECTING_DATE') {
    const parsedDate = parseDate(text)
    if (!parsedDate) {
      await sendBotReply(
        'Kripya valid date share karein jaise:\n• *kal* (tomorrow)\n• *15 june*\n• *2026-06-15*',
        state,
        waConfig,
      )
      return true
    }

    // Reject past dates
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const chosen = new Date(parsedDate)
    if (chosen < today) {
      await sendBotReply(
        'Yeh date pehle ki hai. Kripya aaj ya aane wali koi tarikh choose karein:',
        state,
        waConfig,
      )
      return true
    }

    const updatedState: BotState = { ...state, step: 'COLLECTING_TIME', date: parsedDate }
    await setBotState(updatedState)

    const humanDate = formatDateHuman(parsedDate)
    await sendSlotsAsButtons(
      updatedState,
      waConfig,
      AVAILABLE_SLOTS,
      `*${humanDate}* — Aap niche diye slots mein se koi time choose karein:`,
    )
    return true
  }

  // ── Step: COLLECTING_TIME ────────────────────────────────────────────────
  if (state.step === 'COLLECTING_TIME') {
    let chosenSlot: string | null = null

    // Button click — id format: "SLOT_11:00 AM"
    if (buttonId?.startsWith('SLOT_')) {
      chosenSlot = buttonId.replace('SLOT_', '')
    } else {
      chosenSlot = parseTimeToSlot(text)
    }

    if (!chosenSlot) {
      await sendSlotsAsButtons(
        state,
        waConfig,
        AVAILABLE_SLOTS,
        'Kripya niche diye buttons se time choose karein ya likhein (e.g. "11 AM", "2 baje"):',
      )
      return true
    }

    if (!state.date) {
      // Edge case: date was lost — restart
      await setBotState({ ...state, step: 'COLLECTING_DATE' })
      await sendBotReply('Ek minute — date phir se share karein please:', state, waConfig)
      return true
    }

    // Check slot availability
    const { available, suggestions } = await isSlotAvailable(state.date, chosenSlot)

    if (!available) {
      const humanDate = formatDateHuman(state.date)
      const suggestionText = suggestions.length > 0
        ? `Yeh slots available hain ${humanDate} ko:`
        : `Is din koi slot available nahi hai. Kripya doosra din choose karein:`

      if (suggestions.length > 0) {
        await sendSlotsAsButtons(state, waConfig, suggestions, suggestionText)
      } else {
        await setBotState({ ...state, step: 'COLLECTING_DATE' })
        await sendBotReply(
          `❌ *${chosenSlot}* slot already booked hai ${humanDate} ke liye.\n\n${suggestionText}`,
          state,
          waConfig,
        )
      }
      return true
    }

    // Slot is free — ask for confirmation
    const updatedState: BotState = { ...state, step: 'CONFIRMING', time: chosenSlot }
    await setBotState(updatedState)

    const humanDate = formatDateHuman(state.date)
    const confirmMsg =
      `✅ Slot available hai!\n\n` +
      `📅 *Date:* ${humanDate}\n` +
      `⏰ *Time:* ${chosenSlot}\n` +
      `👤 *Name:* ${state.contactName}\n\n` +
      `Kya aap confirm karna chahenge? (*haan* / *yes* likhein ya *cancel* karein)`

    await sendBotReply(confirmMsg, updatedState, waConfig)
    return true
  }

  // ── Step: CONFIRMING ─────────────────────────────────────────────────────
  if (state.step === 'CONFIRMING') {
    const isConfirmed = /\b(haan|ha|yes|yep|ok|okay|confirm|bilkul|zaroor|sure)\b/i.test(text)

    if (!isConfirmed) {
      await sendBotReply(
        'Appointment confirm karne ke liye *haan* ya *yes* likhein, ya *cancel* karein.',
        state,
        waConfig,
      )
      return true
    }

    if (!state.date || !state.time) {
      await clearBotState(ctx.conversationId)
      await sendBotReply(
        'Kuch technical gadbad ho gayi. Kripya dobara try karein. Maafi maangte hain! 🙏',
        state,
        waConfig,
      )
      return true
    }

    // Ensure CRM global Contact exists
    let crmContact = await prisma.contact.findUnique({
      where: { phone: state.contactPhone },
    })
    if (!crmContact) {
      crmContact = await prisma.contact.create({
        data: {
          phone: state.contactPhone,
          name: state.contactName || state.contactPhone,
          source: 'WhatsApp Bot',
        },
      })
    }

    // Create the appointment in DB
    try {
      await prisma.appointment.create({
        data: {
          contactId: crmContact.id,
          date: new Date(state.date),
          time: state.time,
          purpose: 'Showroom Visit',
          notes: `Booked via WhatsApp chatbot by ${state.contactName} (${state.contactPhone})`,
          status: 'Scheduled',
        },
      })
    } catch (err) {
      console.error('[appt-bot] appointment creation failed:', err)
      await clearBotState(ctx.conversationId)
      await sendBotReply(
        '❌ Appointment save karne mein error aayi. Kripya hume call karein: +91 7004642914',
        state,
        waConfig,
      )
      return true
    }

    await clearBotState(ctx.conversationId)

    const humanDate = formatDateHuman(state.date)
    const confirmationMsg =
      `🎉 *Appointment Confirmed!*\n\n` +
      `📅 *Date:* ${humanDate}\n` +
      `⏰ *Time:* ${state.time}\n` +
      `📍 *Location:* Kosmic Furniture Showroom, Nalanda, Bihar\n` +
      `👤 *Name:* ${state.contactName}\n\n` +
      `Hum aapka intezaar karenge! Koi sawaal ho toh call karein:\n` +
      `📞 +91 7004642914 | +91 9199987067\n\n` +
      `_Please ek din pehle confirm zaroor karein._`

    await sendBotReply(confirmationMsg, state, waConfig)

    console.log(
      `[appt-bot] Appointment booked | contact=${state.contactId} | date=${state.date} | time=${state.time}`,
    )
    return true
  }

  return false
}
