import config from '@payload-config'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getPayload } from 'payload'

export const dynamic = 'force-dynamic'

const serverURL = (process.env.NEXT_PUBLIC_SERVER_URL ?? 'http://localhost:3000').replace(/\/+$/, '')

type Props = {
  params: Promise<{ slug: string }>
}

const findTag = async (slug: string) => {
  const payload = await getPayload({ config })
  const result = await payload.find({
    collection: 'tags',
    depth: 0,
    limit: 1,
    overrideAccess: true,
    where: { slug: { equals: slug } },
  })

  return result.docs[0] ?? null
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const tag = await findTag(slug)

  if (!tag) {
    notFound()
  }

  return {
    title: tag.name,
    description: `Artykuły oznaczone tagiem ${tag.name}.`,
    alternates: {
      canonical: `${serverURL}/tags/${tag.slug}`,
    },
  }
}

export default async function TagArchivePage({ params }: Props) {
  const { slug } = await params
  const payload = await getPayload({ config })
  const tagResult = await payload.find({
    collection: 'tags',
    depth: 0,
    limit: 1,
    overrideAccess: true,
    where: { slug: { equals: slug } },
  })
  const tag = tagResult.docs[0]

  if (!tag) {
    notFound()
  }

  const posts = await payload.find({
    collection: 'posts',
    depth: 0,
    pagination: false,
    overrideAccess: true,
    sort: '-publishedAt',
    where: {
      and: [{ _status: { equals: 'published' } }, { tags: { equals: tag.id } }],
    },
  })

  return (
    <section>
      <h1>{tag.name}</h1>
      <ul>
        {posts.docs.map((post) => (
          <li key={post.id}>
            <Link href={`/articles/${post.slug}`}>{post.title}</Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
