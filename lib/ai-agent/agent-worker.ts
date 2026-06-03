/**
 * lib/ai-agent/agent-worker.ts
 *
 * Core AI agent logic — runs inside a BullMQ worker.
 *
 * 10-step pipeline per inbound message:
 *   1.  Load agent config — abort if disabled
 *   2.  Load last 5 messages for conversation context
 *   3.  Redis cache check — return cached reply if hit
 *   4.  Embed customer message with Gemini text-embedding-004
 *   5.  pgvector cosine search → top-3 knowledge chunks
 *   6.  Build prompt (system + knowledge + history + message)
 *   7.  Gemini 2.0 Flash → draft reply
 *   8.  Confidence/handoff check
 *   9.  Cache reply in Redis (TTL: 2h)
 *  10.  Send reply via WhatsApp Cloud API + save to DB
 */

import { prisma } from '@/lib/db'
import { redis } from '@/lib/redis'
import { decrypt } from '@/lib/whatsapp/encryption'
import { sendTextMessage } from '@/lib/whatsapp/meta-api'
import { embedText } from './embedder'
import { retrieveChunks } from './retriever'
import { generateResponse } from './responder'

// ── Types ──────────────────────────────────────────────────────────────────

export interface AiAgentJobPayload {
  userId: string
  conversationId: string
  contactId: string
  contactPhone: string   // E.164 format, e.g. "919876543210"
  messageText: string
  incomingMessageId: string  // Meta's message_id (for reply context)
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
  } = payload

  // ── Step 1: Load agent config ────────────────────────────────────────────
  const config = await prisma.waAgentConfig.findUnique({ where: { user_id: userId } })
  if (!config?.enabled) {
    console.log(`[ai-agent] agent disabled for user ${userId} — skipping`)
    return
  }

  // ── Step 1b: Skip if conversation needs a human agent ───────────────────
  const conversation = await prisma.waConversation.findUnique({
    where: { id: conversationId },
    select: { needs_human: true },
  })
  if (conversation?.needs_human) {
    console.log(`[ai-agent] conversation ${conversationId} flagged for human — skipping AI reply`)
    return
  }

  // ── Step 2: Load last 5 messages for conversation context ────────────────
  const recentMessages = await prisma.waMessage.findMany({
    where: { conversation_id: conversationId },
    orderBy: { created_at: 'desc' },
    take: 5,
    select: { sender_type: true, content_text: true },
  })
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
    })
    return
  }

  // ── Step 4: Embed customer message ───────────────────────────────────────
  let queryEmbedding: number[]
  try {
    queryEmbedding = await embedText(messageText)
  } catch (err) {
    console.error('[ai-agent] embedding failed:', err)
    await sendFallback(userId, conversationId, contactPhone, config.fallback_message, incomingMessageId)
    return
  }

  // ── Step 5: Retrieve top-3 relevant chunks ───────────────────────────────
  const chunks = await retrieveChunks(userId, queryEmbedding, 3, config.confidence_threshold)
  const retrievedChunks = chunks.map((c) => c.content).join('\n\n---\n\n')

  // ── Step 6–7: Build prompt + call Gemini ─────────────────────────────────
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
    console.error('[ai-agent] Gemini call failed:', err)
    await sendFallback(userId, conversationId, contactPhone, config.fallback_message, incomingMessageId)
    return
  }

  // ── Step 8: Confidence / handoff check ───────────────────────────────────
  if (!agentResponse.confidenceOk || agentResponse.needsHandoff) {
    console.log(`[ai-agent] low confidence or handoff needed — sending fallback`)
    // Flag for human review — keep status 'open' so the inbox still shows it,
    // but set needs_human=true so the AI agent skips future messages.
    await prisma.$executeRawUnsafe(
      `UPDATE conversations SET needs_human = TRUE WHERE id = $1`,
      conversationId,
    ).catch(() => {/* non-critical */})
    await sendFallback(userId, conversationId, contactPhone, config.fallback_message, incomingMessageId)
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
}) {
  const { userId, conversationId, contactPhone, replyText, incomingMessageId } = opts

  let waConfig: { phoneNumberId: string; accessToken: string }
  try {
    waConfig = await getWaConfig(userId)
  } catch (err) {
    console.error('[ai-agent] cannot load WA config:', err)
    return
  }

  let metaMessageId: string | undefined
  try {
    const result = await sendTextMessage({
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

  // Persist the AI reply as an outbound message
  try {
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
) {
  await sendAndSaveReply({
    userId, conversationId, contactPhone,
    replyText: fallbackMessage,
    incomingMessageId,
    isFromCache: false,
  })
}

// ── Knowledge indexer (called from the knowledge API route) ───────────────

/**
 * Index a newly uploaded knowledge document:
 *   1. Chunk the raw text
 *   2. Embed each chunk with Gemini
 *   3. Insert chunks + update embeddings via raw SQL
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
