/**
 * lib/ai-agent/embedder.ts
 *
 * Gemini gemini-embedding-001 wrapper.
 * Two task types:
 *   - embedText     → RETRIEVAL_QUERY  (used when a customer message arrives)
 *   - embedDocument → RETRIEVAL_DOCUMENT (used when indexing knowledge chunks)
 *
 * Includes exponential backoff retry on 429 rate-limit responses.
 */

import {
  GEMINI_EMBEDDING_MODEL,
  geminiErrorMessage,
  geminiUrl,
  getGeminiApiKey,
} from './gemini'

const EMBED_URL = geminiUrl(GEMINI_EMBEDDING_MODEL, 'embedContent')

const MAX_RETRIES = 3

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

async function callEmbedApi(text: string, taskType: string): Promise<number[]> {
  const apiKey = getGeminiApiKey()

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const res = await fetch(`${EMBED_URL}?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: `models/${GEMINI_EMBEDDING_MODEL}`,
        content: { parts: [{ text: text.slice(0, 2000) }] },
        taskType,
        outputDimensionality: 768,
      }),
    })

    if (res.status === 429) {
      if (attempt === MAX_RETRIES) {
        throw new Error(`Gemini embed rate-limited after ${MAX_RETRIES} retries`)
      }
      const waitMs = Math.pow(2, attempt + 1) * 1000  // 2s, 4s, 8s
      console.warn(`[embedder] 429 rate limit — retrying in ${waitMs}ms (attempt ${attempt + 1})`)
      await sleep(waitMs)
      continue
    }

    if (!res.ok) {
      throw new Error(await geminiErrorMessage(res, 'embed'))
    }

    const data = await res.json()
    return data.embedding.values as number[]
  }

  throw new Error('Gemini embed: unexpected retry loop exit')
}

/** Embed a customer query — use before vector search. */
export async function embedText(text: string): Promise<number[]> {
  return callEmbedApi(text, 'RETRIEVAL_QUERY')
}

/** Embed a knowledge document chunk — use during indexing. */
export async function embedDocument(text: string): Promise<number[]> {
  return callEmbedApi(text, 'RETRIEVAL_DOCUMENT')
}
