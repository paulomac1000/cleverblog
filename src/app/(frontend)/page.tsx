import Link from 'next/link'
import config from '@payload-config'
import { notFound, permanentRedirect } from 'next/navigation'
import { getPayload } from 'payload'

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 12

type Props = {
  searchParams: Promise<{
    p?: string | string[]
    page?: string | string[]
  }>
}

export default async function HomePage({ searchParams }: Props) {
  const payload = await getPayload({ config })
  const { p, page: pageParam } = await searchParams
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

  const requestedPage = Array.isArray(pageParam)
    ? pageParam[0]
    : pageParam
  const parsedPage = Number(requestedPage)
  const page =
    Number.isSafeInteger(parsedPage) && parsedPage >= 1 ? parsedPage : 1

  const result = await payload.find({
    collection: 'posts',
    limit: PAGE_SIZE,
    page,
    overrideAccess: true,
    sort: '-publishedAt',
    where: { _status: { equals: 'published' } },
  })

  return (
    <>
      <section className="hero">
        <p className="muted">cleverblog.pl</p>
        <h1>Praktyczne notatki z prawdziwej pracy inżynierskiej.</h1>
        <p>Artykuły zachowują datę publikacji i osobny status ostatniej weryfikacji.</p>
      </section>
      <section className="posts" aria-label="Najnowsze artykuły">
        {result.docs.map((post) => (
          <Link className="card" href={`/articles/${post.slug}`} key={post.id}>
            {post.heroImage && typeof post.heroImage !== 'number' ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                alt={post.heroImage.alt}
                className="card-image"
                src={post.heroImage.url ?? undefined}
              />
            ) : null}
            <h2>{post.title}</h2>
            {post.excerpt ? <p>{post.excerpt}</p> : null}
          </Link>
        ))}
      </section>
      {result.totalPages > 1 ? (
        <nav aria-label="Stronicowanie artykułów" className="pagination">
          {page > 1 ? (
            <Link className="pagination-link" href={page === 2 ? '/' : `/?page=${page - 1}`}>
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
