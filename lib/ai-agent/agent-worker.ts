/**
 * lib/ai-agent/agent-worker.ts
 *
 * Core AI agent logic — runs inside a BullMQ worker.
 *
 * 10-step pipeline per inbound message:
 *   1.  Load agent config — abort if disabled
 *   2.  Load last 5 messages for conversation context
 *   3.  Redis cache check — return cached reply if hit
 *   4.  Embed customer message with multilingual-e5-small (local ONNX)
 *   5.  pgvector cosine search → top-3 knowledge chunks
 *   6.  Build prompt (system + knowledge + history + message)
 *   7.  Groq Llama → draft reply
 *   8.  Confidence/handoff check
 *   9.  Cache reply in Redis (TTL: 2h)
 *  10.  Send reply via WhatsApp Cloud API + save to DB
 */

import { prisma } from '@/lib/db'
import { redis } from '@/lib/redis'
import { decrypt } from '@/lib/whatsapp/encryption'
import { sendTextMessage as sendWhatsAppMessage } from '@/lib/whatsapp/meta-api'
import { sendTextMessage as sendSocialMessage, setTypingOn } from '@/lib/social/messenger-api'
import { embedText } from './embedder'
import { retrieveChunks } from './retriever'
import { generateResponse } from './responder'

// ── Types ──────────────────────────────────────────────────────────────────

export interface AiAgentJobPayload {
  userId: string
  conversationId: string
  contactId: string
  contactPhone: string   // E.164 for WA; PSID/IGSID for social channels
  messageText: string
  incomingMessageId: string  // Meta message ID (for reply context)
  // Social channel routing (optional)
  channel?: 'whatsapp' | 'facebook' | 'instagram'
  socialPageAccessToken?: string // encrypted Page Access Token
  socialRecipientId?: string     // PSID or IGSID
}

// ── Cache helpers ──────────────────────────────────────────────────────────

const CACHE_TTL_SEC = 2 * 60 * 60  // 2 hours

function cacheKey(userId: string, text: string): string {
  // Normalise: lowercase + strip extra whitespace so "Hi!" and "hi!" share cache
  const normalised = text.toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 200)
  return `wa:agent:cache:${userId}:${Buffer.from(normalised).toString('base64url').slice(0, 64)}`
}

async function getCachedReply(userId: string, text: string): Promise<string | null> {
  try {
    return await redis.get(cacheKey(userId, text))
  } catch {
    return null
  }
}

async function setCachedReply(userId: string, text: string, reply: string): Promise<void> {
  try {
    await redis.set(cacheKey(userId, text), reply, 'EX', CACHE_TTL_SEC)
  } catch {
    // non-critical
  }
}

// ── Main processor ─────────────────────────────────────────────────────────

export async function processAiAgentJob(payload: AiAgentJobPayload): Promise<void> {
  const {
    userId, conversationId, contactId, contactPhone,
    messageText, incomingMessageId,
    channel = 'whatsapp',
    socialPageAccessToken,
    socialRecipientId,
  } = payload

  // ── Step 1: Load agent config ────────────────────────────────────────────
  const config = await prisma.waAgentConfig.findUnique({ where: { user_id: userId } })
  if (!config?.enabled) {
    console.log(`[ai-agent] agent disabled for user ${userId} — skipping`)
    return
  }

  const isSocialChannel = channel === 'facebook' || channel === 'instagram'

  // ── Step 1b: Skip if conversation needs a human agent ───────────────────
  let needsHuman = false
  if (isSocialChannel) {
    const conv = await prisma.socialConversation.findUnique({
      where: { id: conversationId },
      select: { needs_human: true },
    })
    needsHuman = conv?.needs_human ?? false
  } else {
    const conv = await prisma.waConversation.findUnique({
      where: { id: conversationId },
      select: { needs_human: true },
    })
    needsHuman = conv?.needs_human ?? false
  }
  if (needsHuman) {
    console.log(`[ai-agent] conversation ${conversationId} flagged for human — skipping AI reply`)
    return
  }

  // ── Step 2: Load last 5 messages for conversation context ────────────────
  let recentMessages: { sender_type: string; content_text: string | null }[] = []
  if (isSocialChannel) {
    recentMessages = await prisma.socialMessage.findMany({
      where: { conversation_id: conversationId },
      orderBy: { created_at: 'desc' },
      take: 5,
      select: { sender_type: true, content_text: true },
    })
  } else {
    recentMessages = await prisma.waMessage.findMany({
      where: { conversation_id: conversationId },
      orderBy: { created_at: 'desc' },
      take: 5,
      select: { sender_type: true, content_text: true },
    })
  }
  const conversationHistory = recentMessages
    .reverse()
    .map((m) => `${m.sender_type === 'customer' ? 'Customer' : 'Agent'}: ${m.content_text ?? ''}`)
    .join('\n')


  // ── Step 3: Redis cache check ────────────────────────────────────────────
  const cached = await getCachedReply(userId, messageText)
  if (cached) {
    console.log(`[ai-agent] cache hit for user ${userId}`)
    await sendAndSaveReply({
      userId, conversationId, contactPhone, replyText: cached,
      incomingMessageId, isFromCache: true,
      channel, socialPageAccessToken, socialRecipientId,
    })
    return
  }

  // ── Step 4: Embed customer message ───────────────────────────────────────
  let queryEmbedding: number[]
  try {
    queryEmbedding = await embedText(messageText)
  } catch (err) {
    console.error('[ai-agent] embedding failed:', err)
    await sendFallback(userId, conversationId, contactPhone, config.fallback_message, incomingMessageId, channel, socialPageAccessToken, socialRecipientId)
    return
  }

  // ── Step 5: Retrieve top-3 relevant chunks ───────────────────────────────
  const chunks = await retrieveChunks(userId, queryEmbedding, 3, config.confidence_threshold)
  const retrievedChunks = chunks.map((c) => c.content).join('\n\n---\n\n')

  // ── Step 6–7: Build prompt + call Groq Llama ────────────────────────────
  let agentResponse: Awaited<ReturnType<typeof generateResponse>>
  try {
    agentResponse = await generateResponse({
      agentName: config.agent_name,
      companyName: config.agent_name, // falls back to agent name; editable in system prompt
      companyContext: '',              // embedded in system_prompt if overridden
      retrievedChunks,
      conversationHistory,
      customerMessage: messageText,
      maxTokens: config.max_response_tokens,
    })
  } catch (err) {
    console.error('[ai-agent] LLM call failed:', err)
    await sendFallback(userId, conversationId, contactPhone, config.fallback_message, incomingMessageId, channel, socialPageAccessToken, socialRecipientId)
    return
  }

  // ── Step 8: Handoff check ─────────────────────────────────────────────────
  if (agentResponse.needsHandoff) {
    console.log(`[ai-agent] handoff requested — flagging for human`)
    // Flag for human review
    if (channel === 'facebook' || channel === 'instagram') {
      await prisma.socialConversation.update({
        where: { id: conversationId },
        data: { needs_human: true },
      }).catch((err) => console.warn('[ai-agent] failed to set needs_human flag:', err))
    } else {
      await prisma.waConversation.update({
        where: { id: conversationId },
        data: { needs_human: true },
      }).catch((err) => console.warn('[ai-agent] failed to set needs_human flag:', err))
    }
    await sendFallback(userId, conversationId, contactPhone, config.fallback_message, incomingMessageId, channel, socialPageAccessToken, socialRecipientId)
    return
  }

  const replyText = agentResponse.text

  // ── Step 9: Cache reply ───────────────────────────────────────────────────
  await setCachedReply(userId, messageText, replyText)

  // ── Step 10: Optional delay + send + save ────────────────────────────────
  if (config.response_delay_ms > 0) {
    await new Promise((r) => setTimeout(r, config.response_delay_ms))
  }
  await sendAndSaveReply({
    userId, conversationId, contactPhone, replyText,
    incomingMessageId, isFromCache: false,
    channel, socialPageAccessToken, socialRecipientId,
  })
}

// ── Helpers ────────────────────────────────────────────────────────────────

async function getWaConfig(userId: string) {
  const waConfig = await prisma.waWhatsappConfig.findUnique({ where: { user_id: userId } })
  if (!waConfig) throw new Error(`No WA config for user ${userId}`)
  return {
    phoneNumberId: waConfig.phone_number_id,
    accessToken: decrypt(waConfig.access_token),
  }
}

async function sendAndSaveReply(opts: {
  userId: string
  conversationId: string
  contactPhone: string
  replyText: string
  incomingMessageId: string
  isFromCache: boolean
  channel?: string
  socialPageAccessToken?: string
  socialRecipientId?: string
}) {
  const {
    userId, conversationId, contactPhone, replyText,
    incomingMessageId, channel = 'whatsapp',
    socialPageAccessToken, socialRecipientId,
  } = opts

  let metaMessageId: string | undefined

  if (channel === 'facebook' || channel === 'instagram') {
    // ── Social channel send (Messenger API) ─────────────────────────────────
    if (!socialPageAccessToken || !socialRecipientId) {
      console.error('[ai-agent] Missing social channel credentials — cannot send reply')
      return
    }
    const decryptedToken = decrypt(socialPageAccessToken)
    // Show typing indicator before replying
    setTypingOn({ recipientId: socialRecipientId, pageAccessToken: decryptedToken }).catch(() => null)
    try {
      const result = await sendSocialMessage({
        recipientId: socialRecipientId,
        pageAccessToken: decryptedToken,
        text: replyText,
      })
      metaMessageId = result.messageId
    } catch (err) {
      console.error('[ai-agent] Messenger sendTextMessage failed:', err)
      return
    }
  } else {
    // ── WhatsApp send ──────────────────────────────────────────────────────
    let waConfig: { phoneNumberId: string; accessToken: string }
    try {
      waConfig = await getWaConfig(userId)
    } catch (err) {
      console.error('[ai-agent] cannot load WA config:', err)
      return
    }
    try {
      const result = await sendWhatsAppMessage({
        phoneNumberId: waConfig.phoneNumberId,
        accessToken: waConfig.accessToken,
        to: contactPhone,
        text: replyText,
        contextMessageId: incomingMessageId,
      })
      metaMessageId = result.messageId
    } catch (err) {
      console.error('[ai-agent] sendTextMessage failed:', err)
      return
    }
  }

  // Persist the AI reply — choose the right DB table
  try {
    if (channel === 'facebook' || channel === 'instagram') {
      await prisma.socialMessage.create({
        data: {
          conversation_id: conversationId,
          platform_msg_id: metaMessageId,
          sender_type: 'agent',
          content_type: 'text',
          content_text: replyText,
          status: 'sent',
        },
      })
      await prisma.socialConversation.update({
        where: { id: conversationId },
        data: {
          last_message_text: replyText,
          last_message_at: new Date(),
        },
      })
    } else {
      await prisma.waMessage.create({
        data: {
          conversation_id: conversationId,
          sender_type: 'agent',
          content_type: 'text',
          content_text: replyText,
          message_id: metaMessageId,
          status: 'sent',
        },
      })
      await prisma.waConversation.update({
        where: { id: conversationId },
        data: {
          last_message_text: replyText,
          last_message_at: new Date(),
        },
      })
    }
  } catch (err) {
    console.error('[ai-agent] DB save failed:', err)
  }

  console.log(`[ai-agent] replied to conversation ${conversationId}`)
}

async function sendFallback(
  userId: string,
  conversationId: string,
  contactPhone: string,
  fallbackMessage: string,
  incomingMessageId: string,
  channel?: string,
  socialPageAccessToken?: string,
  socialRecipientId?: string,
) {
  await sendAndSaveReply({
    userId, conversationId, contactPhone,
    replyText: fallbackMessage,
    incomingMessageId,
    isFromCache: false,
    channel,
    socialPageAccessToken,
    socialRecipientId,
  })
}

// ── Knowledge indexer (called from the knowledge API route) ───────────────

/**
 * Index a newly uploaded knowledge document:
 *   1. Chunk the raw text
 *   2. Embed each chunk with multilingual-e5-small (local ONNX)
 *   3. Insert chunks + update embeddings via raw SQL (384-dim vectors)
 *   4. Mark the doc as indexed
 */
export async function indexKnowledgeDoc(docId: string): Promise<void> {
  const doc = await prisma.waKnowledgeDoc.findUnique({ where: { id: docId } })
  if (!doc) throw new Error(`Doc ${docId} not found`)

  await prisma.waKnowledgeDoc.update({
    where: { id: docId },
    data: { status: 'pending' },
  })

  try {
    const { chunkText } = await import('./chunker')
    const { embedDocument } = await import('./embedder')

    const chunks = chunkText(doc.raw_text)

    // Delete old chunks if re-indexing
    await prisma.waKnowledgeChunk.deleteMany({ where: { doc_id: docId } })

    for (let i = 0; i < chunks.length; i++) {
      const content = chunks[i]

      // Create the chunk row first (without embedding)
      const chunk = await prisma.waKnowledgeChunk.create({
        data: {
          user_id: doc.user_id,
          doc_id: docId,
          chunk_index: i,
          content,
        },
      })

      // Embed and update via raw SQL (pgvector column not in Prisma schema).
      // MUST use $executeRawUnsafe — parameterized bindings cannot be cast
      // to the vector type by the pg driver; the literal must be inline.
      const embedding = await embedDocument(content)
      const vectorLiteral = `[${embedding.join(',')}]`

      await prisma.$executeRawUnsafe(
        `UPDATE wa_knowledge_chunks SET embedding = $1::vector WHERE id = $2`,
        vectorLiteral,
        chunk.id,
      )
    }

    await prisma.waKnowledgeDoc.update({
      where: { id: docId },
      data: { status: 'indexed', error: null },
    })

    console.log(`[ai-agent] indexed doc ${docId} — ${chunks.length} chunks`)
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    await prisma.waKnowledgeDoc.update({
      where: { id: docId },
      data: { status: 'error', error },
    })
    throw err
  }
}
