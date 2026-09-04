import config from '@payload-config'
import type { MetadataRoute } from 'next'
import { getPayload } from 'payload'

export const dynamic = 'force-dynamic'

const serverURL = (process.env.NEXT_PUBLIC_SERVER_URL ?? 'http://localhost:3000').replace(/\/+$/, '')

type SitemapEntry = MetadataRoute.Sitemap[number]

const alternatesFor = (plUrl: string, enUrl: string | null) => ({
  languages: enUrl
    ? { pl: plUrl, en: enUrl, 'x-default': plUrl }
    : { pl: plUrl, 'x-default': plUrl },
})

const pairEntry = (
  plUrl: string,
  enUrl: string | null,
  lastModified: Date | string,
  changeFrequency: 'daily' | 'weekly' | 'monthly',
  priority: number,
): SitemapEntry => ({
  url: plUrl,
  lastModified,
  changeFrequency,
  priority,
  alternates: alternatesFor(plUrl, enUrl),
})

const enEntry = (
  enUrl: string,
  lastModified: Date | string,
  changeFrequency: 'weekly' | 'monthly',
  priority: number,
): SitemapEntry => ({
  url: enUrl,
  lastModified,
  changeFrequency,
  priority,
  alternates: alternatesFor(enUrl.replace(`${serverURL}/en`, serverURL), enUrl),
})

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const payload = await getPayload({ config })

  const [postsPl, postsEn, pagesPl, pagesEn, categoriesPl, categoriesEn, tagsPl, tagsEn] = await Promise.all([
    payload.find({
      collection: 'posts',
      locale: 'pl',
      depth: 0,
      pagination: false,
      overrideAccess: true,
      sort: '-publishedAt',
      where: { _status: { equals: 'published' } },
    }),
    payload.find({
      collection: 'posts',
      locale: 'en',
      fallbackLocale: false,
      depth: 0,
      pagination: false,
      overrideAccess: true,
      where: { _status: { equals: 'published' } },
    }),
    payload.find({
      collection: 'pages',
      locale: 'pl',
      depth: 0,
      pagination: false,
      overrideAccess: true,
      sort: 'slug',
    }),
    payload.find({
      collection: 'pages',
      locale: 'en',
      fallbackLocale: false,
      depth: 0,
      pagination: false,
      overrideAccess: true,
    }),
    payload.find({
      collection: 'categories',
      locale: 'pl',
      depth: 0,
      pagination: false,
      overrideAccess: true,
      sort: 'slug',
    }),
    payload.find({
      collection: 'categories',
      locale: 'en',
      fallbackLocale: false,
      depth: 0,
      pagination: false,
      overrideAccess: true,
    }),
    payload.find({
      collection: 'tags',
      locale: 'pl',
      depth: 0,
      pagination: false,
      overrideAccess: true,
      sort: 'slug',
    }),
    payload.find({
      collection: 'tags',
      locale: 'en',
      fallbackLocale: false,
      depth: 0,
      pagination: false,
      overrideAccess: true,
    }),
  ])

  // EN translations that actually exist: fallbackLocale:false leaves the
  // localized fields empty when no EN content was written, so a non-empty
  // slug marks a real translation.
  const enPostSlugs = new Map(
    postsEn.docs
      .filter((post) => Boolean(post.slug) && Boolean(post.title))
      .map((post) => [post.id, post.slug]),
  )
  const enPageSlugs = new Map(
    pagesEn.docs
      .filter((page) => Boolean(page.slug) && Boolean(page.title))
      .map((page) => [page.id, page.slug]),
  )

  const entries: MetadataRoute.Sitemap = [
    {
      url: serverURL,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 1,
      alternates: alternatesFor(serverURL, `${serverURL}/en`),
    },
    {
      url: `${serverURL}/en`,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 0.9,
      alternates: alternatesFor(serverURL, `${serverURL}/en`),
    },
  ]

  for (const post of postsPl.docs) {
    const plUrl = `${serverURL}/articles/${post.slug}`
    const enSlug = enPostSlugs.get(post.id)
    const enUrl = enSlug ? `${serverURL}/en/articles/${enSlug}` : null
    entries.push(pairEntry(plUrl, enUrl, post.updatedAt, 'weekly', 0.8))
    if (enUrl) {
      entries.push(enEntry(enUrl, post.updatedAt, 'weekly', 0.7))
    }
  }

  for (const page of pagesPl.docs) {
    const plUrl = `${serverURL}/${page.slug}`
    const enSlug = enPageSlugs.get(page.id)
    const enUrl = enSlug ? `${serverURL}/en/${enSlug}` : null
    entries.push(pairEntry(plUrl, enUrl, page.updatedAt, 'monthly', 0.6))
    if (enUrl) {
      entries.push(enEntry(enUrl, page.updatedAt, 'monthly', 0.5))
    }
  }

  // Taxonomy EN counterpart exists only when the EN locale row exists
  // (name/slug are localized + required, so untranslated taxonomy has no EN
  // row under fallbackLocale:false).
  const enCategories = new Map(
    categoriesEn.docs
      .filter((category) => Boolean(category.slug) && Boolean(category.name))
      .map((category) => [category.id, category.slug]),
  )
  const enTags = new Map(
    tagsEn.docs
      .filter((tag) => Boolean(tag.slug) && Boolean(tag.name))
      .map((tag) => [tag.id, tag.slug]),
  )

  for (const category of categoriesPl.docs) {
    const plUrl = `${serverURL}/category/${category.slug}`
    const enSlug = enCategories.get(category.id)
    const enUrl = enSlug ? `${serverURL}/en/category/${enSlug}` : null
    entries.push(pairEntry(plUrl, enUrl, category.updatedAt, 'weekly', 0.5))
    if (enUrl) {
      entries.push(enEntry(enUrl, category.updatedAt, 'weekly', 0.4))
    }
  }

  for (const tag of tagsPl.docs) {
    const plUrl = `${serverURL}/tags/${tag.slug}`
    const enSlug = enTags.get(tag.id)
    const enUrl = enSlug ? `${serverURL}/en/tags/${enSlug}` : null
    entries.push(pairEntry(plUrl, enUrl, tag.updatedAt, 'weekly', 0.4))
    if (enUrl) {
      entries.push(enEntry(enUrl, tag.updatedAt, 'weekly', 0.3))
    }
  }

  return entries
}
