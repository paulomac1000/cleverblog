import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { ArticleBody } from '@/components/content/ArticleBody'
import {
  findPublishedPostBySlug,
  getArticleCounterpart,
} from '@/lib/content/posts'
import { articleUrl } from '@/i18n/urls'
import { buildLocalizedMetadata, serverURL } from '@/lib/seo/metadata'
import type { Locale } from '@/i18n/config'

export const dynamic = 'force-dynamic'

type Props = {
  params: Promise<{
    slug: string
  }>
}

const locale: Locale = 'pl'

export async function generateMetadata({
  params,
}: Props): Promise<Metadata> {
  const { slug } = await params
  const post = await findPublishedPostBySlug(locale, slug)

  if (!post) {
    notFound()
  }

  const counterpart = await getArticleCounterpart(locale, slug)

  return buildLocalizedMetadata({
    locale,
    canonicalPath: articleUrl(locale, slug),
    title: post.title,
    description: post.excerpt || undefined,
    counterpartUrl: counterpart.enExists
      ? `${serverURL}${articleUrl('en', counterpart.enSlug ?? slug)}`
      : null,
  })
}

export default async function ArticlePage({
  params,
}: Props) {
  const { slug } = await params
  const post = await findPublishedPostBySlug(locale, slug)

  if (!post) {
    notFound()
  }

  const counterpart = await getArticleCounterpart(locale, slug)
  const counterpartUrl = counterpart.enExists
    ? articleUrl('en', counterpart.enSlug ?? slug)
    : null

  // renderHTML is the sanitized migration working copy. originalHTML remains
  // immutable migration provenance and is never rendered.
  return (
    <>
      <ArticleBody locale={locale} post={post} />
    </>
  )
}