import Link from 'next/link'
import config from '@payload-config'
import { notFound, permanentRedirect } from 'next/navigation'
import { getPayload } from 'payload'

export const dynamic = 'force-dynamic'

type Props = { searchParams: Promise<{ p?: string | string[] }> }

export default async function HomePage({ searchParams }: Props) {
  const payload = await getPayload({ config })
  const { p } = await searchParams
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

  const result = await payload.find({
    collection: 'posts',
    limit: 12,
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
            <h2>{post.title}</h2>
            {post.excerpt ? <p>{post.excerpt}</p> : null}
            <span className="muted">{post.verification?.status ?? 'needs-review'}</span>
          </Link>
        ))}
      </section>
    </>
  )
}
