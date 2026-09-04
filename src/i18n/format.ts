// Locale-aware formatting helpers. Kept minimal — no runtime i18n deps.

import type { Locale } from './config'

export const formatDate = (date: Date | string, locale: Locale): string => {
  const value = date instanceof Date ? date : new Date(date)
  return value.toLocaleDateString(locale === 'pl' ? 'pl-PL' : 'en-US', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

export const localeHtmlLang = (locale: Locale): 'pl' | 'en' => locale