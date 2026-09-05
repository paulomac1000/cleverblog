import { createHash } from 'node:crypto'

export type TranslationOutcome = {
  text: string | null
  status: 'ready' | 'failed' | 'mt_disabled' | 'rate_limited'
  provider?: string
  model?: string
  sourceHash?: string
}

export const MT_SUPPORTED_LOCALES = ['en'] as const
export const MAX_TRANSLATION_INPUT_CHARS = 2000
export const MAX_TRANSLATION_BATCH = 20

export const isMtEnabled = (): boolean =>
  process.env.COMMENTS_MT_ENABLED === 'true' &&
  Boolean(process.env.OPENROUTER_API_KEY) &&
  Boolean(process.env.COMMENTS_MT_MODEL)

const hashSource = (text: string): string =>
  createHash('sha256').update(text.trim()).digest('hex').slice(0, 32)

const RATE_WINDOW_MS = 60_000
const PER_IP_LIMIT = 5
const GLOBAL_LIMIT = 30

const ipHits = new Map<string, number[]>()
let globalHits: number[] = []
let providerInFlight = 0

const prune = (hits: number[], now: number): number[] =>
  hits.filter((ts) => now - ts < RATE_WINDOW_MS)

export const consumeRateLimit = (
  ip: string,
): { allowed: boolean; retryAfterSeconds: number } => {
  const now = Date.now()
  ipHits.set(ip, prune(ipHits.get(ip) ?? [], now))
  globalHits = prune(globalHits, now)

  const ipHitsList = ipHits.get(ip) ?? []
  if (ipHitsList.length >= PER_IP_LIMIT) {
    return { allowed: false, retryAfterSeconds: 60 }
  }
  if (globalHits.length >= GLOBAL_LIMIT) {
    return { allowed: false, retryAfterSeconds: 60 }
  }

  ipHits.set(ip, [...ipHitsList, now])
  globalHits = [...globalHits, now]
  return { allowed: true, retryAfterSeconds: 0 }
}

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'
const PROVIDER_TIMEOUT_MS = 8_000
const SYSTEM_PROMPT =
  'You translate Polish blog comments to English. Output ONLY the translation as plain text. Preserve meaning and tone; never add commentary; keep URLs, code, and commands untouched.'

type OpenRouterChoice = { message?: { content?: string } }

const callOpenRouter = async (
  model: string,
  apiKey: string,
  text: string,
): Promise<string> => {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS)
  try {
    const resp = await fetch(OPENROUTER_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
        'HTTP-Referer': process.env.NEXT_PUBLIC_SERVER_URL ?? 'https://cleverblog.pl',
        'X-Title': 'cleverblog comment translation',
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: text },
        ],
      }),
    })
    if (!resp.ok) {
      throw new Error(`provider ${resp.status}`)
    }
    const body = (await resp.json()) as { choices?: OpenRouterChoice[] }
    const content = body.choices?.[0]?.message?.content?.trim()
    if (!content) {
      throw new Error('provider returned empty translation')
    }
    return content
  } finally {
    clearTimeout(timer)
  }
}

const translateViaOpenRouter = async (
  text: string,
): Promise<{ text: string; model: string }> => {
  const apiKey = process.env.OPENROUTER_API_KEY ?? ''
  const primary = process.env.COMMENTS_MT_MODEL ?? ''
  const fallback = process.env.COMMENTS_MT_FALLBACK_MODEL ?? ''
  const models = [primary, fallback].filter((m): m is string => Boolean(m))
  let lastError: unknown = new Error('no model configured')
  for (const model of models) {
    try {
      return { text: await callOpenRouter(model, apiKey, text), model }
    } catch (error) {
      lastError = error
    }
  }
  throw lastError
}

export const translateCommentText = async (
  text: string,
): Promise<TranslationOutcome> => {
  if (!isMtEnabled()) {
    return { text: null, status: 'mt_disabled' }
  }
  if (providerInFlight > 0) {
    return { text: null, status: 'rate_limited' }
  }
  providerInFlight += 1
  try {
    const { text: translated, model } = await translateViaOpenRouter(text)
    return {
      text: translated,
      status: 'ready',
      provider: 'openrouter',
      model,
      sourceHash: hashSource(text),
    }
  } catch {
    return { text: null, status: 'failed' }
  } finally {
    providerInFlight -= 1
  }
}

export const sourceHash = hashSource
