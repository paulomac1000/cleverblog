// Shared data-fetching helpers for taxonomy (categories + tags).
// Same locale/fallback invariants as posts.ts.

import config from '@payload-config'
import { getPayload } from 'payload'

import type { Locale } from '@/i18n/config'

const buildLocaleArgs = (locale: Locale) =>
  locale === 'pl'
    ? { locale: 'pl' as const }
    : { locale: 'en' as const, fallbackLocale: false as const }

export type Category = NonNullable<
  Awaited<ReturnType<typeof findCategoryBySlug>>
>

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