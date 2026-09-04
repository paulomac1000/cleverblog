'use client'

import { useEffect } from 'react'

import { type Locale } from '@/i18n/config'
import { localeHtmlLang } from '@/i18n/format'

/**
 * Setter for document.documentElement.lang.
 *
 * Why this exists: the Next.js App Router only lets a single `<html>` element
 * exist in the route tree, and it must be rendered by the root layout. The
 * root layout is shared between the PL tree (unprefixed) and the /en tree, so
 * it cannot statically pick `lang="pl"` or `lang="en"`. The pragmatic,
 * documented workaround is to render the root `<html lang="pl">` server-side
 * (so legacy crawlers see a sensible default) and let a tiny client component
 * on the /en tree bump it to `lang="en"` at hydration time.
 *
 * SEO impact: Google and Bing both use hreflang + the visible-language content
 * signal as primary signals for locale targeting; the document lang attribute
 * is a weaker hint. Search engines crawling the /en tree see hreflang entries
 * (C1-C2) pointing at the EN canonical, so the temporary client-side lang bump
 * does not affect indexing.
 */
export function HtmlLangSync({ locale }: { locale: Locale }) {
  useEffect(() => {
    if (typeof document === 'undefined') return
    document.documentElement.lang = localeHtmlLang(locale)
  }, [locale])
  return null
}