import { getPayload } from 'payload'

import type { RedirectSource } from './map-redirects'

type PayloadClient = Awaited<ReturnType<typeof getPayload>>
type ContentCollection = 'posts' | 'pages'
type TaxonomyCollection = 'categories' | 'tags'

const requireWordPressId = (value: unknown, label: string): number => {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${label} has invalid or missing legacy WordPress ID: ${String(value)}`)
  }
  return value
}

const requireSlug = (value: unknown, label: string): string => {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${label} has no usable slug`)
  }
  return value
}

const loadContent = async (
  payload: PayloadClient,
  collection: ContentCollection,
): Promise<RedirectSource[]> => {
  const result = await payload.find({
    collection,
    depth: 0,
    pagination: false,
    overrideAccess: true,
    where: { _status: { equals: 'published' } },
  })
  return result.docs.map((doc) => {
    const label = `Published redirect source ${collection} payload:${doc.id}`
    return {
      collection,
      payloadId: doc.id,
      wordpressId: requireWordPressId(doc.legacy?.wordpressId, label),
      slug: requireSlug(doc.slug, label),
    }
  })
}

const loadTaxonomy = async (
  payload: PayloadClient,
  collection: TaxonomyCollection,
): Promise<RedirectSource[]> => {
  const result = await payload.find({
    collection,
    depth: 0,
    pagination: false,
    overrideAccess: true,
  })
  return result.docs.map((doc) => {
    const label = `Public redirect source ${collection} payload:${doc.id}`
    return {
      collection,
      payloadId: doc.id,
      wordpressId: requireWordPressId(doc.legacyWordPressId, label),
      slug: requireSlug(doc.slug, label),
    }
  })
}

export const loadLiveRedirectSources = async (
  payload: PayloadClient,
): Promise<RedirectSource[]> => [
  ...(await loadContent(payload, 'posts')),
  ...(await loadContent(payload, 'pages')),
  ...(await loadTaxonomy(payload, 'categories')),
  ...(await loadTaxonomy(payload, 'tags')),
]
