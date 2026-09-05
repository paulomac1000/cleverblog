// Locale definitions for the CleverBlog frontend.
// PL is the default locale (unprefixed routes). EN is served under /en.
// The runtime invariant is fallbackLocale:false on every EN query so EN pages
// 404 cleanly when no translation exists — never fall back to PL content.

export type Locale = 'pl' | 'en'

export const LOCALES = ['pl', 'en'] as const satisfies readonly Locale[]
export const DEFAULT_LOCALE: Locale = 'pl'

export const isLocale = (value: unknown): value is Locale =>
  typeof value === 'string' && (LOCALES as readonly string[]).includes(value)

/**
 * Parse the first qualifying language tag out of an Accept-Language header.
 * Only accepts "en*" matches; everything else (including "*") resolves to null
 * so detection is opt-in and never overrides an explicit cookie or path.
 *
 * Examples:
 *   "en-US,en;q=0.9,pl;q=0.8" -> "en"
 *   "pl-PL,pl;q=0.9"          -> null
 *   "*"                       -> null
 *   undefined / ""             -> null
 */
export const parsePreferredLocale = (
  acceptLanguageHeader: string | null | undefined,
): Locale | null => {
  if (!acceptLanguageHeader || typeof acceptLanguageHeader !== 'string') {
    return null
  }

  let best: Locale | null = null
  let bestWeight = 0

  for (const partRaw of acceptLanguageHeader.split(',')) {
    const part = partRaw.trim()
    if (!part) continue

    const [tagPartRaw, ...paramParts] = part.split(';')
    const tagPart = tagPartRaw?.trim().toLowerCase() ?? ''
    if (!tagPart || tagPart === '*') continue

    const primary = tagPart.split('-', 1)[0]?.toLowerCase() ?? ''
    if (primary !== 'en' && primary !== 'pl') continue

    let weight = 1
    for (const param of paramParts) {
      const [key, value] = param.split('=', 2).map((piece) => piece?.trim())
      if (key === 'q') {
        const parsed = Number(value)
        weight = Number.isFinite(parsed) && parsed >= 0 && parsed <= 1 ? parsed : 0
      }
    }
    if (weight === 0) continue

    const candidate: Locale | null = primary === 'en' ? 'en' : 'pl'
    if (candidate && weight > bestWeight) {
      best = candidate
      bestWeight = weight
    }
  }

  // EN is the only locale we ever auto-redirect to; a PL winner means stay.
  return best === 'en' ? 'en' : null
}
