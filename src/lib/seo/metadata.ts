// Localised metadata helper. Produces a Next Metadata object with:
//   * canonical pointing at the absolute self URL for the requested locale
//   * hreflang alternates ONLY when the counterpart URL exists (per route)
//   * x-default → the PL URL (PL is the authoritative default tree)
//   * openGraph.locale reflecting the locale; alternate locale when pair exists
//
// serverURL source is exactly the same constant used by every existing route:
//   process.env.NEXT_PUBLIC_SERVER_URL ?? 'http://localhost:3000'  (trimmed of trailing slash)

import type { Metadata } from 'next'

import type { Locale } from '@/i18n/config'

const rawServerURL =
  process.env.NEXT_PUBLIC_SERVER_URL ?? 'http://localhost:3000'

export const serverURL = rawServerURL.replace(/\/+$/, '')

const ogLocaleFor = (locale: Locale) =>
  locale === 'pl' ? 'pl_PL' : 'en_US'

const ogAlternateFor = (locale: Locale) =>
  locale === 'pl' ? 'en_US' : 'pl_PL'

const openGraphLocalesFor = (locale: Locale, hasCounterpart: boolean) =>
  hasCounterpart
    ? [ogLocaleFor(locale), ogAlternateFor(locale)]
    : [ogLocaleFor(locale)]

type LocalizedMetadataInput = {
  locale: Locale
  canonicalPath: string
  title?: string
  description?: string
  /**
   * Absolute URL of the counterpart translation in the other locale, or null
   * if no translation exists. When null, no hreflang entries are emitted and
   * the og:locale has no alternateLocale companion.
   */
  counterpartUrl?: string | null
  openGraph?: {
    type?: 'website' | 'article'
    siteName?: string
  }
  twitter?: {
    card?: 'summary' | 'summary_large_image'
  }
}

/**
 * Build a localised Metadata object. Inputs:
 *   canonicalPath — the URL path (starts with /), relative to the serverURL.
 *   counterpartUrl — full absolute URL of the other-locale counterpart, or
 *     null. When null, no hreflang entries and no og:locale alternateLocale.
 */
export const buildLocalizedMetadata = ({
  locale,
  canonicalPath,
  title,
  description,
  counterpartUrl,
  openGraph,
  twitter,
}: LocalizedMetadataInput): Metadata => {
  const canonicalURL = canonicalPath.startsWith('http')
    ? canonicalPath
    : `${serverURL}${canonicalPath.startsWith('/') ? '' : '/'}${canonicalPath}`

  const languages: Record<string, string> = {
    [locale]: canonicalURL,
  }

  if (counterpartUrl) {
    const counterpartLocale: Locale = locale === 'pl' ? 'en' : 'pl'
    languages[counterpartLocale] = counterpartUrl
    languages['x-default'] = counterpartLocale === 'pl' ? counterpartUrl : canonicalURL
  }

  const meta: Metadata = {
    alternates: {
      canonical: canonicalURL,
      ...(counterpartUrl ? { languages } : {}),
    },
  }

  if (title) meta.title = title
  if (description) meta.description = description

  meta.openGraph = {
    locale: ogLocaleFor(locale),
    type: openGraph?.type ?? 'website',
    siteName: openGraph?.siteName,
    title,
    description,
    url: canonicalURL,
    alternateLocale: counterpartUrl
      ? [ogAlternateFor(locale)]
      : undefined,
  }

  meta.twitter = {
    card: twitter?.card ?? 'summary',
    title,
    description,
  }

  meta.other = {
    'og:locale': ogLocaleFor(locale),
  }

  void openGraphLocalesFor // retained for future expansion of og:locale array support

  return meta
}