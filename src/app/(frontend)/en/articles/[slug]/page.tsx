import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { ArticleBody } from '@/components/content/ArticleBody'
import {
  findPublishedPostBySlug,
  getArticleCounterpart,
} from '@/lib/content/posts'
import { articleUrl, homeUrl } from '@/i18n/urls'
import { buildLocalizedMetadata, serverURL } from '@/lib/seo/metadata'
import type { Locale } from '@/i18n/config'

export const dynamic = 'force-dynamic'

type Props = {
  params: Promise<{
    slug: string
  }>
}

const locale: Locale = 'en'

export async function generateMetadata({
  params,
}: Props): Promise<Metadata> {
  const { slug } = await params
  const post = await findPublishedPostBySlug(locale, slug)

  if (!post) {
    notFound()
  }

  // For EN pages, the PL counterpart ALWAYS exists (every PL-published post
  // has a PL slug) so we always emit the hreflang pair on EN articles.
  const counterpart = await getArticleCounterpart(locale, slug)

  return buildLocalizedMetadata({
    locale,
    canonicalPath: articleUrl(locale, slug),
    title: post.title,
    description: post.excerpt || undefined,
    counterpartUrl: counterpart.enExists
      ? `${serverURL}${articleUrl('pl', counterpart.enSlug ?? slug)}`
      : null,
  })
}

export default async function EnArticlePage({
  params,
}: Props) {
  const { slug } = await params
  const post = await findPublishedPostBySlug(locale, slug)

  // EN article 404s when no EN translation exists — never fall back to PL.
  if (!post) {
    notFound()
  }

  // Counterpart exists by construction (we just found the EN doc). Pass the
  // PL equivalent URL so the switcher renders a real link, not a disabled
  // state. This is safe because /en/articles/<en-slug> exists only when
  // the EN slug is present in the locale, and the PL locale always has a
  // counterpart slug.
  const counterpart = await getArticleCounterpart(locale, slug)
  const counterpartUrl = counterpart.enExists
    ? articleUrl('pl', counterpart.enSlug ?? slug)
    : null

  return (
    <>
      <ArticleBody locale={locale} post={post} />
    </>
  )
}