export const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash'
export const GEMINI_EMBEDDING_MODEL = 'text-embedding-004'

export function normalizeGeminiModelName(model: string) {
  const normalized = model.trim().replace(/^models\//, '')

  // gemini-3.1-flash-lite does not exist in Google's API — silently redirect
  // to the real production model so old configs don't break.
  if (normalized === 'gemini-3.1-flash-lite' || normalized === 'gemini-2.5-flash-lite') {
    return DEFAULT_GEMINI_MODEL
  }

  return normalized
}

export function getGeminiModelName() {
  return normalizeGeminiModelName(process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL)
}

export function getGeminiApiKey() {
  const rawKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY
  const key = rawKey?.trim().replace(/^['"]|['"]$/g, '')

  if (!key) {
    throw new Error(
      'GEMINI_API_KEY is not set. Create an API key in Google AI Studio and add it to the VPS .env file.',
    )
  }

  return key
}

export function geminiUrl(model: string, action: 'generateContent' | 'embedContent') {
  // text-embedding-004 is only available on the stable v1 API.
  // generateContent features (thinking, etc.) need v1beta.
  const version = action === 'embedContent' ? 'v1' : 'v1beta'
  return `https://generativelanguage.googleapis.com/${version}/models/${normalizeGeminiModelName(model)}:${action}`
}

export async function geminiErrorMessage(res: Response, actionLabel: string) {
  const raw = await res.text()

  try {
    const parsed = JSON.parse(raw) as {
      error?: {
        message?: string
        status?: string
        details?: Array<{ reason?: string }>
      }
    }
    const reason = parsed.error?.details?.find((d) => d.reason)?.reason
    const message = parsed.error?.message || raw

    const isInvalidApiKey =
      reason === 'API_KEY_INVALID' ||
      /API key not valid|API_KEY_INVALID/i.test(message)

    if (isInvalidApiKey) {
      return (
        `Gemini ${actionLabel} error ${res.status}: API key is invalid. ` +
        'Create a valid key in Google AI Studio, update GEMINI_API_KEY in the VPS .env file, then restart the app container.'
      )
    }

    return `Gemini ${actionLabel} error ${res.status}: ${message}`
  } catch {
    return `Gemini ${actionLabel} error ${res.status}: ${raw}`
  }
}
