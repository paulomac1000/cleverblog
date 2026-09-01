import config from '@payload-config'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getPayload } from 'payload'

import { PostList, toPostListItems } from '@/components/posts/PostList'

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 12
const serverURL = (
  process.env.NEXT_PUBLIC_SERVER_URL ?? 'http://localhost:3000'
).replace(/\/+$/, '')

type Props = {
  params: Promise<{ slug: string }>
  searchParams: Promise<{
    page?: string | string[]
  }>
}

const parsePage = (value?: string | string[]) => {
  const raw = Array.isArray(value) ? value[0] : value
  const parsed = Number(raw)

  return Number.isSafeInteger(parsed) && parsed >= 1 ? parsed : 1
}

const findCategory = async (slug: string) => {
  const payload = await getPayload({ config })
  const result = await payload.find({
    collection: 'categories',
    depth: 0,
    limit: 1,
    overrideAccess: true,
    where: { slug: { equals: slug } },
  })

  return result.docs[0] ?? null
}

const categoryURL = (slug: string, page: number) =>
  `${serverURL}/category/${slug}${page > 1 ? `?page=${page}` : ''}`

export async function generateMetadata({
  params,
  searchParams,
}: Props): Promise<Metadata> {
  const [{ slug }, { page: pageParam }] = await Promise.all([
    params,
    searchParams,
  ])
  const category = await findCategory(slug)

  if (!category) {
    notFound()
  }

  const page = parsePage(pageParam)
  const description =
    category.description?.trim() || `Artykuły w kategorii ${category.name}.`

  return {
    title: category.name,
    description,
    alternates: {
      canonical: categoryURL(category.slug, page),
    },
  }
}

export default async function CategoryArchivePage({
  params,
  searchParams,
}: Props) {
  const [{ slug }, { page: pageParam }] = await Promise.all([
    params,
    searchParams,
  ])
  const page = parsePage(pageParam)
  const payload = await getPayload({ config })
  const categoryResult = await payload.find({
    collection: 'categories',
    depth: 0,
    limit: 1,
    overrideAccess: true,
    where: { slug: { equals: slug } },
  })
  const category = categoryResult.docs[0]

  if (!category) {
    notFound()
  }

  const result = await payload.find({
    collection: 'posts',
    depth: 1,
    limit: PAGE_SIZE,
    page,
    overrideAccess: true,
    sort: '-publishedAt',
    where: {
      and: [
        { _status: { equals: 'published' } },
        { categories: { equals: category.id } },
      ],
    },
  })

  if (page > 1 && page > result.totalPages) {
    notFound()
  }

  const posts = toPostListItems(result.docs)

  return (
    <>
      <header className="archive-header">
        <p className="muted">
          <Link href="/">Wszystkie artykuły</Link> / Kategoria
        </p>
        <h1>{category.name}</h1>
        {category.description ? <p>{category.description}</p> : null}
      </header>

      {posts.length > 0 ? (
        <PostList posts={posts} />
      ) : (
        <p className="muted">Brak artykułów w tej kategorii.</p>
      )}

      {result.totalPages > 1 ? (
        <nav
          aria-label={`Stronicowanie kategorii ${category.name}`}
          className="pagination"
        >
          {page > 1 ? (
            <Link
              className="pagination-link"
              href={
                page === 2
                  ? `/category/${category.slug}`
                  : `/category/${category.slug}?page=${page - 1}`
              }
            >
              ← Nowsze
            </Link>
          ) : null}
          <span className="muted">
            Strona {page} z {result.totalPages}
          </span>
          {result.hasNextPage ? (
            <Link
              className="pagination-link"
              href={`/category/${category.slug}?page=${page + 1}`}
            >
              Starsze →
            </Link>
          ) : null}
        </nav>
      ) : null}
    </>
  )
}
