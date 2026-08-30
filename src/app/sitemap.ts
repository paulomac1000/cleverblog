import config from '@payload-config'
import type { MetadataRoute } from 'next'
import { getPayload } from 'payload'

export const dynamic = 'force-dynamic'

const serverURL = (process.env.NEXT_PUBLIC_SERVER_URL ?? 'http://localhost:3000').replace(/\/+$/, '')

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const payload = await getPayload({ config })

  const [posts, pages, categories, tags] = await Promise.all([
    payload.find({
      collection: 'posts',
      depth: 0,
      pagination: false,
      overrideAccess: true,
      sort: '-publishedAt',
      where: { _status: { equals: 'published' } },
    }),
    payload.find({
      collection: 'pages',
      depth: 0,
      pagination: false,
      overrideAccess: true,
      sort: '-publishedAt',
      where: { _status: { equals: 'published' } },
    }),
    payload.find({
      collection: 'categories',
      depth: 0,
      pagination: false,
      overrideAccess: true,
      sort: 'slug',
    }),
    payload.find({
      collection: 'tags',
      depth: 0,
      pagination: false,
      overrideAccess: true,
      sort: 'slug',
    }),
  ])

  return [
    {
      url: serverURL,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 1,
    },
    ...posts.docs.map((post) => ({
      url: `${serverURL}/articles/${post.slug}`,
      lastModified: post.updatedAt,
      changeFrequency: 'weekly' as const,
      priority: 0.8,
    })),
    ...pages.docs.map((page) => ({
      url: `${serverURL}/${page.slug}`,
      lastModified: page.updatedAt,
      changeFrequency: 'monthly' as const,
      priority: 0.6,
    })),
    ...categories.docs.map((category) => ({
      url: `${serverURL}/categories/${category.slug}`,
      lastModified: category.updatedAt,
      changeFrequency: 'weekly' as const,
      priority: 0.5,
    })),
    ...tags.docs.map((tag) => ({
      url: `${serverURL}/tags/${tag.slug}`,
      lastModified: tag.updatedAt,
      changeFrequency: 'weekly' as const,
      priority: 0.4,
    })),
  ]
}
