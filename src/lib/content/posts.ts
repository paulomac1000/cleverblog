// Shared data-fetching helpers for frontend routes.
// Every EN query passes `locale: 'en'` and `fallbackLocale: false` so that
// missing translations 404 cleanly — never fall back to PL content on EN
// routes. PL queries pass `locale: 'pl'` and let Payload use the default
// fallback. Existing draft/published semantics are preserved exactly:
//   * articles + pages: `_status: { equals: 'published' }`
//   * legacy `?p=<id>` handler preserved in the home route.

import config from '@payload-config'
import { getPayload, type Where } from 'payload'

import type { Locale } from '@/i18n/config'

const buildLocaleArgs = (locale: Locale) =>
  locale === 'pl'
    ? { locale: 'pl' as const }
    : { locale: 'en' as const, fallbackLocale: false as const }

export type PublishedPost = NonNullable<
  Awaited<ReturnType<typeof findPublishedPostBySlug>>
>

export const findPublishedPostBySlug = async (
  locale: Locale,
  slug: string,
) => {
  const payload = await getPayload({ config })
  const result = await payload.find({
    collection: 'posts',
    limit: 1,
    depth: 1,
    overrideAccess: true,
    ...buildLocaleArgs(locale),
    where: {
      and: [
        { slug: { equals: slug } },
        { _status: { equals: 'published' } },
      ],
    },
  })
  return result.docs[0] ?? null
}

/**
 * Fetch the same document in EN and PL in parallel. Used by generateMetadata
 * and LanguageSwitcher to decide whether the EN counterpart exists.
 * Returns `{ enExists, enSlug }`. `enSlug` reflects the slug in the EN
 * locale — for the existing collection every post has a slug in every locale
 * because `slug` itself is a localised field; in practice `enSlug` equals
 * the PL slug when an EN translation exists, and is `null` otherwise.
 */
export const getArticleCounterpart = async (
  locale: Locale,
  slug: string,
): Promise<{ enExists: boolean; enSlug: string | null }> => {
  const other: Locale = locale === 'pl' ? 'en' : 'pl'

  const payload = await getPayload({ config })
  const result = await payload.find({
    collection: 'posts',
    limit: 1,
    depth: 0,
    overrideAccess: true,
    locale: other,
    fallbackLocale: false,
    where: {
      and: [
        { slug: { equals: slug } },
        { _status: { equals: 'published' } },
      ],
    },
  })
  const doc = result.docs[0]
  if (!doc) return { enExists: false, enSlug: null }
  return { enExists: true, enSlug: typeof doc.slug === 'string' ? doc.slug : null }
}

export const listPublishedPosts = async (
  locale: Locale,
  args: {
    page?: number
    categoryId?: number
    limit?: number
  } = {},
) => {
  const payload = await getPayload({ config })
  const limit = args.limit ?? 12
  const page = args.page ?? 1

  const where: Where = {
    _status: { equals: 'published' },
  }
  if (args.categoryId !== undefined) {
    where.categories = { equals: args.categoryId }
  }

  return payload.find({
    collection: 'posts',
    limit,
    page,
    depth: 1,
    overrideAccess: true,
    ...buildLocaleArgs(locale),
    sort: '-publishedAt',
    where,
  })
}

export const findPostByLegacyWordpressId = async (
  locale: Locale,
  wordpressId: number,
) => {
  const payload = await getPayload({ config })
  const result = await payload.find({
    collection: 'posts',
    limit: 1,
    depth: 0,
    overrideAccess: true,
    ...buildLocaleArgs(locale),
    where: {
      and: [
        { 'legacy.wordpressId': { equals: wordpressId } },
        { _status: { equals: 'published' } },
      ],
    },
  })
  return result.docs[0] ?? null
}