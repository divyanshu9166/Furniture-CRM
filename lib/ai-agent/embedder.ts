/**
 * lib/ai-agent/embedder.ts
 *
 * Gemini text-embedding-004 wrapper.
 * Two task types:
 *   - embedText     → RETRIEVAL_QUERY  (used when a customer message arrives)
 *   - embedDocument → RETRIEVAL_DOCUMENT (used when indexing knowledge chunks)
 */

const EMBED_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent'

async function callEmbedApi(text: string, taskType: string): Promise<number[]> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error('GEMINI_API_KEY not set')

  const res = await fetch(`${EMBED_URL}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'models/text-embedding-004',
      content: { parts: [{ text: text.slice(0, 2000) }] },
      taskType,
    }),
  })

  if (!res.ok) {
    throw new Error(`Gemini embed error ${res.status}: ${await res.text()}`)
  }

  const data = await res.json()
  return data.embedding.values as number[]
}

/** Embed a customer query — use before vector search. */
export async function embedText(text: string): Promise<number[]> {
  return callEmbedApi(text, 'RETRIEVAL_QUERY')
}

/** Embed a knowledge document chunk — use during indexing. */
export async function embedDocument(text: string): Promise<number[]> {
  return callEmbedApi(text, 'RETRIEVAL_DOCUMENT')
}
