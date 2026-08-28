import Link from 'next/link'
import config from '@payload-config'
import { getPayload } from 'payload'

export const dynamic = 'force-dynamic'

export default async function HomePage() {
  const payload = await getPayload({ config })
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
