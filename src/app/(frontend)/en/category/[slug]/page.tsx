import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { PostList, toPostListItems } from '@/components/posts/PostList'
import { findCategoryBySlug } from '@/lib/content/taxonomy'
import { listPublishedPosts } from '@/lib/content/posts'
import { categoryUrl, homeUrl } from '@/i18n/urls'
import { t, tf } from '@/i18n/messages'
import { buildLocalizedMetadata } from '@/lib/seo/metadata'
import type { Locale } from '@/i18n/config'

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 12

type Props = {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ page?: string | string[] }>
}

const locale: Locale = 'en'

const parsePage = (value?: string | string[]) => {
  const raw = Array.isArray(value) ? value[0] : value
  const parsed = Number(raw)
  return Number.isSafeInteger(parsed) && parsed >= 1 ? parsed : 1
}

export async function generateMetadata({
  params,
  searchParams,
}: Props): Promise<Metadata> {
  const [{ slug }, { page: pageParam }] = await Promise.all([params, searchParams])
  const category = await findCategoryBySlug(locale, slug)
  if (!category) {
    notFound()
  }

  const page = parsePage(pageParam)

  return buildLocalizedMetadata({
    locale,
    canonicalPath: categoryUrl(locale, slug, page),
    title: category.name,
    description: category.description?.trim() || `Articles in ${category.name}.`,
    counterpartUrl: `${categoryUrl('pl', slug, page)}`,
  })
}

export default async function EnCategoryArchivePage({
  params,
  searchParams,
}: Props) {
  const [{ slug }, { page: pageParam }] = await Promise.all([params, searchParams])
  const page = parsePage(pageParam)
  const category = await findCategoryBySlug(locale, slug)
  if (!category) {
    notFound()
  }

  const result = await listPublishedPosts(locale, {
    page,
    categoryId: category.id,
  })

  if (page > 1 && page > result.totalPages) {
    notFound()
  }

  const posts = toPostListItems(result.docs)

  return (
    <>
      <header className="archive-header">
        <p className="muted">
          <Link href={homeUrl(locale)}>
            {t(locale, 'archive.breadcrumb.all')}
          </Link>{' '}
          / {t(locale, 'archive.breadcrumb.category')}
        </p>
        <h1>{category.name}</h1>
        {category.description ? <p>{category.description}</p> : null}
      </header>

      {posts.length > 0 ? (
        <PostList headingLevel={3} locale={locale} posts={posts} />
      ) : (
        <p className="muted">{t(locale, 'archive.empty.category')}</p>
      )}

      {result.totalPages > 1 ? (
        <nav
          aria-label={tf(locale, 'pagination.aria.en.category')(category.name)}
          className="pagination"
        >
          {page > 1 ? (
            <Link
              className="pagination-link"
              href={categoryUrl(locale, category.slug, page - 1)}
            >
              {t(locale, 'pagination.prev')}
            </Link>
          ) : null}
          <span className="muted">
            {tf(locale, 'pagination.status')(page, result.totalPages)}
          </span>
          {result.hasNextPage ? (
            <Link
              className="pagination-link"
              href={categoryUrl(locale, category.slug, page + 1)}
            >
              {t(locale, 'pagination.next')}
            </Link>
          ) : null}
        </nav>
      ) : null}
    </>
  )
}
