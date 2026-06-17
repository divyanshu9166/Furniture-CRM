/**
 * lib/ai-agent/responder.ts
 *
 * Sends a filled prompt to the configured chat model and parses the reply.
 * Returns the cleaned reply text plus two boolean signals:
 *   needsHandoff  — model asked to escalate to a human
 *   confidenceOk  — model did NOT say it lacks information
 *
 * Provider selection (chat generation only):
 *   AGENT_LLM_PROVIDER=groq   (default) → Groq free Llama model
 *   AGENT_LLM_PROVIDER=gemini           → Google Gemini (paid)
 *
 * Embeddings always use Gemini regardless of this setting — see embedder.ts.
 */

import { buildPrompt, type BuildPromptParams } from './system-prompt'
import { geminiErrorMessage, geminiUrl, getGeminiApiKey, getGeminiModelName } from './gemini'
import { groqChat } from './groq'

export interface AgentResponse {
  text: string
  needsHandoff: boolean
  confidenceOk: boolean
}

type LlmProvider = 'groq' | 'gemini'

function getChatProvider(): LlmProvider {
  const raw = (process.env.AGENT_LLM_PROVIDER || 'groq').trim().toLowerCase()
  return raw === 'gemini' ? 'gemini' : 'groq'
}

// Shared parsing so both providers behave identically.
function parseAgentReply(rawText: string): AgentResponse {
  const needsHandoff = rawText.includes('[HANDOFF_NEEDED]')
  const cleanText = rawText.replace('[HANDOFF_NEEDED]', '').trim()
  const confidenceOk = !rawText.toLowerCase().includes("don't have that information")
  return { text: cleanText, needsHandoff, confidenceOk }
}

export async function generateResponse(
  params: BuildPromptParams & { maxTokens?: number },
): Promise<AgentResponse> {
  const prompt = buildPrompt(params)
  const maxTokens = params.maxTokens ?? 300

  if (getChatProvider() === 'gemini') {
    return generateWithGemini(prompt, maxTokens)
  }
  return generateWithGroq(prompt, maxTokens)
}

// ── Groq (default, free Llama) ──────────────────────────────────────────────

async function generateWithGroq(prompt: string, maxTokens: number): Promise<AgentResponse> {
  // The full prompt (system rules + knowledge + history + customer message) is
  // already assembled by buildPrompt(), so send it as a single user turn to
  // keep behaviour identical to the Gemini path.
  const rawText = await groqChat({
    messages: [{ role: 'user', content: prompt }],
    maxTokens,
    temperature: 0.3,
    topP: 0.8,
  })
  return parseAgentReply(rawText)
}

// ── Gemini (kept for future switch back to Google's API) ────────────────────

async function generateWithGemini(prompt: string, maxTokens: number): Promise<AgentResponse> {
  const apiKey = getGeminiApiKey()
  const modelName = getGeminiModelName()

  const res = await fetch(`${geminiUrl(modelName, 'generateContent')}?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        maxOutputTokens: maxTokens,
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

  if (!res.ok) {
    throw new Error(await geminiErrorMessage(res, 'generate'))
  }

  const data = await res.json()
  const rawText: string = data.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
  return parseAgentReply(rawText)
}
