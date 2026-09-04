import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { StaticPageBody } from '@/components/content/ArticleBody'
import {
  findPublishedPageBySlug,
  getPageCounterpart,
} from '@/lib/content/pages'
import { pageUrl } from '@/i18n/urls'
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
  const page = await findPublishedPageBySlug(locale, slug)

  if (!page) {
    notFound()
  }

  const counterpart = await getPageCounterpart(locale, slug)

  return buildLocalizedMetadata({
    locale,
    canonicalPath: pageUrl(locale, slug),
    title: page.title,
    description: page.excerpt || undefined,
    counterpartUrl: counterpart.enExists
      ? `${serverURL}${pageUrl('en', counterpart.enSlug ?? slug)}`
      : null,
  })
}

export default async function StaticPage({
  params,
}: Props) {
  const { slug } = await params
  const page = await findPublishedPageBySlug(locale, slug)

  if (!page) {
    notFound()
  }

  const counterpart = await getPageCounterpart(locale, slug)
  const counterpartUrl = counterpart.enExists
    ? pageUrl('en', counterpart.enSlug ?? slug)
    : null

  return (
    <>
      <StaticPageBody locale={locale} page={page} />
    </>
  )
}