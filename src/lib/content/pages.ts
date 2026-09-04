// Shared data-fetching helpers for Page documents.
// Same locale/fallback invariants as posts.ts.

import config from '@payload-config'
import { getPayload } from 'payload'

import type { Locale } from '@/i18n/config'

const buildLocaleArgs = (locale: Locale) =>
  locale === 'pl'
    ? { locale: 'pl' as const }
    : { locale: 'en' as const, fallbackLocale: false as const }

export const findPublishedPageBySlug = async (
  locale: Locale,
  slug: string,
) => {
  const payload = await getPayload({ config })
  const result = await payload.find({
    collection: 'pages',
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

export const getPageCounterpart = async (
  locale: Locale,
  slug: string,
): Promise<{ enExists: boolean; enSlug: string | null }> => {
  const payload = await getPayload({ config })
  // Resolve the current document in its own locale first (slugs may differ
  // per locale), then read the same document id under the other locale.
  const own = await findPublishedPageBySlug(locale, slug)
  if (!own) return { enExists: false, enSlug: null }

  const other: Locale = locale === 'pl' ? 'en' : 'pl'
  const result = await payload.find({
    collection: 'pages',
    limit: 1,
    depth: 0,
    overrideAccess: true,
    locale: other,
    fallbackLocale: false,
    where: {
      and: [
        { id: { equals: own.id } },
        { _status: { equals: 'published' } },
      ],
    },
  })
  const doc = result.docs[0]
  if (!doc || typeof doc.slug !== 'string' || doc.slug.length === 0) {
    return { enExists: false, enSlug: null }
  }
  return { enExists: other === 'en', enSlug: doc.slug }
}
