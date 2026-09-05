// Shared data-fetching helpers for taxonomy (categories + tags).
// Same locale/fallback invariants as posts.ts.

import config from '@payload-config'
import { getPayload, type Where } from 'payload'

import type { Locale } from '@/i18n/config'

const buildLocaleArgs = (locale: Locale) =>
  locale === 'pl'
    ? { locale: 'pl' as const }
    : { locale: 'en' as const, fallbackLocale: false as const }

const translationExists = (locale: Locale): Where | undefined =>
  locale === 'en' ? { title: { not_equals: null } } : undefined

export type Category = NonNullable<
  Awaited<ReturnType<typeof findCategoryBySlug>>
>

export type PopularTag = {
  name: string
  slug: string
  count: number
}

export const findCategoryBySlug = async (locale: Locale, slug: string) => {
  const payload = await getPayload({ config })
  const result = await payload.find({
    collection: 'categories',
    depth: 0,
    limit: 1,
    overrideAccess: true,
    ...buildLocaleArgs(locale),
    where: { slug: { equals: slug } },
  })
  return result.docs[0] ?? null
}

export const findTagBySlug = async (locale: Locale, slug: string) => {
  const payload = await getPayload({ config })
  const result = await payload.find({
    collection: 'tags',
    depth: 0,
    limit: 1,
    overrideAccess: true,
    ...buildLocaleArgs(locale),
    where: { slug: { equals: slug } },
  })
  return result.docs[0] ?? null
}

export const listCategories = async (locale: Locale) => {
  const payload = await getPayload({ config })
  const result = await payload.find({
    collection: 'categories',
    depth: 0,
    pagination: false,
    overrideAccess: true,
    ...buildLocaleArgs(locale),
    sort: 'name',
  })
  return result.docs
}

export const listTags = async (locale: Locale) => {
  const payload = await getPayload({ config })
  const result = await payload.find({
    collection: 'tags',
    depth: 0,
    pagination: false,
    overrideAccess: true,
    ...buildLocaleArgs(locale),
    sort: 'name',
  })
  return result.docs
}

export const listPopularTags = async (
  locale: Locale,
  args: { minCount?: number; limit?: number } = {},
): Promise<PopularTag[]> => {
  const minCount = args.minCount ?? 2
  const limit = args.limit ?? 12
  if (limit <= 0) return []

  const payload = await getPayload({ config })
  const [tags, postsResult] = await Promise.all([
    listTags(locale),
    payload.find({
      collection: 'posts',
      depth: 0,
      pagination: false,
      overrideAccess: true,
      ...buildLocaleArgs(locale),
      where: {
        and: [
          { _status: { equals: 'published' } },
          translationExists(locale),
        ].filter(Boolean) as Where[],
      },
    }),
  ])

  const counts = new Map<number, number>()
  for (const post of postsResult.docs) {
    for (const tag of post.tags ?? []) {
      const tagId = typeof tag === 'number' ? tag : tag.id
      counts.set(tagId, (counts.get(tagId) ?? 0) + 1)
    }
  }

  return tags
    .flatMap((tag) => {
      const count = counts.get(tag.id) ?? 0
      if (
        count < minCount ||
        typeof tag.name !== 'string' ||
        typeof tag.slug !== 'string' ||
        tag.name.length === 0 ||
        tag.slug.length === 0
      ) {
        return []
      }

      return [{ name: tag.name, slug: tag.slug, count }]
    })
    .sort(
      (a, b) =>
        b.count - a.count ||
        a.name.localeCompare(b.name, locale, { sensitivity: 'base' }),
    )
    .slice(0, limit)
}

export const getCategoryCounterpart = async (
  locale: Locale,
  slug: string,
): Promise<{ enExists: boolean; enSlug: string | null }> => {
  const other: Locale = locale === 'pl' ? 'en' : 'pl'

  const payload = await getPayload({ config })
  const own = await findCategoryBySlug(locale, slug)
  if (!own) return { enExists: false, enSlug: null }

  const result = await payload.find({
    collection: 'categories',
    depth: 0,
    limit: 1,
    overrideAccess: true,
    locale: other,
    fallbackLocale: false,
    where: { id: { equals: own.id } },
  })
  const doc = result.docs[0]
  if (!doc || typeof doc.slug !== 'string' || doc.slug.length === 0) {
    return { enExists: false, enSlug: null }
  }
  return { enExists: other === 'en', enSlug: doc.slug }
}

export const getTagCounterpart = async (
  locale: Locale,
  slug: string,
): Promise<{ enExists: boolean; enSlug: string | null }> => {
  const other: Locale = locale === 'pl' ? 'en' : 'pl'

  const payload = await getPayload({ config })
  const own = await findTagBySlug(locale, slug)
  if (!own) return { enExists: false, enSlug: null }

  const result = await payload.find({
    collection: 'tags',
    depth: 0,
    limit: 1,
    overrideAccess: true,
    locale: other,
    fallbackLocale: false,
    where: { id: { equals: own.id } },
  })
  const doc = result.docs[0]
  if (!doc || typeof doc.slug !== 'string' || doc.slug.length === 0) {
    return { enExists: false, enSlug: null }
  }
  return { enExists: other === 'en', enSlug: doc.slug }
}
