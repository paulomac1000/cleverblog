'use client'

import { useRef } from 'react'
import { usePathname } from 'next/navigation'

import { t } from '@/i18n/messages'
import type { Locale } from '@/i18n/config'

type Props = {
  locale: Locale
  ssrPath: string
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

const stripEnPrefix = (path: string): string =>
  path === '/en' ? '/' : path.startsWith('/en/') ? path.slice(3) : path

const swapLocalePrefix = (locale: Locale, path: string): string =>
  locale === 'en' ? stripEnPrefix(path) : `/en${path}`

export function LanguageSwitcher({
  locale,
  ssrPath,
  counterpartUrl,
}: Props) {
  const pathname = usePathname() || '/'
  const currentLocale: Locale =
    pathname === '/en' || pathname.startsWith('/en/') ? 'en' : 'pl'
  const target: Locale = currentLocale === 'pl' ? 'en' : 'pl'

  // Server data is authoritative only for the page that SSR rendered. After
  // client-side navigation the layout props go stale and the counterpart
  // existence cannot be known client-side, so the click resolves it via the
  // same server logic instead of guessing a URL that may not exist.
  const onSsrPath = pathname === ssrPath
  const resolvedCounterpart = onSsrPath
    ? counterpartUrl
    : swapLocalePrefix(currentLocale, pathname)
  const needsResolution = !onSsrPath
  const disabled = onSsrPath && counterpartUrl === null
  const resolvingRef = useRef(false)

  const handleSwitch = (
    event: React.MouseEvent,
    nextLocale: Locale,
    href: string,
  ) => {
    event.preventDefault()
    if (resolvingRef.current) return
    setPreferenceCookie(nextLocale)
    if (needsResolution) {
      resolvingRef.current = true
      fetch(`/comments-counterpart?path=${encodeURIComponent(pathname)}`)
        .then((resp) => (resp.ok ? resp.json() : null))
        .then((body: { url?: string | null } | null) => {
          // No counterpart (or resolver failure) = stay on the current page.
          resolvingRef.current = false
          if (body?.url) window.location.assign(body.url)
        })
        .catch(() => {
          resolvingRef.current = false
        })
      return
    }
    if (href) window.location.assign(href)
  }

  const ariaLabel = t(locale, 'switcher.aria')

  const segments: Array<{
    key: Locale
    flag: React.ReactNode
    label: string
    active: boolean
  }> = [
    { key: 'pl', flag: <PolandFlag />, label: 'Polski', active: currentLocale === 'pl' },
    { key: 'en', flag: <UKFlag />, label: 'English', active: currentLocale === 'en' },
  ]

  return (
    <nav className="lang-switcher" role="group" aria-label={ariaLabel}>
      {segments.map((segment) => {
        const isTarget = segment.key === target

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

        if (isTarget && disabled) {
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
          <a
            key={segment.key}
            aria-label={`${ariaLabel}: ${segment.label}`}
            className="lang-segment"
            href={resolvedCounterpart ?? '/'}
            onClick={(event) =>
              handleSwitch(event, segment.key, resolvedCounterpart ?? '/')
            }
            title={`${ariaLabel}: ${segment.label}`}
          >
            {segment.flag}
          </a>
        )
      })}
    </nav>
  )
}

export default LanguageSwitcher
