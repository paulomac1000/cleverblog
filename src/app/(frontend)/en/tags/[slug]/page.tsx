import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { LanguageSwitcher } from '@/components/LanguageSwitcher'
import { findTagBySlug } from '@/lib/content/taxonomy'
import { listPublishedPosts } from '@/lib/content/posts'
import { articleUrl, homeUrl, tagUrl } from '@/i18n/urls'
import { t, tf } from '@/i18n/messages'
import { buildLocalizedMetadata } from '@/lib/seo/metadata'
import type { Locale } from '@/i18n/config'

export const dynamic = 'force-dynamic'

type Props = {
  params: Promise<{ slug: string }>
}

const locale: Locale = 'en'

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const tag = await findTagBySlug(locale, slug)
  if (!tag) {
    notFound()
  }

  return buildLocalizedMetadata({
    locale,
    canonicalPath: tagUrl(locale, slug),
    title: tag.name,
    description: `Articles tagged ${tag.name}.`,
    counterpartUrl: tagUrl('pl', slug),
  })
}

export default async function EnTagArchivePage({ params }: Props) {
  const { slug } = await params
  const tag = await findTagBySlug(locale, slug)
  if (!tag) {
    notFound()
  }

  const result = await listPublishedPosts(locale, { limit: 100 })
  const posts = result.docs.filter(
    (post) =>
      Array.isArray(post.tags) &&
      post.tags.some((tagRef) => typeof tagRef === 'object' && tagRef !== null && 'id' in tagRef && tagRef.id === tag.id),
  )

  return (
    <section>
      <h1>{tag.name}</h1>
      {posts.length > 0 ? (
        <ul>
          {posts.map((post) => (
            <li key={post.id}>
              <Link href={articleUrl(locale, post.slug)}>{post.title}</Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">{t(locale, 'archive.empty.tag')}</p>
      )}

      <LanguageSwitcher
        counterpartUrl={tagUrl('pl', tag.slug)}
        currentPath={tagUrl(locale, tag.slug)}
        locale={locale}
      />
    </section>
  )
}
