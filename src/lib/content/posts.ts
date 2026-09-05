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

/**
 * EN `_status=published` is document-level and does NOT prove an EN
 * translation exists (a PL-published post with empty localized fields still
 * satisfies the status predicate). Requiring the localized `title` in the
 * same where-clause makes the database filter to docs that actually have EN
 * locale rows, keeping lists/pagination honest under fallbackLocale:false.
 */
const translationExists = (locale: Locale): Where | undefined =>
  locale === 'en' ? { title: { not_equals: null } } : undefined

type NamedRelation = {
  name?: string | null
}

const relationNames = (
  relations: (number | NamedRelation)[] | null | undefined,
): string[] =>
  (relations ?? [])
    .map((relation) =>
      typeof relation === 'object' && relation !== null ? relation.name : null,
    )
    .filter((name): name is string => Boolean(name))

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
        translationExists(locale),
      ].filter(Boolean) as Where[],
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
  // Resolve the CURRENT document by slug in the CURRENT locale first, then
  // read the SAME document id in the other locale. Matching by the other
  // locale's slug would break when translations use different slugs.
  const own = await payload.find({
    collection: 'posts',
    limit: 1,
    depth: 0,
    overrideAccess: true,
    ...buildLocaleArgs(locale),
    where: {
      and: [
        { slug: { equals: slug } },
        { _status: { equals: 'published' } },
      ],
    },
  })
  const ownDoc = own.docs[0]
  if (!ownDoc) return { enExists: false, enSlug: null }

  const otherResult = await payload.find({
    collection: 'posts',
    limit: 1,
    depth: 0,
    overrideAccess: true,
    locale: other,
    fallbackLocale: false,
    where: {
      and: [
        { id: { equals: ownDoc.id } },
        { _status: { equals: 'published' } },
      ],
    },
  })
  const doc = otherResult.docs[0]
  if (!doc || typeof doc.slug !== 'string' || doc.slug.length === 0) {
    return { enExists: false, enSlug: null }
  }
  // enExists means "the counterpart document exists" and must be true in
  // BOTH directions; keying it on `other === 'en'` silently disabled the
  // PL flag and hreflang on every EN page.
  return { enExists: true, enSlug: doc.slug }
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
    and: [
      { _status: { equals: 'published' } },
      translationExists(locale),
    ].filter(Boolean) as Where[],
  }
  if (args.categoryId !== undefined) {
    where.and?.push({ categories: { equals: args.categoryId } } as never)
  }

  const result = await payload.find({
    collection: 'posts',
    limit,
    page,
    depth: 1,
    overrideAccess: true,
    ...buildLocaleArgs(locale),
    sort: '-publishedAt',
    where,
  })

  return {
    ...result,
    docs: result.docs.map((doc) => ({
      ...doc,
      categoryNames: relationNames(doc.categories),
      tagNames: relationNames(doc.tags),
    })),
  }
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
