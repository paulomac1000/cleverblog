// Single source of truth for building locale-aware URLs.
// PL output is byte-identical to the pre-i18n URLs (unprefixed paths).
// EN output is `/en` + the same PL path.

import type { Locale } from './config'

/**
 * Prepend /en for EN. PL returns the path unchanged.
 * Always returns a path that starts with `/` and never ends with `/` (except
 * for the bare root, which becomes `/en` or `/`).
 */
export const localePath = (locale: Locale, path: string): string => {
  const normalised = normalisePath(path)
  if (locale === 'pl') return normalised
  if (normalised === '/') return '/en'
  return `/en${normalised}`
}

export const homeUrl = (locale: Locale): string => localePath(locale, '/')

export const articleUrl = (
  locale: Locale,
  slug: string,
  page?: number,
): string => {
  const base = localePath(locale, `/articles/${encodeURIComponent(slug)}`)
  return appendPage(base, page)
}

export const categoryUrl = (
  locale: Locale,
  slug: string,
  page?: number,
): string => {
  const base = localePath(locale, `/category/${encodeURIComponent(slug)}`)
  return appendPage(base, page)
}

export const tagUrl = (locale: Locale, slug: string): string =>
  localePath(locale, `/tags/${encodeURIComponent(slug)}`)

export const pageUrl = (locale: Locale, slug: string): string =>
  localePath(locale, `/${encodeURIComponent(slug)}`)

/**
 * Localized slugs for the static pages (O mnie / Kontakt).
 * PL slugs are the canonical public URLs; EN pages carry their own
 * English slugs in the pages collection.
 */
export const aboutPageSlug = (locale: Locale): string =>
  locale === 'pl' ? 'o-nas' : 'about'

export const contactPageSlug = (locale: Locale): string =>
  locale === 'pl' ? 'kontakt' : 'contact'

export const feedUrl = (locale: Locale): string =>
  locale === 'pl' ? '/feed.xml' : '/en/feed.xml'

export const counterpartPath = (
  current: Locale,
  counter: Locale,
  path: string,
): string => localePath(counter, stripLocalePrefix(path, current))

/**
 * Strip a locale prefix from a path. If the path is not under the given locale
 * tree it is returned unchanged. Used by the LanguageSwitcher to swap locale on
 * the same logical URL (e.g. `/articles/x` -> `/en/articles/x`).
 */
const stripLocalePrefix = (path: string, current: Locale): string => {
  if (current === 'pl') return path // PL is unprefixed; nothing to strip.
  if (path === '/en' || path === '/en/') return '/'
  if (path.startsWith('/en/')) return `/${path.slice('/en/'.length)}`
  return path
}

const normalisePath = (path: string): string => {
  if (!path) return '/'
  if (path.length > 1 && path.endsWith('/')) return path.slice(0, -1)
  return path
}

const appendPage = (base: string, page?: number): string => {
  if (!page || page < 2) return base
  return `${base}?page=${page}`
}