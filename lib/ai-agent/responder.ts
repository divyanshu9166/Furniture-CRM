/**
 * lib/ai-agent/responder.ts
 *
 * Sends a filled prompt to Gemini 2.0 Flash and parses the reply.
 * Returns the cleaned reply text plus two boolean signals:
 *   needsHandoff  — model asked to escalate to a human
 *   confidenceOk  — model did NOT say it lacks information
 */

import { buildPrompt, type BuildPromptParams } from './system-prompt'

const MODEL_NAME = process.env.GEMINI_MODEL || 'gemini-2.0-flash'
const GEMINI_URL =
  `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent`

export interface AgentResponse {
  text: string
  needsHandoff: boolean
  confidenceOk: boolean
}

export async function generateResponse(
  params: BuildPromptParams & { maxTokens?: number },
): Promise<AgentResponse> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error('GEMINI_API_KEY not set')

  const prompt = buildPrompt(params)

  const res = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
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

  if (!res.ok) {
    throw new Error(`Gemini generate error ${res.status}: ${await res.text()}`)
  }

  const data = await res.json()
  const rawText: string = data.candidates?.[0]?.content?.parts?.[0]?.text ?? ''

  const needsHandoff = rawText.includes('[HANDOFF_NEEDED]')
  const cleanText = rawText.replace('[HANDOFF_NEEDED]', '').trim()
  const confidenceOk = !rawText.toLowerCase().includes("don't have that information")

  return { text: cleanText, needsHandoff, confidenceOk }
}
