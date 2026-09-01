import Link from 'next/link'
import config from '@payload-config'
import { notFound, permanentRedirect } from 'next/navigation'
import { getPayload } from 'payload'

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 12

const SECTION_ORDER = [
  { key: 'linux', label: 'Linux & CLI' },
  { key: 'domoticz', label: 'Domotyka' },
  { key: 'home-assistant', label: 'Domotyka' },
  { key: 'raspberry', label: 'Raspberry & sprzęt' },
  { key: 'python', label: 'Raspberry & sprzęt' },
  { key: 'mikr-us', label: 'Sieć & VPS' },
] as const

type SectionedPost = {
  id: number
  title: string
  slug: string
  excerpt?: string | null
  heroAlt?: string | null
  heroUrl?: string | null
  section: string
  publishedAt?: string | null
}

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
    depth: 1,
  })

  const sectioned: SectionedPost[] = result.docs.map((post) => {
    const categories = Array.isArray(post.categories)
      ? post.categories
      : []

    const categorySlugs = categories
      .map((c) => (typeof c === 'object' && c !== null ? c.slug : null))
      .filter((s): s is string => typeof s === 'string')

    let section = 'Inne'
    for (const rule of SECTION_ORDER) {
      if (categorySlugs.includes(rule.key)) {
        section = rule.label
        break
      }
    }

    const hero =
      post.heroImage && typeof post.heroImage !== 'number'
        ? post.heroImage
        : null

    return {
      id: post.id,
      title: post.title,
      slug: post.slug,
      excerpt: post.excerpt,
      heroAlt: hero?.alt ?? null,
      heroUrl: hero?.url ?? null,
      section,
      publishedAt: post.publishedAt,
    }
  })

  const sections = new Map<string, SectionedPost[]>()
  for (const post of sectioned) {
    const list = sections.get(post.section) ?? []
    list.push(post)
    sections.set(post.section, list)
  }

  return (
    <>
      <section className="hero">
        <p className="muted">cleverblog.pl</p>
        <h1>Praktyczne notatki z prawdziwej pracy inżynierskiej.</h1>
        <p>Linux, Raspberry Pi i automatyka domowa — sprawdzone na produkcji.</p>
      </section>
      {result.docs.length === 0 ? (
        <p className="muted">Brak artykułów na tej stronie.</p>
      ) : null}
      {[...sections.entries()].map(([label, posts]) => (
        <section aria-label={label} key={label}>
          <h2 className="section-heading">{label}</h2>
          <div className="posts">
            {posts.map((post) => (
              <Link
                className="card"
                href={`/articles/${post.slug}`}
                key={post.id}
              >
                {post.heroUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    alt={post.heroAlt ?? ''}
                    className="card-image"
                    src={post.heroUrl}
                  />
                ) : null}
                <div className="card-body">
                  <h3>{post.title}</h3>
                  {post.excerpt ? <p>{post.excerpt}</p> : null}
                  <span className="card-category">{label}</span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      ))}
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
