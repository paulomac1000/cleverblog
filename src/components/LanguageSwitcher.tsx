'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { useEffect, useMemo } from 'react'

import { t } from '@/i18n/messages'
import { counterpartPath } from '@/i18n/urls'
import { DEFAULT_LOCALE, type Locale } from '@/i18n/config'

type Props = {
  /**
   * Locale the current page is being rendered in. Drives the displayed
   * label: on PL pages we render "EN" (the switch target) and vice versa.
   */
  locale: Locale
  /**
   * Absolute path of the equivalent page in the OTHER locale, or null when
   * no counterpart exists. Pass null when an article or page has no EN
   * translation so we render a disabled state with a tooltip.
   */
  counterpartUrl: string | null
  /**
   * The path of the CURRENT page (locale-prefixed). Provided by the server
   * page so the switcher can compute the counterpart URL on the client
   * without re-querying the locale.
   */
  currentPath: string
}

const COOKIE_NAME = 'PL_LOCALE'
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365

const setPreferenceCookie = (value: Locale) => {
  if (typeof document === 'undefined') return
  const v = encodeURIComponent(value)
  document.cookie = `${COOKIE_NAME}=${v}; Path=/; Max-Age=${COOKIE_MAX_AGE}; SameSite=Lax`
}

export function LanguageSwitcher({
  locale,
  counterpartUrl,
  currentPath,
}: Props) {
  const pathname = usePathname()
  const search = useSearchParams()

  const target: Locale = locale === 'pl' ? 'en' : 'pl'
  const label = t(locale, locale === 'pl' ? 'switcher.toEnglish' : 'switcher.toPolish')
  const ariaLabel = t(locale, 'switcher.aria')

  // Compute the counterpart URL on the client when the server didn't have one
  // (e.g. for routes whose counterpart always exists — listings, categories,
  // tags). For per-document routes where the counterpart may not exist
  // (articles, pages), the server pre-computed it and passed it in.
  const href = useMemo(() => {
    if (counterpartUrl) return counterpartUrl
    if (target === DEFAULT_LOCALE) return currentPath // PL is unprefixed; same URL.
    return counterpartPath(locale, target, currentPath)
  }, [counterpartUrl, currentPath, locale, target])

  useEffect(() => {
    if (!pathname) return
    // Reflect the current path in the currentPath prop. The server path
    // doesn't include search params, but the switcher itself does not need
    // to forward search params; preserving them would make some listings
    // behave oddly across locales (e.g. category filter on /en). Future
    // enhancement: pass search through if both locales share the filter.
    void search
  }, [pathname, search])

  if (!counterpartUrl) {
    // No translation; render disabled link so screen readers still announce
    // the language toggle exists.
    return (
      <span
        aria-disabled="true"
        aria-label={ariaLabel}
        className="lang-switcher is-disabled"
        title={t(locale, 'switcher.noTranslation.title')}
      >
        {label}
      </span>
    )
  }

  return (
    <Link
      aria-label={ariaLabel}
      className="lang-switcher"
      href={href}
      onClick={() => setPreferenceCookie(target)}
    >
      {label}
    </Link>
  )
}