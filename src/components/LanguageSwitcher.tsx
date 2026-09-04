'use client'

import Link from 'next/link'

import { t } from '@/i18n/messages'
import type { Locale } from '@/i18n/config'

type Props = {
  /** Locale of the CURRENT page. */
  locale: Locale
  /**
   * URL of the same page in the other locale, or null when no counterpart
   * exists (per-document routes with a missing translation). The other
   * segment then renders disabled with a tooltip.
   */
  counterpartUrl: string | null
}

const PolandFlag = () => (
  <svg aria-hidden="true" className="lang-flag" viewBox="0 0 16 16">
    <rect width="16" height="8" fill="#f5f5f5" />
    <rect y="8" width="16" height="8" fill="#dc143c" />
  </svg>
)

const UKFlag = () => (
  <svg aria-hidden="true" className="lang-flag" viewBox="0 0 60 30">
    <clipPath id="lang-switch-uk">
      <rect width="60" height="30" rx="3" />
    </clipPath>
    <g clipPath="url(#lang-switch-uk)">
      <rect width="60" height="30" fill="#012169" />
      <path d="M0,0 60,30M60,0 0,30" stroke="#ffffff" strokeWidth="6" />
      <path d="M0,0 60,30M60,0 0,30" stroke="#C8102E" strokeWidth="4" />
      <path d="M30,0 v30 M0,15 h60" stroke="#ffffff" strokeWidth="10" />
      <path d="M30,0 v30 M0,15 h60" stroke="#C8102E" strokeWidth="6" />
    </g>
  </svg>
)

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
}: Props) {
  const target: Locale = locale === 'pl' ? 'en' : 'pl'
  const ariaLabel = t(locale, 'switcher.aria')

  const segments: Array<{
    key: Locale
    flag: React.ReactNode
    label: string
    active: boolean
  }> = [
    { key: 'pl', flag: <PolandFlag />, label: 'Polski', active: locale === 'pl' },
    { key: 'en', flag: <UKFlag />, label: 'English', active: locale === 'en' },
  ]

  return (
    <nav className="lang-switcher" role="group" aria-label={ariaLabel}>
      {segments.map((segment) => {
        const isTarget = segment.key === target
        const disabled = isTarget && !counterpartUrl

        if (segment.active) {
          return (
            <span
              key={segment.key}
              aria-current="true"
              className="lang-segment is-active"
              title={segment.label}
            >
              {segment.flag}
            </span>
          )
        }

        if (disabled) {
          return (
            <span
              key={segment.key}
              aria-disabled="true"
              className="lang-segment is-disabled"
              title={t(locale, 'switcher.noTranslation.title')}
            >
              {segment.flag}
            </span>
          )
        }

        return (
          <Link
            key={segment.key}
            aria-label={`${ariaLabel}: ${segment.label}`}
            className="lang-segment"
            href={counterpartUrl ?? '/'}
            onClick={() => setPreferenceCookie(target)}
            title={`${ariaLabel}: ${segment.label}`}
          >
            {segment.flag}
          </Link>
        )
      })}
    </nav>
  )
}

export default LanguageSwitcher
