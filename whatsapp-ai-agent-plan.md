# WhatsApp RAG AI Agent — Full Implementation Plan
### For Furzentic CRM · Optimised for your existing VPS stack

---

## 1. Architecture Overview

### Why this architecture is power-efficient
- **Zero new Docker containers.** Everything runs inside services you already have.
- **Zero local ML models.** All embeddings + LLM calls go to Google's servers. Your VPS CPU does nothing heavy.
- **pgvector inside your existing Postgres.** No Chroma, Pinecone, or Weaviate. One SQL command.
- **BullMQ queue you already have.** Agent jobs are just another queue — same Redis, same worker pattern.
- **Redis response cache.** Identical questions skip the AI call entirely.
- **Async by design.** Webhook returns 200 in <5ms. AI runs in background.

### Request flow

```
Customer WhatsApp message
         ↓
  Meta Webhook (existing route)
         ↓
  Is AI agent enabled for this user?  → NO  → existing flow
         ↓ YES
  Is conversation in human-handoff?   → YES → skip agent
         ↓ NO
  Push job to BullMQ "wa-ai-agent" queue
  (webhook returns 200 immediately)
         ↓
  ┌─────────────────────────────────────────────────┐
  │  AI Agent Worker (inside existing Next.js app)  │
  │                                                 │
  │  1. Load last 5 messages (conversation window)  │
  │  2. Redis cache check  → HIT? send cached reply │
  │  3. Embed message with Gemini text-embedding-004│
  │  4. pgvector cosine search → top 3 chunks       │
  │  5. Build prompt: system + context + history    │
  │  6. Gemini 2.0 Flash → draft reply              │
  │  7. Confidence check → low? flag for human      │
  │  8. Cache reply in Redis (TTL: 2h)              │
  │  9. Send reply via WhatsApp Cloud API            │
  │ 10. Save waMessage to DB                        │
  └─────────────────────────────────────────────────┘
```

### Services used

| Service | Already in your stack? | Change needed |
|---|---|---|
| PostgreSQL | YES | Add pgvector extension + 3 new tables |
| Redis | YES | New key prefix wa:agent:cache:* |
| BullMQ | YES | New queue wa-ai-agent |
| Gemini API | YES (key exists) | Use text-embedding-004 + gemini-2.0-flash |
| WhatsApp Cloud API | YES | No change |
| Next.js app | YES | New routes + worker |
| Docker | YES | Zero new containers |

---

## 2. Database Schema (3 new Prisma models)

Add to prisma/schema.prisma:

```prisma
model WaAgentConfig {
  id                   String   @id @default(cuid())
  user_id              String   @unique
  enabled              Boolean  @default(false)
  agent_name           String   @default("Assistant")
  system_prompt        String   @db.Text
  fallback_message     String   @default("Let me connect you with our team.")
  confidence_threshold Float    @default(0.45)
  max_response_tokens  Int      @default(300)
  response_delay_ms    Int      @default(1500)
  languages            String[] @default(["en", "hi"])
  created_at           DateTime @default(now())
  updated_at           DateTime @updatedAt
  user                 User     @relation(fields: [user_id], references: [id], onDelete: Cascade)
  @@map("wa_agent_configs")
}

model WaKnowledgeDoc {
  id          String   @id @default(cuid())
  user_id     String
  title       String
  source_type String   @default("text")
  raw_text    String   @db.Text
  char_count  Int
  status      String   @default("pending") // pending | indexed | error
  error       String?
  created_at  DateTime @default(now())
  updated_at  DateTime @updatedAt
  user        User              @relation(fields: [user_id], references: [id], onDelete: Cascade)
  chunks      WaKnowledgeChunk[]
  @@index([user_id])
  @@map("wa_knowledge_docs")
}

model WaKnowledgeChunk {
  id          String   @id @default(cuid())
  user_id     String
  doc_id      String
  chunk_index Int
  content     String   @db.Text
  // embedding column added via raw SQL — see section 3
  created_at  DateTime @default(now())
  user        User           @relation(fields: [user_id], references: [id], onDelete: Cascade)
  doc         WaKnowledgeDoc @relation(fields: [doc_id], references: [id], onDelete: Cascade)
  @@index([user_id])
  @@index([doc_id])
  @@map("wa_knowledge_chunks")
}
```

---

## 3. SQL Migration (run once in Supabase SQL editor)

```sql
CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE wa_knowledge_chunks
  ADD COLUMN IF NOT EXISTS embedding vector(768);

CREATE INDEX IF NOT EXISTS wa_knowledge_chunks_embedding_idx
  ON wa_knowledge_chunks
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

CREATE INDEX IF NOT EXISTS wa_knowledge_chunks_user_id_idx
  ON wa_knowledge_chunks (user_id);
```

---

## 4. New File Tree

```
lib/
  ai-agent/
    embedder.ts          <- Gemini text-embedding-004 wrapper
    retriever.ts         <- pgvector cosine search
    chunker.ts           <- text chunking (512-token window, 64 overlap)
    responder.ts         <- Gemini 2.0 Flash prompt + response
    agent-worker.ts      <- BullMQ worker (all 10 steps)
    system-prompt.ts     <- default system prompt template

app/api/whatsapp/
  agent/
    config/route.ts      <- GET/POST agent config
    knowledge/route.ts   <- GET list + POST upload document
    knowledge/[id]/
      route.ts           <- DELETE document

components/whatsapp/
  agent/
    agent-tab.tsx
    knowledge-base.tsx
    system-prompt-editor.tsx
```

---

## 5. lib/ai-agent/embedder.ts

```typescript
const EMBED_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent'

export async function embedText(text: string): Promise<number[]> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error('GEMINI_API_KEY not set')

  const res = await fetch(`${EMBED_URL}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'models/text-embedding-004',
      content: { parts: [{ text: text.slice(0, 2000) }] },
      taskType: 'RETRIEVAL_QUERY',
    }),
  })

  if (!res.ok) throw new Error(`Gemini embed error ${res.status}: ${await res.text()}`)
  const data = await res.json()
  return data.embedding.values as number[]
}

export async function embedDocument(text: string): Promise<number[]> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error('GEMINI_API_KEY not set')

  const res = await fetch(`${EMBED_URL}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'models/text-embedding-004',
      content: { parts: [{ text: text.slice(0, 2000) }] },
      taskType: 'RETRIEVAL_DOCUMENT',
    }),
  })

  if (!res.ok) throw new Error(`Gemini embed error ${res.status}: ${await res.text()}`)
  const data = await res.json()
  return data.embedding.values as number[]
}
```

---

## 6. lib/ai-agent/chunker.ts

```typescript
const TARGET_CHARS = 512 * 4   // ~512 tokens
const OVERLAP_CHARS = 64 * 4   // ~64 tokens overlap

export function chunkText(text: string): string[] {
  const clean = text.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
  if (clean.length <= TARGET_CHARS) return [clean]

  const paragraphs = clean.split(/\n\n+/)
  const chunks: string[] = []
  let current = ''

  for (const para of paragraphs) {
    if ((current + para).length <= TARGET_CHARS) {
      current += (current ? '\n\n' : '') + para
    } else {
      if (current) {
        chunks.push(current.trim())
        current = current.slice(-OVERLAP_CHARS) + '\n\n' + para
      } else {
        const sentences = para.match(/[^.!?\n]+[.!?\n]+/g) ?? [para]
        for (const s of sentences) {
          if ((current + s).length <= TARGET_CHARS) {
            current += s
          } else {
            if (current) chunks.push(current.trim())
            current = s
          }
        }
      }
    }
  }

  if (current.trim()) chunks.push(current.trim())
  return chunks.filter(c => c.length > 40)
}
```

---

## 7. lib/ai-agent/retriever.ts

```typescript
import { prisma } from '@/lib/db'

export interface RetrievedChunk {
  id: string
  content: string
  similarity: number
}

export async function retrieveChunks(
  userId: string,
  queryEmbedding: number[],
  topK = 3,
  minSimilarity = 0.4,
): Promise<RetrievedChunk[]> {
  const vectorLiteral = `[${queryEmbedding.join(',')}]`

  return prisma.$queryRaw<RetrievedChunk[]>`
    SELECT
      id,
      content,
      1 - (embedding <=> ${vectorLiteral}::vector) AS similarity
    FROM wa_knowledge_chunks
    WHERE
      user_id = ${userId}
      AND embedding IS NOT NULL
      AND 1 - (embedding <=> ${vectorLiteral}::vector) >= ${minSimilarity}
    ORDER BY embedding <=> ${vectorLiteral}::vector
    LIMIT ${topK}
  `
}
```

---

## 8. lib/ai-agent/system-prompt.ts

```typescript
export const DEFAULT_SYSTEM_PROMPT = `
You are {{AGENT_NAME}}, a helpful WhatsApp assistant for {{COMPANY_NAME}}.

COMPANY INFORMATION:
{{COMPANY_CONTEXT}}

YOUR RULES:
1. Answer ONLY based on the company information provided above.
2. If the answer is not in the provided information, say exactly:
   "I don't have that information right now. Let me connect you with our team."
   Do NOT make up prices, availability, or policies.
3. Keep replies SHORT — 2 to 4 sentences maximum. This is WhatsApp, not email.
4. Be warm, friendly, and professional.
5. If the customer wants to place an order, book a meeting, or needs a custom
   quote, say you will connect them and use the phrase: [HANDOFF_NEEDED]
6. Respond in the same language the customer uses (Hindi or English).
7. Never repeat information the customer already confirmed.
8. Do not use markdown — no asterisks, no bullet points, just plain text.

RETRIEVED KNOWLEDGE:
{{RETRIEVED_CHUNKS}}

CONVERSATION SO FAR:
{{CONVERSATION_HISTORY}}

Customer just said: {{CUSTOMER_MESSAGE}}

Your reply (plain text, 2-4 sentences max):
`.trim()

export function buildPrompt(params: {
  agentName: string
  companyName: string
  companyContext: string
  retrievedChunks: string
  conversationHistory: string
  customerMessage: string
}): string {
  return DEFAULT_SYSTEM_PROMPT
    .replace('{{AGENT_NAME}}', params.agentName)
    .replace('{{COMPANY_NAME}}', params.companyName)
    .replace('{{COMPANY_CONTEXT}}', params.companyContext)
    .replace('{{RETRIEVED_CHUNKS}}', params.retrievedChunks || 'No specific knowledge found.')
    .replace('{{CONVERSATION_HISTORY}}', params.conversationHistory || 'Start of conversation.')
    .replace('{{CUSTOMER_MESSAGE}}', params.customerMessage)
}
```

---

## 9. lib/ai-agent/responder.ts

```typescript
import { buildPrompt } from './system-prompt'

const GEMINI_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent'

export interface AgentResponse {
  text: string
  needsHandoff: boolean
  confidenceOk: boolean
}

export async function generateResponse(params: {
  agentName: string
  companyName: string
  companyContext: string
  retrievedChunks: string
  conversationHistory: string
  customerMessage: string
  maxTokens?: number
}): Promise<AgentResponse> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error('GEMINI_API_KEY not set')

  const res = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: buildPrompt(params) }] }],
      generationConfig: {
        maxOutputTokens: params.maxTokens ?? 300,
        temperature: 0.3,
        topP: 0.8,
      },
      safetySettings: [
        { category: 'HARM_CATEGORY_HARASSMENT',        threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
        { category: 'HARM_CATEGORY_HATE_SPEECH',       threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
        { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      ],
    }),
  })

  if (!res.ok) throw new Error(`Gemini generate error ${res.status}: ${await res.text()}`)

  const data = await res.json()
  const rawText: string = data.candidates?.[0]?.content?.parts?.[0]?.text ?? ''

  const needsHandoff = rawText.includes('[HANDOFF_NEEDED]')
  const cleanText = rawText.replace('[HANDOFF_NEEDED]', '').trim()
  const confidenceOk = !rawText.toLowerCase().includes("don't have that information")

  return { text: cleanText, needsHandoff, confidenceOk }
}
```

---

## 10. Knowledge Base — What Your Clients Should Upload

```
COMPANY: [Brand Name]
LOCATION: [City] | Pan India Delivery
CONTACT: +91-XXXXXXXXXX | email@domain.com

ABOUT US:
[2-3 sentences about the company]

PRODUCTS & PRICING:
- [Product category]: ₹X,XXX – ₹XX,XXX
- [Product category]: ₹X,XXX – ₹XX,XXX

DELIVERY:
- Standard: X–Y business days
- Free above: ₹XX,XXX

PAYMENT TERMS:
- [Your payment policy]

WARRANTY:
- [Your warranty terms]

FREQUENTLY ASKED QUESTIONS:
Q: [Common question 1]
A: [Answer]

Q: [Common question 2]
A: [Answer]
```

The agent answers ONLY from this text. Nothing is hallucinated.

---

## 11. Power Efficiency Built In

| Technique | Effect |
|---|---|
| Redis response cache (2h TTL) | Repeated questions skip Gemini entirely |
| BullMQ concurrency = 2 | Caps concurrent AI calls, prevents rate limits |
| Top-3 chunks only | Smaller context = faster + cheaper LLM call |
| 2000-char embedding truncation | No wasted tokens |
| 5-message history window | Prevents context overflow |
| IVFFlat index on pgvector | Fast vector search as data grows |
| gemini-2.0-flash (not pro) | 10x cheaper + faster, same quality for short replies |
| text-embedding-004 free tier | 1500 embed requests/day = $0 |
| Async dispatch | Webhook returns in <5ms always |

---

## 12. Estimated Cost

| Usage | Cost |
|---|---|
| 50 chats/day (1 brand) | $0/month (free tier) |
| 500 chats/day (10 brands) | ~$2–3/month |
| 5000 chats/day (100 brands) | ~$20–30/month |

---

## 13. Implementation Order

1. Run SQL migration in Supabase (adds pgvector + embedding column)
2. Add 3 Prisma models → run `npx prisma db push`
3. Create `lib/ai-agent/` folder with all 5 files
4. Add wa-ai-agent queue to `lib/queues/jobs.ts`
5. Register agent worker in `instrumentation.ts` (same as automation worker)
6. Add 3 lines to webhook/route.ts for job dispatch
7. Add API routes for config + knowledge
8. Build UI tab in WhatsApp Marketing
9. Test: upload company info → send a test message → check inbox for AI reply

---

*Plan version: June 2026 · Stack: Next.js 16 · Gemini 2.0 Flash · pgvector · BullMQ · WhatsApp Cloud API*
