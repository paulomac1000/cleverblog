import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { findTagBySlug, getTagCounterpart } from '@/lib/content/taxonomy'
import { tagUrl } from '@/i18n/urls'
import { t, tf } from '@/i18n/messages'
import { buildLocalizedMetadata, serverURL } from '@/lib/seo/metadata'
import config from '@payload-config'
import { getPayload } from 'payload'
import type { Locale } from '@/i18n/config'

export const dynamic = 'force-dynamic'

type Props = {
  params: Promise<{ slug: string }>
}

const locale: Locale = 'pl'

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const tag = await findTagBySlug(locale, slug)

  if (!tag) {
    notFound()
  }
  const tagCounterpart = await getTagCounterpart(locale, slug)

  const tagCounterpartMeta = await getTagCounterpart(locale, slug)
  const enUrl =
    tagCounterpartMeta.enExists && tagCounterpartMeta.enSlug
      ? `${serverURL}${tagUrl('en', tagCounterpartMeta.enSlug)}`
      : null

  return buildLocalizedMetadata({
    locale,
    canonicalPath: tagUrl(locale, slug),
    title: tag.name,
    description: tf(locale, 'tag.heading')(tag.name),
    counterpartUrl: enUrl,
  })
}

export default async function TagArchivePage({ params }: Props) {
  const { slug } = await params
  const tag = await findTagBySlug(locale, slug)
  if (!tag) {
    notFound()
  }
  const tagCounterpart = await getTagCounterpart(locale, slug)

  const payload = await getPayload({ config })
  const posts = await payload.find({
    collection: 'posts',
    depth: 0,
    pagination: false,
    overrideAccess: true,
    locale: 'pl',
    sort: '-publishedAt',
    where: {
      and: [{ _status: { equals: 'published' } }, { tags: { equals: tag.id } }],
    },
  })

  return (
    <section>
      <h1>{tag.name}</h1>
      <ul>
        {posts.docs.map((post) => (
          <li key={post.id}>
            <Link href={`/articles/${post.slug}`}>{post.title}</Link>
          </li>
        ))}
      </ul>
    </section>
  )
}