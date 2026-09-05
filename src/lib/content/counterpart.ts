import type { Locale } from '@/i18n/config'

export type Counterpart = {
  enExists: boolean
  enSlug?: string | null
}

export type CounterpartResolver = (
  locale: Locale,
  slug: string,
) => Promise<Counterpart>

/**
 * Resolve the URL of the same page in the other locale for the header
 * language pill. Document routes resolve per document (null when no
 * published counterpart exists); listing routes always have a counterpart.
 */
export const resolveCounterpartUrl = async (
  locale: Locale,
  path: string,
  resolveArticle: CounterpartResolver,
  resolvePage: CounterpartResolver,
): Promise<string | null> => {
  const stripped =
    locale === 'en' && path.startsWith('/en') ? path.slice(3) || '/' : path

  if (stripped.startsWith('/articles/')) {
    const slug = decodeURIComponent(stripped.slice('/articles/'.length))
    const counterpart = await resolveArticle(locale, slug)
    return counterpart.enExists
      ? articleCounterpartUrl(locale, counterpart.enSlug ?? slug)
      : null
  }

  if (
    stripped !== '/' &&
    !stripped.startsWith('/category/') &&
    !stripped.startsWith('/tags/')
  ) {
    const slug = decodeURIComponent(stripped.slice(1))
    const counterpart = await resolvePage(locale, slug)
    return counterpart.enExists
      ? pageCounterpartUrl(locale, counterpart.enSlug ?? slug)
      : null
  }

  if (stripped === '/') {
    return locale === 'en' ? '/' : '/en'
  }

  return locale === 'en' ? stripped : `/en${stripped}`
}

const articleCounterpartUrl = (locale: Locale, enSlug: string): string =>
  locale === 'en' ? `/articles/${enSlug}` : `/en/articles/${enSlug}`

const pageCounterpartUrl = (locale: Locale, enSlug: string): string =>
  locale === 'en' ? `/${enSlug}` : `/en/${enSlug}`
