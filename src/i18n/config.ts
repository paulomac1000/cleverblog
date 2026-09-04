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

  for (const partRaw of acceptLanguageHeader.split(',')) {
    const part = partRaw.trim()
    if (!part) continue

    const tagPart = part.split(';', 1)[0]?.trim() ?? ''
    if (!tagPart) continue

    const primary = tagPart.split('-', 1)[0]?.toLowerCase() ?? ''
    if (primary === 'en') {
      return 'en'
    }
  }

  return null
}