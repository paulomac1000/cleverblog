import type { Metadata } from 'next'
import Link from 'next/link'
import {
  notFound,
  permanentRedirect,
  redirect,
} from 'next/navigation'

import { ArticleDiscovery } from '@/components/posts/ArticleDiscovery'
import { PostList, toPostListItems } from '@/components/posts/PostList'
import { CategorySelect } from '@/components/posts/CategorySelect'
import {
  findPostByLegacyWordpressId,
  listPublishedPosts,
} from '@/lib/content/posts'
import { listCategories, listPopularTags } from '@/lib/content/taxonomy'
import { articleUrl, homeUrl, localePath } from '@/i18n/urls'
import { t, tf } from '@/i18n/messages'
import { parsePageParam } from '@/lib/pagination'
import { buildLocalizedMetadata, serverURL } from '@/lib/seo/metadata'
import type { Locale } from '@/i18n/config'

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 100

type Props = {
  searchParams: Promise<{
    p?: string | string[]
    page?: string | string[]
    category?: string | string[]
    q?: string | string[]
  }>
}

const locale: Locale = 'pl'

export async function generateMetadata({
  searchParams,
}: Props): Promise<Metadata> {
  const { page: pageParam } = await searchParams
  const page = parsePageParam(pageParam)

  return buildLocalizedMetadata({
    locale,
    canonicalPath: homeUrl(locale, page),
    title: 'CleverBlog',
    description: 'Practical engineering notes, verified on real systems.',
    counterpartUrl: `${serverURL}${homeUrl('en', page)}`,
  })
}

export default async function HomePage({ searchParams }: Props) {
  const {
    p,
    page: pageParam,
    category: categoryParam,
    q: queryParam,
  } = await searchParams
  const legacyID = Array.isArray(p) ? p[0] : p

  if (legacyID) {
    const wordpressId = Number(legacyID)
    if (!Number.isSafeInteger(wordpressId) || wordpressId <= 0) notFound()

    const legacy = await findPostByLegacyWordpressId(locale, wordpressId)
    if (!legacy) notFound()
    permanentRedirect(articleUrl(locale, legacy.slug))
  }

  const selectedCategory = Array.isArray(categoryParam)
    ? categoryParam[0]
    : categoryParam

  if (selectedCategory) {
    redirect(localePath(locale, `/category/${encodeURIComponent(selectedCategory)}`))
  }

  const page = parsePageParam(pageParam)
  const initialQuery = Array.isArray(queryParam)
    ? queryParam[0] ?? ''
    : queryParam ?? ''

  const [result, categories, popularTags] = await Promise.all([
    listPublishedPosts(locale, { page, limit: PAGE_SIZE }),
    listCategories(locale),
    listPopularTags(locale),
  ])

  if (page > 1 && page > result.totalPages) notFound()

  const posts = toPostListItems(result.docs)

  return (
    <>
      <section className="hero">
        <p className="muted">{t(locale, 'home.hero.tagline')}</p>
        <h1>{t(locale, 'home.hero.heading')}</h1>
        <p>{t(locale, 'home.hero.lead')}</p>

        {categories.length > 0 && (
        <form action={homeUrl(locale)} className="category-filter" method="get">
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
        {posts.length > 0 ? (
          <ArticleDiscovery
            initialQuery={initialQuery}
            locale={locale}
            popularTags={popularTags}
            strings={{
              searchLabel: t(locale, 'home.discovery.searchLabel'),
              searchPlaceholder: t(locale, 'home.discovery.searchPlaceholder'),
              popularTagsLabel: t(locale, 'home.discovery.popularTagsLabel'),
              resultsTemplate: t(locale, 'home.discovery.resultsTemplate'),
              emptyTemplate: t(locale, 'home.discovery.emptyTemplate'),
            }}
            totalCount={posts.length}
          >
            <PostList headingLevel={3} locale={locale} posts={posts} />
          </ArticleDiscovery>
        ) : (
          <p className="muted">{t(locale, 'home.empty.page')}</p>
        )}
      </section>

      {result.totalPages > 1 ? (
        <nav
          aria-label={t(locale, 'pagination.aria.articles')}
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
