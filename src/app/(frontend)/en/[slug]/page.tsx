import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { StaticPageBody } from '@/components/content/ArticleBody'
import { LanguageSwitcher } from '@/components/LanguageSwitcher'
import { findPublishedPageBySlug, getPageCounterpart } from '@/lib/content/pages'
import { pageUrl } from '@/i18n/urls'
import { buildLocalizedMetadata } from '@/lib/seo/metadata'
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
      ? pageUrl('pl', counterpart.enSlug ?? slug)
      : null,
  })
}

export default async function EnStaticPage({
  params,
}: Props) {
  const { slug } = await params
  const page = await findPublishedPageBySlug(locale, slug)

  if (!page) {
    notFound()
  }

  const counterpart = await getPageCounterpart(locale, slug)
  const counterpartUrl = counterpart.enExists
    ? pageUrl('pl', counterpart.enSlug ?? slug)
    : null

  return (
    <>
      <LanguageSwitcher
        counterpartUrl={counterpartUrl}
        currentPath={pageUrl(locale, slug)}
        locale={locale}
      />
      <StaticPageBody locale={locale} page={page} />
    </>
  )
}
