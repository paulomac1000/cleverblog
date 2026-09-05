import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'

import { PostList, toPostListItems } from '@/components/posts/PostList'
import { CategorySelect } from '@/components/posts/CategorySelect'
import { listPublishedPosts } from '@/lib/content/posts'
import { listCategories } from '@/lib/content/taxonomy'
import { homeUrl, localePath } from '@/i18n/urls'
import { t, tf } from '@/i18n/messages'
import { buildLocalizedMetadata, serverURL } from '@/lib/seo/metadata'
import type { Locale } from '@/i18n/config'

export const dynamic = 'force-dynamic'

type Props = {
  searchParams: Promise<{
    page?: string | string[]
    category?: string | string[]
  }>
}

const locale: Locale = 'en'

export async function generateMetadata(): Promise<Metadata> {
  return buildLocalizedMetadata({
    locale,
    canonicalPath: homeUrl(locale),
    title: 'CleverBlog',
    description: 'Practical engineering notes, verified on real systems.',
    counterpartUrl: `${serverURL}${homeUrl('pl')}`,
  })
}

export default async function EnHomePage({ searchParams }: Props) {
  const { page: pageParam, category: categoryParam } = await searchParams

  const selectedCategory = Array.isArray(categoryParam)
    ? categoryParam[0]
    : categoryParam

  if (selectedCategory) {
    redirect(
      localePath(locale, `/category/${encodeURIComponent(selectedCategory)}`),
    )
  }

  const requestedPage = Array.isArray(pageParam)
    ? pageParam[0]
    : pageParam
  const parsedPage = Number(requestedPage)
  const page =
    Number.isSafeInteger(parsedPage) && parsedPage >= 1 ? parsedPage : 1

  const [result, categories] = await Promise.all([
    listPublishedPosts(locale, { page }),
    listCategories(locale),
  ])

  if (page > 1 && page > result.totalPages) notFound()

  const posts = toPostListItems(result.docs)
  const isEmpty = posts.length === 0

  return (
    <>
      <section className="hero">
        <p className="muted">{t(locale, 'home.hero.tagline')}</p>
        <h1>{t(locale, 'home.hero.heading')}</h1>
        <p>{t(locale, 'home.hero.lead')}</p>

        {categories.length > 0 && (
        <form
          action={homeUrl(locale)}
          className="category-filter"
          method="get"
        >
          <label className="sr-only" htmlFor="category">
            {t(locale, 'home.hero.categoryFilter.label')}
          </label>
          <span className="sr-only" id="category-filter-hint">
            {t(locale, 'home.hero.categoryFilter.hint')}
          </span>
          <CategorySelect
            allLabel={t(locale, 'categorySelect.all')}
            ariaLabel={t(locale, 'categorySelect.ariaLabel')}
            options={categories.map((category) => ({
              label: category.name,
              value: category.slug,
            }))}
          />
          <noscript>
            <button className="category-filter-fallback" type="submit">
              {t(locale, 'home.hero.categoryFilter.submit')}
            </button>
          </noscript>
        </form>
        )}
      </section>

      <section aria-labelledby="latest-posts">
        <h2 className="section-heading" id="latest-posts">
          {t(locale, 'home.latest.heading')}
        </h2>

        {isEmpty ? (
          <div className="locale-empty">
            <p>{t(locale, 'home.empty.locale.heading')}</p>
            <p>{t(locale, 'home.empty.locale.body')}</p>
            <p>
              <Link href={homeUrl('pl')}>
                {t(locale, 'home.empty.locale.cta')}
              </Link>
            </p>
          </div>
        ) : (
          <PostList headingLevel={3} locale={locale} posts={posts} />
        )}
      </section>

      {!isEmpty && result.totalPages > 1 ? (
        <nav
          aria-label={t(locale, 'pagination.aria.en.articles')}
          className="pagination"
        >
          {page > 1 ? (
            <Link
              className="pagination-link"
              href={
                page === 2
                  ? homeUrl(locale)
                  : `${homeUrl(locale)}?page=${page - 1}`
              }
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
              href={`${homeUrl(locale)}?page=${page + 1}`}
            >
              {t(locale, 'pagination.next')}
            </Link>
          ) : null}
        </nav>
      ) : null}
    </>
  )
}