import config from '@payload-config'
import Link from 'next/link'
import {
  notFound,
  permanentRedirect,
  redirect,
} from 'next/navigation'
import { getPayload } from 'payload'

import { PostList, toPostListItems } from '@/components/posts/PostList'
import { CategorySelect } from '@/components/posts/CategorySelect'
import { getCategories } from '@/lib/posts/getCategories'

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 12

type Props = {
  searchParams: Promise<{
    p?: string | string[]
    page?: string | string[]
    category?: string | string[]
  }>
}

export default async function HomePage({ searchParams }: Props) {
  const payload = await getPayload({ config })
  const {
    p,
    page: pageParam,
    category: categoryParam,
  } = await searchParams
  const legacyID = Array.isArray(p) ? p[0] : p

  if (legacyID) {
    const wordpressId = Number(legacyID)
    if (!Number.isSafeInteger(wordpressId) || wordpressId <= 0) notFound()

    const legacy = await payload.find({
      collection: 'posts',
      limit: 1,
      overrideAccess: true,
      where: {
        and: [
          { 'legacy.wordpressId': { equals: wordpressId } },
          { _status: { equals: 'published' } },
        ],
      },
    })

    if (!legacy.docs[0]) notFound()
    permanentRedirect(`/articles/${legacy.docs[0].slug}`)
  }

  const selectedCategory = Array.isArray(categoryParam)
    ? categoryParam[0]
    : categoryParam

  if (selectedCategory) {
    redirect(`/category/${encodeURIComponent(selectedCategory)}`)
  }

  const requestedPage = Array.isArray(pageParam)
    ? pageParam[0]
    : pageParam
  const parsedPage = Number(requestedPage)
  const page =
    Number.isSafeInteger(parsedPage) && parsedPage >= 1 ? parsedPage : 1

  const [result, categories] = await Promise.all([
    payload.find({
      collection: 'posts',
      limit: PAGE_SIZE,
      page,
      overrideAccess: true,
      sort: '-publishedAt',
      where: { _status: { equals: 'published' } },
      depth: 1,
    }),
    getCategories(),
  ])

  if (page > 1 && page > result.totalPages) notFound()

  const posts = toPostListItems(result.docs)

  return (
    <>
      <section className="hero">
        <p className="muted">cleverblog.pl</p>
        <h1>Praktyczne notatki z prawdziwej pracy inżynierskiej.</h1>
        <p>Linux, Raspberry Pi i automatyka domowa — sprawdzone na produkcji.</p>

        <form action="/" className="category-filter" method="get">
          <label className="sr-only" htmlFor="category">
            Filtruj artykuły po kategorii
          </label>

          <span className="sr-only" id="category-filter-hint">
            Zmiana kategorii automatycznie otwiera wybraną kategorię.
          </span>

          <CategorySelect
            options={categories.map((category) => ({
              label: category.name,
              value: category.slug,
            }))}
          />

          <noscript>
            <button className="category-filter-fallback" type="submit">
              Pokaż
            </button>
          </noscript>
        </form>
      </section>

      <section aria-labelledby="latest-posts">
        <h2 className="section-heading" id="latest-posts">
          Najnowsze artykuły
        </h2>
        {posts.length > 0 ? (
          <PostList headingLevel={3} posts={posts} />
        ) : (
          <p className="muted">Brak artykułów na tej stronie.</p>
        )}
      </section>

      {result.totalPages > 1 ? (
        <nav aria-label="Stronicowanie artykułów" className="pagination">
          {page > 1 ? (
            <Link
              className="pagination-link"
              href={page === 2 ? '/' : `/?page=${page - 1}`}
            >
              ← Nowsze
            </Link>
          ) : null}
          <span className="muted">
            Strona {page} z {result.totalPages}
          </span>
          {result.hasNextPage ? (
            <Link className="pagination-link" href={`/?page=${page + 1}`}>
              Starsze →
            </Link>
          ) : null}
        </nav>
      ) : null}
    </>
  )
}
